import { act, waitFor } from '@testing-library/react-native';
import { makeSupabaseMock } from '../testUtils/supabaseMock';

jest.mock('../services/supabase/client', () => {
  // Requiring lazily inside the factory sidesteps Jest's out-of-scope-variable restriction on
  // `jest.mock()` factories, which is otherwise hoisted above this file's own imports.
  const { makeSupabaseMock: create } = jest.requireActual('../testUtils/supabaseMock');
  return { supabase: create() };
});

// Imported after the mock so the store picks up the mocked client.
import { supabase } from '../services/supabase/client';
import { useAuthStore } from './authStore';

const mockedSupabase = supabase as unknown as ReturnType<typeof makeSupabaseMock>;

const session = {
  access_token: 'token-abc',
  user: { id: 'user-1', email: 'farmer@example.com' },
};

const profileRow = {
  id: 'user-1',
  role: 'farmer',
  full_name: 'Farmer Test',
  is_suspended: false,
};

function resetStore() {
  act(() => {
    useAuthStore.setState({ session: null, user: null, profile: null, role: null, status: 'loading' });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
});

describe('useAuthStore.initialize', () => {
  it('sets status to unauthenticated when there is no session', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    let unsubscribe!: () => void;
    await act(async () => {
      unsubscribe = useAuthStore.getState().initialize();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().session).toBeNull();
    unsubscribe();
  });

  it('loads the profile and sets status to authenticated for a non-suspended user', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    mockedSupabase.from.mockImplementation(() => {
      const builder: any = {};
      builder.select = jest.fn(() => builder);
      builder.eq = jest.fn(() => builder);
      builder.single = jest.fn(() => Promise.resolve({ data: profileRow, error: null }));
      return builder;
    });

    let unsubscribe!: () => void;
    await act(async () => {
      unsubscribe = useAuthStore.getState().initialize();
    });
    // The profile arrives after a few async hops; wait for the result instead of counting microtask ticks.
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.profile).toEqual(profileRow);
    expect(state.role).toBe('farmer');
    expect(state.user).toEqual(session.user);
    unsubscribe();
  });

  it('sets status to suspended when the profile is flagged suspended', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    mockedSupabase.from.mockImplementation(() => {
      const builder: any = {};
      builder.select = jest.fn(() => builder);
      builder.eq = jest.fn(() => builder);
      builder.single = jest.fn(() => Promise.resolve({ data: { ...profileRow, is_suspended: true }, error: null }));
      return builder;
    });

    let unsubscribe!: () => void;
    await act(async () => {
      unsubscribe = useAuthStore.getState().initialize();
    });

    await waitFor(() => expect(useAuthStore.getState().status).toBe('suspended'));
    unsubscribe();
  });

  it('falls back to unauthenticated when restoring the session throws', async () => {
    mockedSupabase.auth.getSession.mockRejectedValue(new Error('offline'));

    await act(async () => {
      const unsubscribe = useAuthStore.getState().initialize();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      unsubscribe();
    });

    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('unsubscribes from the auth listener on cleanup', () => {
    const unsubscribeSpy = jest.fn();
    mockedSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: unsubscribeSpy } },
    } as never);
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    const unsubscribe = useAuthStore.getState().initialize();
    unsubscribe();

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('routes a PASSWORD_RECOVERY auth event to the passwordRecovery status, not authenticated', async () => {
    // P4 (4B.4): this event now originates from verifyOtp({ type: 'recovery' }) in
    // VerifyOtpScreen, not a deep-link code exchange — the listener's handling of the event
    // itself is unchanged, only how the recovery session gets established is different.
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    let authStateCallback!: (event: string, session: unknown) => void;
    mockedSupabase.auth.onAuthStateChange.mockImplementation(((
      callback: (event: string, session: unknown) => void,
    ) => {
      authStateCallback = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }) as never);

    let unsubscribe!: () => void;
    await act(async () => {
      unsubscribe = useAuthStore.getState().initialize();
      await Promise.resolve();
    });

    act(() => {
      authStateCallback('PASSWORD_RECOVERY', session);
    });

    const state = useAuthStore.getState();
    expect(state.status).toBe('passwordRecovery');
    expect(state.session).toEqual(session);
    // Deliberately NOT 'authenticated' — a recovery session must not grant full app access
    // before the user has actually set a new password (RootNavigator routes this status to
    // ResetPasswordScreen instead of the normal app shell).
    unsubscribe();
  });

});

describe('useAuthStore.signOut', () => {
  it('calls supabase signOut and clears the store', async () => {
    act(() => {
      useAuthStore.setState({
        session: session as never,
        user: session.user as never,
        profile: profileRow as never,
        role: 'farmer',
        status: 'authenticated',
      });
    });

    await act(async () => {
      await useAuthStore.getState().signOut();
    });

    expect(mockedSupabase.auth.signOut).toHaveBeenCalledTimes(1);
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.profile).toBeNull();
    expect(state.role).toBeNull();
    expect(state.status).toBe('unauthenticated');
  });
});

describe('useAuthStore.refreshProfile', () => {
  it('is a no-op when there is no signed-in user', async () => {
    await act(async () => {
      await useAuthStore.getState().refreshProfile();
    });
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  it('re-fetches and applies the profile for the current user', async () => {
    act(() => {
      useAuthStore.setState({ user: session.user as never });
    });
    mockedSupabase.from.mockImplementation(() => {
      const builder: any = {};
      builder.select = jest.fn(() => builder);
      builder.eq = jest.fn(() => builder);
      builder.single = jest.fn(() => Promise.resolve({ data: { ...profileRow, full_name: 'Updated Name' }, error: null }));
      return builder;
    });

    await act(async () => {
      await useAuthStore.getState().refreshProfile();
    });

    const state = useAuthStore.getState();
    expect(state.profile?.full_name).toBe('Updated Name');
    expect(state.role).toBe('farmer');
  });
});
