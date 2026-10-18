import { act, waitFor } from '@testing-library/react-native';
import { makeSupabaseMock } from '../testUtils/supabaseMock';

jest.mock('../services/supabase/client', () => {
  // Requiring lazily inside the factory sidesteps Jest's out-of-scope-variable restriction on
  // `jest.mock()` factories, which is otherwise hoisted above this file's own imports.
  const { makeSupabaseMock: create } = jest.requireActual('../testUtils/supabaseMock');
  return { supabase: create() };
});

// Imported after the mock so the store picks up the mocked client.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase/client';
import { selectAccount, useAuthStore } from './authStore';
import { useNetworkStore } from './networkStore';
import { recallProfile, rememberProfile } from './rememberedProfile';

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
    useAuthStore.setState({
      session: null,
      user: null,
      profile: null,
      role: null,
      status: 'loading',
      unavailableReason: null,
      deviceAccount: null,
    });
    useNetworkStore.setState({ isOffline: false });
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  resetStore();
  await AsyncStorage.clear();
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

// A3a (D10; SRDS §8, §11): a dealer or expert waiting for a decision sees only the Application Status screen, and one
// approved while signed in signs in again before the dashboard.
function mockProfile(row: Record<string, unknown>) {
  mockedSupabase.from.mockImplementation(() => {
    const builder: any = {};
    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn(() => builder);
    builder.single = jest.fn(() => Promise.resolve({ data: row, error: null }));
    return builder;
  });
}

describe('useAuthStore: account status', () => {
  it.each([
    ['dealer', 'pending', 'awaitingApproval'],
    ['expert', 'rejected', 'awaitingApproval'],
    ['dealer', 'approved', 'authenticated'],
    ['farmer', 'approved', 'authenticated'],
  ])('a signed-in %s whose application is %s is %s', async (role, accountStatus, expected) => {
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    mockProfile({ ...profileRow, role, account_status: accountStatus });

    let unsubscribe!: () => void;
    await act(async () => {
      unsubscribe = useAuthStore.getState().initialize();
    });
    await waitFor(() => expect(useAuthStore.getState().status).toBe(expected));
    unsubscribe();
  });

  it('a suspended account is suspended even while its application is pending', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    mockProfile({ ...profileRow, role: 'dealer', account_status: 'pending', is_suspended: true });

    let unsubscribe!: () => void;
    await act(async () => {
      unsubscribe = useAuthStore.getState().initialize();
    });
    await waitFor(() => expect(useAuthStore.getState().status).toBe('suspended'));
    unsubscribe();
  });

  it('an approval seen while waiting asks the user to sign in again, not straight into the dashboard', async () => {
    act(() => {
      useAuthStore.setState({ user: session.user as never, status: 'awaitingApproval' });
    });
    mockProfile({ ...profileRow, role: 'dealer', account_status: 'approved' });

    await act(async () => {
      await useAuthStore.getState().refreshProfile();
    });

    expect(useAuthStore.getState().status).toBe('approvalGranted');
  });

  it('a rejection seen while waiting keeps the Application Status screen, with the reason', async () => {
    act(() => {
      useAuthStore.setState({ user: session.user as never, status: 'awaitingApproval' });
    });
    mockProfile({ ...profileRow, role: 'dealer', account_status: 'rejected', account_status_reason: 'Licence missing' });

    await act(async () => {
      await useAuthStore.getState().refreshProfile();
    });

    expect(useAuthStore.getState().status).toBe('awaitingApproval');
    expect(useAuthStore.getState().profile?.account_status_reason).toBe('Licence missing');
  });

  it('a refresh during a password reset keeps the reset screen', async () => {
    act(() => {
      useAuthStore.setState({ user: session.user as never, status: 'passwordRecovery' });
    });
    mockProfile({ ...profileRow, role: 'dealer', account_status: 'pending' });

    await act(async () => {
      await useAuthStore.getState().refreshProfile();
    });

    expect(useAuthStore.getState().status).toBe('passwordRecovery');
  });
});

// A3a verification round 1, H1: an admin with an authenticator gives the second factor before the console opens.
describe('useAuthStore: the admin second factor', () => {
  async function signIn(role: string, levels: { currentLevel: string; nextLevel: string }) {
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    mockProfile({ ...profileRow, role, account_status: 'approved' });
    mockedSupabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: levels, error: null } as never);
    let unsubscribe!: () => void;
    await act(async () => {
      unsubscribe = useAuthStore.getState().initialize();
    });
    return unsubscribe;
  }

  it('asks an admin who signed in with the password only for the code', async () => {
    const unsubscribe = await signIn('admin', { currentLevel: 'aal1', nextLevel: 'aal2' });
    await waitFor(() => expect(useAuthStore.getState().status).toBe('secondFactor'));
    unsubscribe();
  });

  it('opens the console once the session has used the second factor', async () => {
    const unsubscribe = await signIn('admin', { currentLevel: 'aal2', nextLevel: 'aal2' });
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    unsubscribe();
  });

  it('opens the console for an admin with no authenticator yet (they set one up in Settings)', async () => {
    const unsubscribe = await signIn('admin', { currentLevel: 'aal1', nextLevel: 'aal1' });
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    unsubscribe();
  });

  it('never asks anyone but an admin', async () => {
    const unsubscribe = await signIn('farmer', { currentLevel: 'aal1', nextLevel: 'aal2' });
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(mockedSupabase.auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
    unsubscribe();
  });
});

// B4 verification, F1: an approved dealer who started the app offline landed in the buyer shell and stayed there after
// reconnecting. The profile read is faked at its edge exactly as postgrest-js answers: no response is status 0.
describe('useAuthStore: an offline start', () => {
  const dealerSession = { access_token: 'token-dealer', user: { id: 'dealer-a', email: 'dealer@example.com' } };
  const approvedDealer = {
    ...profileRow,
    id: 'dealer-a',
    role: 'dealer',
    full_name: 'Dealer A',
    account_status: 'approved',
    is_suspended: false,
  };

  function answerProfile(answer: { data: unknown; error: unknown; status: number }) {
    mockedSupabase.from.mockImplementation(() => {
      const builder: any = {};
      builder.select = jest.fn(() => builder);
      builder.eq = jest.fn(() => builder);
      builder.single = jest.fn(() => Promise.resolve(answer));
      return builder;
    });
  }
  const offline = () =>
    answerProfile({ data: null, error: { message: 'TypeError: Network request failed', code: '' }, status: 0 });
  const server = (row: Record<string, unknown>) => answerProfile({ data: row, error: null, status: 200 });

  async function coldStart(expected: string) {
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session: dealerSession }, error: null });
    let unsubscribe!: () => void;
    await act(async () => {
      unsubscribe = useAuthStore.getState().initialize();
    });
    await waitFor(() => expect(useAuthStore.getState().status).toBe(expected));
    return unsubscribe;
  }

  async function reconnect() {
    await act(async () => {
      useNetworkStore.setState({ isOffline: true });
    });
    await act(async () => {
      useNetworkStore.setState({ isOffline: false });
    });
  }

  it('opens the remembered approved dealer in the dealer shell, without writing personal fields to the device', async () => {
    await rememberProfile(approvedDealer as never);
    offline();
    const unsubscribe = await coldStart('authenticated');

    const state = useAuthStore.getState();
    expect(state.role).toBe('dealer');
    expect(selectAccount(state)).toEqual({ id: 'dealer-a', role: 'dealer', account_status: 'approved', is_suspended: false });
    expect(state.profile).toBeNull();
    expect(await AsyncStorage.getItem('zl-remembered-profile')).not.toContain('Dealer A');
    unsubscribe();
  });

  it('says the account cannot be checked when nothing is remembered, and guesses no role', async () => {
    offline();
    const unsubscribe = await coldStart('accountUnavailable');
    expect(useAuthStore.getState().unavailableReason).toBe('offline');
    expect(useAuthStore.getState().role).toBeNull();
    unsubscribe();
  });

  it('never opens the remembered profile of another user', async () => {
    await rememberProfile({ ...approvedDealer, id: 'dealer-b' } as never);
    offline();
    const unsubscribe = await coldStart('accountUnavailable');
    expect(useAuthStore.getState().role).toBeNull();
    unsubscribe();
  });

  it.each([401, 403])('does not fall back to the remembered profile when the server answers %s', async status => {
    await rememberProfile(approvedDealer as never);
    answerProfile({ data: null, error: { message: 'JWT expired', code: 'PGRST301' }, status });
    const unsubscribe = await coldStart('accountUnavailable');
    expect(useAuthStore.getState().unavailableReason).toBe('refused');
    expect(useAuthStore.getState().role).toBeNull();
    expect(selectAccount(useAuthStore.getState())).toBeNull();
    unsubscribe();
  });

  it('reads the profile again on reconnect: an approved dealer stays, with the server profile', async () => {
    await rememberProfile(approvedDealer as never);
    offline();
    const unsubscribe = await coldStart('authenticated');

    server(approvedDealer);
    await reconnect();
    await waitFor(() => expect(useAuthStore.getState().profile?.full_name).toBe('Dealer A'));
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().role).toBe('dealer');
    expect(useAuthStore.getState().deviceAccount).toBeNull();
    unsubscribe();
  });

  it('switches to Suspended on reconnect when the dealer was suspended meanwhile, and remembers that at once', async () => {
    await rememberProfile(approvedDealer as never);
    offline();
    const unsubscribe = await coldStart('authenticated');

    server({ ...approvedDealer, is_suspended: true });
    await reconnect();
    await waitFor(() => expect(useAuthStore.getState().status).toBe('suspended'));
    expect((await recallProfile('dealer-a'))?.is_suspended).toBe(true);
    unsubscribe();
  });

  it('closes the dealer shell on reconnect when the approval was withdrawn meanwhile', async () => {
    await rememberProfile(approvedDealer as never);
    offline();
    const unsubscribe = await coldStart('authenticated');

    server({ ...approvedDealer, account_status: 'pending' });
    await reconnect();
    await waitFor(() => expect(useAuthStore.getState().status).toBe('awaitingApproval'));
    unsubscribe();
  });

  it('leaves the cannot-check state by itself once the connection returns', async () => {
    offline();
    const unsubscribe = await coldStart('accountUnavailable');

    server(approvedDealer);
    await reconnect();
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(useAuthStore.getState().role).toBe('dealer');
    expect(useAuthStore.getState().unavailableReason).toBeNull();
    unsubscribe();
  });

  it('keeps the open shell when a refresh finds no connection, instead of dropping the role', async () => {
    server(approvedDealer);
    const unsubscribe = await coldStart('authenticated');

    offline();
    await act(async () => {
      await useAuthStore.getState().refreshProfile();
    });
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().role).toBe('dealer');
    expect(useAuthStore.getState().profile?.full_name).toBe('Dealer A');
    unsubscribe();
  });

  it('forgets the remembered profile on sign-out', async () => {
    server(approvedDealer);
    const unsubscribe = await coldStart('authenticated');
    expect(await recallProfile('dealer-a')).not.toBeNull();

    await act(async () => {
      await useAuthStore.getState().signOut();
    });
    expect(await AsyncStorage.getItem('zl-remembered-profile')).toBeNull();
    unsubscribe();
  });
});
