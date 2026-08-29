import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Role } from '../constants/roles';
import { supabase } from '../services/supabase/client';
import type { Profile } from '../types/profile';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'suspended';

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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session).catch(err => {
        console.warn('[authStore] failed to apply auth state change:', err);
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
    const profile = await fetchProfile(userId);
    set({ profile, role: profile?.role ?? null });
  },
}));
