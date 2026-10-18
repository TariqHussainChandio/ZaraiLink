import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from '@testing-library/react-native';

jest.mock('../services/supabase/client', () => {
  const { makeSupabaseMock: create } = jest.requireActual('../testUtils/supabaseMock');
  return { supabase: create() };
});

// Imported after the mock so the auth store picks up the mocked client.
import { useAuthStore } from './authStore';
import { connectCartToAuth, useCartStore, type CartItem } from './cartStore';

const line: Omit<CartItem, 'quantity'> = {
  listingId: 'listing-1',
  sellerId: 'seller-1',
  title: 'Wheat seeds',
  price: 100,
  unit: 'kg',
  image: null,
};

/** What `authStore.applySession` sets for a signed-in buyer; the session itself plays no part in the cart. */
function signInAs(userId: string) {
  act(() => {
    useAuthStore.setState({
      session: null,
      user: { id: userId } as never,
      profile: null,
      role: 'buyer',
      status: 'authenticated',
    });
  });
}

let disconnect: () => void = () => {};

beforeEach(async () => {
  await AsyncStorage.clear();
  act(() => {
    useAuthStore.setState({ session: null, user: null, profile: null, role: null, status: 'loading' });
    useCartStore.setState({ items: [], ownerId: null });
  });
  await useCartStore.persist.rehydrate();
  disconnect = connectCartToAuth();
});

afterEach(() => disconnect());

describe('the cart follows its owner (B3 verification, cart leak)', () => {
  it('is empty for the next user after a sign-out', async () => {
    signInAs('buyer-a');
    act(() => useCartStore.getState().addItem(line, 2));
    expect(useCartStore.getState().items).toHaveLength(1);

    await act(() => useAuthStore.getState().signOut());
    expect(useCartStore.getState().items).toEqual([]);

    signInAs('buyer-b');
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().ownerId).toBe('buyer-b');
  });

  it('is empty when the session switches straight to another account', () => {
    signInAs('buyer-a');
    act(() => useCartStore.getState().addItem(line));

    signInAs('dealer-b');
    expect(useCartStore.getState().items).toEqual([]);
  });

  it("drops another user's cart restored from the device at launch", async () => {
    await AsyncStorage.setItem(
      'zarailink-cart',
      JSON.stringify({ state: { items: [{ ...line, quantity: 3 }], ownerId: 'buyer-a' }, version: 0 }),
    );
    signInAs('buyer-b');
    await act(() => useCartStore.persist.rehydrate());
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().ownerId).toBe('buyer-b');
  });

  it('drops a restored cart that has no recorded owner', async () => {
    await AsyncStorage.setItem(
      'zarailink-cart',
      JSON.stringify({ state: { items: [{ ...line, quantity: 3 }] }, version: 0 }),
    );
    signInAs('buyer-b');
    await act(() => useCartStore.persist.rehydrate());
    expect(useCartStore.getState().items).toEqual([]);
  });

  it("keeps the same user's cart when the session is known before the saved cart is read (cold start)", async () => {
    // A fresh app start: new modules (and so a new device storage mock), the saved cart written first, and the session
    // landing before the store has finished reading it.
    await jest.isolateModulesAsync(async () => {
      const storage: typeof AsyncStorage = require('@react-native-async-storage/async-storage');
      await storage.setItem(
        'zarailink-cart',
        JSON.stringify({ state: { items: [{ ...line, quantity: 3 }], ownerId: 'buyer-a' }, version: 0 }),
      );
      const auth: typeof useAuthStore = require('./authStore').useAuthStore;
      const cartModule: typeof import('./cartStore') = require('./cartStore');
      const stop = cartModule.connectCartToAuth();
      act(() => {
        auth.setState({ user: { id: 'buyer-a' } as never, role: 'buyer', status: 'authenticated' });
      });
      await act(() => cartModule.useCartStore.persist.rehydrate());
      expect(cartModule.useCartStore.getState().items).toEqual([{ ...line, quantity: 3 }]);
      stop();
    });
  });

  it('leaves the cart alone while the session is still being restored', async () => {
    await AsyncStorage.setItem(
      'zarailink-cart',
      JSON.stringify({ state: { items: [{ ...line, quantity: 3 }], ownerId: 'buyer-a' }, version: 0 }),
    );
    await act(() => useCartStore.persist.rehydrate());
    expect(useCartStore.getState().items).toHaveLength(1);
    signInAs('buyer-a');
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});
