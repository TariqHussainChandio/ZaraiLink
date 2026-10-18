import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Role } from '../common/constants/roles';
import { fetchOwnProfile, ProfileReadError, type ProfileReadFailure } from './profileLoader';
import { forgetRememberedProfile, recallProfile, rememberProfile, type RememberedProfile } from './rememberedProfile';
import { useNetworkStore } from './networkStore';
import { supabase } from '../services/supabase/client';
import type { Profile } from '../common/types/profile';
import { logger } from '../utils/logger';

// 'passwordRecovery': the user tapped a password-reset email link. A real session now exists
// (via exchangeCodeForSession below) but they haven't set a new password yet — RootNavigator
// routes this status to ResetPasswordScreen instead of the normal authenticated app shell.
// 'awaitingApproval': a dealer or expert whose application is pending or rejected. They see only the Application
// Status screen (decision D10; SRDS §8, §11). 'approvalGranted': the application was approved while they were signed
// in; SRDS §8 has them sign in again before using their role, and the API refuses the old session (`sign_in_again`).
type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'suspended'
  | 'passwordRecovery'
  | 'awaitingApproval'
  | 'approvalGranted'
  // An admin with an authenticator who has signed in with the password only: every admin write needs the second
  // factor (aal2), so the code is asked for before the console opens (A3a verification, H1).
  | 'secondFactor'
  // Signed in, but the profile that decides the shell could not be read and none is remembered for this user on the
  // device (offline cold start), or the server refused or failed the read. The app shows that it cannot check the
  // account, with Retry; it never guesses a role (B4 verification, F1: an offline dealer used to land in the buyer shell).
  | 'accountUnavailable';

/** Why the account could not be checked, while the status is 'accountUnavailable'. */
type AccountUnavailableReason = ProfileReadFailure;

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  status: AuthStatus;
  /** Set only while the status is 'accountUnavailable'. */
  unavailableReason: AccountUnavailableReason | null;
  /**
   * The remembered account facts the shell was opened from while the server could not be reached (`profile` is then
   * null). Read the account through `selectAccount`, which prefers the server profile.
   */
  deviceAccount: RememberedProfile | null;
  /** Subscribes to Supabase auth state; call once on app mount. Returns an unsubscribe fn. */
  initialize: () => () => void;
  signOut: () => Promise<void>;
  /** Re-fetches the current user's profile row, e.g. after Edit Profile saves. */
  refreshProfile: () => Promise<void>;
}

/** The account fields that decide the shell; a server profile and a remembered one both carry them. */
type AccountFacts = Pick<Profile, 'role' | 'account_status' | 'is_suspended'>;

/** The status a signed-in user's profile puts them in: suspension first, then an application still waiting. */
function statusFor(account: AccountFacts): AuthStatus {
  if (account.is_suspended) return 'suspended';
  if (
    (account.role === 'dealer' || account.role === 'expert') &&
    (account.account_status === 'pending' || account.account_status === 'rejected')
  ) {
    return 'awaitingApproval';
  }
  return 'authenticated';
}

/** True when the account has a verified authenticator but this session has not used it yet (aal1, next aal2). */
async function needsSecondFactor(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
  } catch (err) {
    logger.warn('authStore: could not read the assurance level', err);
    return false;
  }
}

type ProfileResult =
  | { source: 'server'; profile: Profile }
  | { source: 'device'; remembered: RememberedProfile }
  | { source: 'none'; reason: AccountUnavailableReason };

/**
 * Reads the profile from the server and remembers it on the device. Only a read that got no response at all falls back
 * to the remembered copy, and only to this same user's: a 401 or 403 means the server does not accept the session, so
 * the device must not answer for it.
 */
async function resolveProfile(userId: string): Promise<ProfileResult> {
  let profile: Profile;
  try {
    profile = await fetchOwnProfile(userId);
  } catch (err) {
    logger.warn('authStore: failed to load profile', err);
    const reason: ProfileReadFailure = err instanceof ProfileReadError ? err.reason : 'failed';
    if (reason !== 'offline') return { source: 'none', reason };
    const remembered = await recallProfile(userId);
    return remembered ? { source: 'device', remembered } : { source: 'none', reason };
  }
  try {
    await rememberProfile(profile);
  } catch (err) {
    logger.warn('authStore: could not remember the profile', err);
  }
  return { source: 'server', profile };
}

type ShellState = Pick<AuthState, 'profile' | 'role' | 'status' | 'unavailableReason' | 'deviceAccount'>;

/**
 * The shell a profile result opens. A remembered profile sets the role and status only: the personal fields were never
 * written to the device, so `profile` stays null until the server answers.
 */
async function shellStateFor(result: ProfileResult): Promise<ShellState> {
  if (result.source === 'none') {
    return { profile: null, role: null, status: 'accountUnavailable', unavailableReason: result.reason, deviceAccount: null };
  }
  const account = result.source === 'server' ? result.profile : result.remembered;
  const secondFactor = account.role === 'admin' && !account.is_suspended && (await needsSecondFactor());
  return {
    profile: result.source === 'server' ? result.profile : null,
    role: account.role,
    status: secondFactor ? 'secondFactor' : statusFor(account),
    unavailableReason: null,
    deviceAccount: result.source === 'device' ? result.remembered : null,
  };
}

const SIGNED_OUT: Pick<AuthState, 'session' | 'user' | 'status' | keyof ShellState> = {
  session: null,
  user: null,
  profile: null,
  role: null,
  status: 'unauthenticated',
  unavailableReason: null,
  deviceAccount: null,
};

/** Statuses in which a signed-in user's shell has been decided from a profile. */
const OPEN_SHELLS = new Set<AuthStatus>(['authenticated', 'suspended', 'awaitingApproval', 'approvalGranted', 'secondFactor']);

/**
 * The signed-in account's role, application status and suspension: the server profile when there is one, otherwise
 * the copy remembered on the device that an offline start opened the shell from. Use it for any check of approval or
 * suspension, so an approved dealer who started offline still reaches the inventory system (B4 verification, F1).
 */
export function selectAccount(state: Pick<AuthState, 'profile' | 'deviceAccount'>): AccountFacts | null {
  return state.profile ?? state.deviceAccount;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  role: null,
  status: 'loading',
  unavailableReason: null,
  deviceAccount: null,

  initialize: () => {
    let cancelled = false;

    const applySession = async (session: Session | null) => {
      if (!session) {
        if (!cancelled) set(SIGNED_OUT);
        return;
      }

      const result = await resolveProfile(session.user.id);
      const current = get();
      // A later auth event (a token refresh) for the user whose shell is already open, during a network drop: the shell
      // decided earlier stands, rather than being replaced by the device copy or closed for want of a profile.
      const offlineRead = result.source === 'device' || (result.source === 'none' && result.reason === 'offline');
      if (offlineRead && current.user?.id === session.user.id && OPEN_SHELLS.has(current.status)) {
        if (!cancelled) set({ session, user: session.user });
        return;
      }
      const shell = await shellStateFor(result);
      if (cancelled) return;
      set({ session, user: session.user, ...shell });
    };

    // getSession() can hit the network (refreshing an expired token), and applySession does
    // its own network call — both need a catch so a failure (offline, unreachable Supabase
    // host) can't surface as an unhandled promise rejection or leave status stuck on 'loading'.
    supabase.auth
      .getSession()
      .then(({ data }) => applySession(data.session))
      .catch(err => {
        logger.warn('authStore: failed to restore session', err);
        if (!cancelled) set(SIGNED_OUT);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // P4 (4B.4): a password-reset code is now verified via VerifyOtpScreen
      // (verifyOtp({ type: 'recovery' })), not a deep link — that call itself fires this same
      // PASSWORD_RECOVERY event once Supabase issues the recovery session, so this branch needs
      // no change; only the deep-link plumbing that used to be the other way of reaching it is
      // gone. Route to ResetPasswordScreen instead of applySession, which would otherwise grant
      // full app access via the recovery session before the user has actually set a new password.
      if (event === 'PASSWORD_RECOVERY' && session) {
        if (!cancelled) {
          set({ session, user: session.user, status: 'passwordRecovery' });
        }
        return;
      }
      applySession(session).catch(err => {
        logger.warn('authStore: failed to apply auth state change', err);
      });
    });

    // The connection is back: read the profile again, once, so a shell opened offline from the remembered profile (or
    // the "can't check your account" state) follows the server without a relaunch: a withdrawn approval, a suspension.
    const unsubscribeNetwork = useNetworkStore.subscribe((state, previous) => {
      if (cancelled || !previous.isOffline || state.isOffline || !get().user) return;
      get()
        .refreshProfile()
        .catch(err => logger.warn('authStore: failed to reload the profile on reconnect', err));
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      unsubscribeNetwork();
    };
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      set(SIGNED_OUT);
      // The persisted cache's own wipe (frontend/hooks/queryClient.ts) forgets it too; this does not depend on that
      // listener being connected. A remembered approved dealer must never outlive the sign-out.
      await forgetRememberedProfile().catch(err => logger.warn('authStore: could not forget the profile', err));
    }
  },

  refreshProfile: async () => {
    const userId = get().user?.id;
    if (!userId) return;
    const result = await resolveProfile(userId);
    const next = await shellStateFor(result);
    // Signed out, or another account signed in, while the read was in flight: this answer belongs to no one now.
    if (get().user?.id !== userId) return;
    const current = get().status;
    // Only a signed-in shell follows the profile; a password reset or a sign-out in progress keeps its own status.
    if (current === 'passwordRecovery' || current === 'unauthenticated' || current === 'loading') {
      if (result.source === 'server') set({ profile: result.profile, role: result.profile.role, deviceAccount: null });
      return;
    }
    if (current === 'accountUnavailable') {
      set(next);
      return;
    }
    if (result.source === 'none') {
      // The server refused the session: the shell closes. A failed or offline read keeps the shell already decided;
      // the remembered copy is never newer than it, so a shell open from the server is not replaced by it either.
      if (result.reason === 'refused') set(next);
      return;
    }
    if (result.source === 'device') return;
    let status = next.status;
    // Approved while waiting (or already asked to sign in again): they sign in again before the dashboard opens (SRDS §8).
    if (status === 'authenticated' && (current === 'awaitingApproval' || current === 'approvalGranted')) {
      status = 'approvalGranted';
    }
    set({ ...next, status });
  },
}));
