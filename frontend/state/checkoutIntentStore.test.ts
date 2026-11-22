import { act } from '@testing-library/react-native';

jest.mock('../services/supabase/client', () => {
  const { makeSupabaseMock: create } = jest.requireActual('../testUtils/supabaseMock');
  return { supabase: create() };
});

// Imported after the mock so the auth store picks up the mocked client.
import { useAuthStore } from './authStore';
import { connectCheckoutIntentToAuth, useCheckoutIntent } from './checkoutIntentStore';

function signInAs(role: 'farmer' | 'buyer' | 'dealer' | 'expert' | 'admin') {
  act(() => useAuthStore.setState({ user: { id: `user-${role}` } as never, role, status: 'authenticated' }));
}

let disconnect: () => void = () => {};

beforeEach(() => {
  act(() => useAuthStore.setState({ session: null, user: null, profile: null, role: null, status: 'unauthenticated' }));
  useCheckoutIntent.setState({ pending: false });
  disconnect = connectCheckoutIntentToAuth();
});

afterEach(() => disconnect());

describe("a guest's wish to check out (D18)", () => {
  it('is taken once', () => {
    useCheckoutIntent.getState().request();
    expect(useCheckoutIntent.getState().take()).toBe(true);
    expect(useCheckoutIntent.getState().take()).toBe(false);
  });

  it.each(['farmer', 'buyer', 'dealer'] as const)('survives the sign-in of a %s, who can buy', role => {
    useCheckoutIntent.getState().request();
    signInAs(role);
    expect(useCheckoutIntent.getState().pending).toBe(true);
  });

  it.each(['expert', 'admin'] as const)('is dropped when an %s signs in: they cannot buy (D9)', role => {
    useCheckoutIntent.getState().request();
    signInAs(role);
    expect(useCheckoutIntent.getState().pending).toBe(false);
  });

  it('is dropped on sign-out', () => {
    signInAs('buyer');
    useCheckoutIntent.getState().request();
    act(() => useAuthStore.setState({ user: null, role: null, status: 'unauthenticated' }));
    expect(useCheckoutIntent.getState().pending).toBe(false);
  });
});
