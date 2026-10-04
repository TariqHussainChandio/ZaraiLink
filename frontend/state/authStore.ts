import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Role } from '../common/constants/roles';
import { fetchOwnProfile } from './profileLoader';
import { supabase } from '../services/supabase/client';
import type { Profile } from '../common/types/profile';
import { logger } from '../utils/logger';

// 'passwordRecovery': the user tapped a password-reset email link. A real session now exists
// (via exchangeCodeForSession below) but they haven't set a new password yet — RootNavigator
// routes this status to ResetPasswordScreen instead of the normal authenticated app shell.
// 'awaitingApproval': a dealer or expert whose application is pending or rejected. They see only the Application
// Status screen (decision D10; SRDS §8, §11). 'approvalGranted': the application was approved while they were signed
// in; SRDS §8 has them sign in again before using their role, and the API refuses the old session (`sign_in_again`).
export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'suspended'
  | 'passwordRecovery'
  | 'awaitingApproval'
  | 'approvalGranted'
  // An admin with an authenticator who has signed in with the password only: every admin write needs the second
  // factor (aal2), so the code is asked for before the console opens (A3a verification, H1).
  | 'secondFactor';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  status: AuthStatus;
  /** Subscribes to Supabase auth state; call once on app mount. Returns an unsubscribe fn. */
  initialize: () => () => void;
  signOut: () => Promise<void>;
  /** Re-fetches the current user's profile row, e.g. after Edit Profile saves. */
  refreshProfile: () => Promise<void>;
}

/** The status a signed-in user's profile puts them in: suspension first, then an application still waiting. */
function statusFor(profile: Profile | null): AuthStatus {
  if (profile?.is_suspended) return 'suspended';
  if (
    (profile?.role === 'dealer' || profile?.role === 'expert') &&
    (profile.account_status === 'pending' || profile.account_status === 'rejected')
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

async function loadProfile(userId: string): Promise<Profile | null> {
  try {
    return await fetchOwnProfile(userId);
  } catch (err) {
    // A failed read (row missing, or a network failure that throws instead of resolving to { error }) leaves the
    // user signed in without a profile rather than crashing the session bootstrap.
    logger.warn('authStore: failed to load profile', err);
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  role: null,
  status: 'loading',

  initialize: () => {
    let cancelled = false;

    const applySession = async (session: Session | null) => {
      if (!session) {
        if (!cancelled) {
          set({ session: null, user: null, profile: null, role: null, status: 'unauthenticated' });
        }
        return;
      }

      const profile = await loadProfile(session.user.id);
      const secondFactor = profile?.role === 'admin' && !profile.is_suspended && (await needsSecondFactor());
      if (cancelled) return;

      set({
        session,
        user: session.user,
        profile,
        role: profile?.role ?? null,
        status: secondFactor ? 'secondFactor' : statusFor(profile),
      });
    };

    // getSession() can hit the network (refreshing an expired token), and applySession does
    // its own network call — both need a catch so a failure (offline, unreachable Supabase
    // host) can't surface as an unhandled promise rejection or leave status stuck on 'loading'.
    supabase.auth
      .getSession()
      .then(({ data }) => applySession(data.session))
      .catch(err => {
        logger.warn('authStore: failed to restore session', err);
        if (!cancelled) {
          set({ session: null, user: null, profile: null, role: null, status: 'unauthenticated' });
        }
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

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, role: null, status: 'unauthenticated' });
  },

  refreshProfile: async () => {
    const userId = get().user?.id;
    if (!userId) return;
    const profile = await loadProfile(userId);
    const current = get().status;
    // Only a signed-in shell follows the profile; a password reset or a sign-out in progress keeps its own status.
    if (current === 'passwordRecovery' || current === 'unauthenticated' || current === 'loading') {
      set({ profile, role: profile?.role ?? null });
      return;
    }
    let status = statusFor(profile);
    // Approved while waiting (or already asked to sign in again): they sign in again before the dashboard opens (SRDS §8).
    if (status === 'authenticated' && (current === 'awaitingApproval' || current === 'approvalGranted')) {
      status = 'approvalGranted';
    }
    set({ profile, role: profile?.role ?? null, status });
  },
}));
