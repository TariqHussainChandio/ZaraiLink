import type { Session, User } from '@supabase/supabase-js';
import { Alert, Linking } from 'react-native';
import { create } from 'zustand';
import type { Role } from '../constants/roles';
import { supabase } from '../services/supabase/client';
import type { Profile } from '../types/profile';

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

async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn('[authStore] failed to load profile:', error.message);
      return null;
    }

    return data as Profile;
  } catch (err) {
    // Network failure (e.g. device offline, unreachable host) throws instead of
    // resolving to { error }, so it needs its own catch to avoid an unhandled rejection.
    console.warn('[authStore] network error while loading profile:', err);
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

      const profile = await fetchProfile(session.user.id);
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
        console.warn('[authStore] failed to restore session:', err);
        if (!cancelled) {
          set({ session: null, user: null, profile: null, role: null, status: 'unauthenticated' });
        }
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // A password-reset link was just exchanged (handleDeepLink below) — route to
      // ResetPasswordScreen instead of applySession, which would otherwise grant full app
      // access via the recovery session before the user has actually set a new password.
      if (event === 'PASSWORD_RECOVERY' && session) {
        if (!cancelled) {
          set({ session, user: session.user, status: 'passwordRecovery' });
        }
        return;
      }
      applySession(session).catch(err => {
        console.warn('[authStore] failed to apply auth state change:', err);
      });
    });

    // Password-reset emails link to zarailink://reset-password?code=... (authService.ts's
    // resetPassword, registered natively in AndroidManifest.xml). PKCE's `code` isn't a session
    // by itself — exchanging it is what actually triggers the PASSWORD_RECOVERY event above.
    const handleDeepLink = (url: string | null) => {
      if (!url) return;
      const code = new URL(url).searchParams.get('code');
      if (!code) return;
      supabase.auth.exchangeCodeForSession(code).catch(err => {
        console.warn('[authStore] failed to exchange recovery code:', err);
        Alert.alert(
          'Link expired or invalid',
          'This password reset link is no longer valid. Please request a new one.',
        );
      });
    };

    // Cold start (app opened by tapping the link) and warm start (app already running) are two
    // separate APIs on React Native's Linking module — both are needed to catch every case.
    Linking.getInitialURL().then(handleDeepLink);
    const urlSubscription = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      urlSubscription.remove();
    };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, role: null, status: 'unauthenticated' });
  },

  refreshProfile: async () => {
    const userId = get().user?.id;
    if (!userId) return;
    const profile = await fetchProfile(userId);
    set({ profile, role: profile?.role ?? null });
  },
}));
