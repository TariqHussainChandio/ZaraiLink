import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Role } from '../constants/roles';
import { fetchOwnProfile } from '../services/modules/auth/profileLoader';
import { supabase } from '../services/supabase/client';
import type { Profile } from '../types/profile';
import { logger } from '../utils/logger';

// 'passwordRecovery': the user tapped a password-reset email link. A real session now exists
// (via exchangeCodeForSession below) but they haven't set a new password yet — RootNavigator
// routes this status to ResetPasswordScreen instead of the normal authenticated app shell.
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'suspended' | 'passwordRecovery';

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
      if (cancelled) return;

      set({
        session,
        user: session.user,
        profile,
        role: profile?.role ?? null,
        status: profile?.is_suspended ? 'suspended' : 'authenticated',
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
    set({ profile, role: profile?.role ?? null });
  },
}));
