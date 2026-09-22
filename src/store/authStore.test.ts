import { act } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
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
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

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

    await act(async () => {
      const unsubscribe = useAuthStore.getState().initialize();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      unsubscribe();
    });

    expect(useAuthStore.getState().status).toBe('suspended');
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
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    const removeSpy = jest.fn();
    jest.spyOn(Linking, 'addEventListener').mockReturnValue({ remove: removeSpy } as never);

    const unsubscribe = useAuthStore.getState().initialize();
    unsubscribe();

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    // The password-reset deep-link listener must be cleaned up alongside the auth listener —
    // a leaked `Linking` subscription would keep firing into an unmounted store.
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('routes a PASSWORD_RECOVERY auth event to the passwordRecovery status, not authenticated', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);

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

  it('exchanges a password-reset deep-link code for a session on cold start', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('zarailink://reset-password?code=abc123');
    jest.spyOn(Linking, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);

    let unsubscribe!: () => void;
    await act(async () => {
      unsubscribe = useAuthStore.getState().initialize();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedSupabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    unsubscribe();
  });

  it('shows an alert and does not throw when the recovery code is invalid or expired', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('zarailink://reset-password?code=expired');
    jest.spyOn(Linking, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    mockedSupabase.auth.exchangeCodeForSession.mockRejectedValue(new Error('expired'));

    let unsubscribe!: () => void;
    await act(async () => {
      unsubscribe = useAuthStore.getState().initialize();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalled();
    unsubscribe();
  });

  it('ignores a deep link with no code param (e.g. the app opened normally)', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('zarailink://reset-password');
    jest.spyOn(Linking, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);

    let unsubscribe!: () => void;
    await act(async () => {
      unsubscribe = useAuthStore.getState().initialize();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedSupabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
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
