import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, waitFor } from '@testing-library/react-native';
import type { Query } from '@tanstack/react-query';

jest.mock('../../services/supabase/client', () => {
  const { makeSupabaseMock: create } = jest.requireActual('../../testUtils/supabaseMock');
  return { supabase: create() };
});

// Imported after the mock so the auth store uses the mocked client.
import { connectQueryManagers, queryClient, shouldPersist } from '../../hooks/queryClient';
import { useAuthStore } from '../../state/authStore';
import { dashboard } from '../testUtils/fixtures';
import { inventoryKeys } from './keys';

// The B4 decision (wave 6): the dealer's inventory is kept on the device so the system opens offline, and in exchange
// the whole cache is wiped on sign-out and whenever another account's session starts, as the cart is (B3). Dealer A's
// stock must never show to the next account on the phone (BR-03/04). The wipe lives in frontend/hooks/queryClient.ts;
// these tests hold the inventory system to it.

const CACHE_KEY = 'zl-query-cache';
const OWNER_KEY = 'zl-query-cache-owner';

async function session(userId: string | null, status: 'authenticated' | 'unauthenticated' | 'loading' = 'authenticated') {
  await act(async () => {
    useAuthStore.setState({
      session: null,
      user: userId ? ({ id: userId } as never) : null,
      role: userId ? 'dealer' : null,
      profile: null,
      status,
    });
  });
}

/** Dealer A's stock in memory and a persisted copy on disk, as the app holds them after using the inventory system. */
async function holdDealerAStock() {
  queryClient.setQueryData(inventoryKeys.dashboard(), dashboard());
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ clientState: { queries: ['dealer A stock'] } }));
}

let disconnect: () => void = () => {};

beforeEach(async () => {
  await AsyncStorage.clear();
  queryClient.clear();
  await session(null, 'loading');
  disconnect = connectQueryManagers();
});

afterEach(() => disconnect());

describe('the inventory cache on the device', () => {
  it('keeps inventory reads on disk (so the system opens offline), but not a failed one', () => {
    queryClient.setQueryData(inventoryKeys.products(), []);
    const stored = queryClient.getQueryCache().find({ queryKey: inventoryKeys.products() }) as Query;
    expect(shouldPersist(stored)).toBe(true);
    const failed = { queryKey: ['inventory', 'stock'], state: { status: 'error' } } as unknown as Query;
    expect(shouldPersist(failed)).toBe(false);
    const orders = { queryKey: ['orders', 'seller'], state: { status: 'success' } } as unknown as Query;
    expect(shouldPersist(orders)).toBe(false);
  });

  it('is wiped, in memory and on disk, when the dealer signs out', async () => {
    await session('dealer-a');
    await waitFor(async () => expect(await AsyncStorage.getItem(OWNER_KEY)).toBe('dealer-a'));
    await holdDealerAStock();

    await session(null, 'unauthenticated');
    await waitFor(async () => expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull());
    expect(queryClient.getQueryData(inventoryKeys.dashboard())).toBeUndefined();
    expect(await AsyncStorage.getItem(OWNER_KEY)).toBeNull();
  });

  it('is wiped when another account signs in straight after (an account switch)', async () => {
    await session('dealer-a');
    await waitFor(async () => expect(await AsyncStorage.getItem(OWNER_KEY)).toBe('dealer-a'));
    await holdDealerAStock();

    await session('farmer-b');
    await waitFor(async () => expect(await AsyncStorage.getItem(OWNER_KEY)).toBe('farmer-b'));
    expect(queryClient.getQueryData(inventoryKeys.dashboard())).toBeUndefined();
    expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('is wiped at a cold start when the copy on disk belongs to someone else', async () => {
    // Dealer A's session ended while the app was closed; their copy was restored from disk at launch.
    await AsyncStorage.setItem(OWNER_KEY, 'dealer-a');
    await holdDealerAStock();

    await session('farmer-b');
    await waitFor(async () => expect(await AsyncStorage.getItem(OWNER_KEY)).toBe('farmer-b'));
    expect(queryClient.getQueryData(inventoryKeys.dashboard())).toBeUndefined();
    expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('is kept for the same dealer coming back (a restored session)', async () => {
    await AsyncStorage.setItem(OWNER_KEY, 'dealer-a');
    await holdDealerAStock();

    await session('dealer-a');
    await waitFor(async () => expect(await AsyncStorage.getItem(OWNER_KEY)).toBe('dealer-a'));
    expect(queryClient.getQueryData(inventoryKeys.dashboard())).toEqual(dashboard());
  });

  it('is wiped when the app starts with no session at all', async () => {
    await AsyncStorage.setItem(OWNER_KEY, 'dealer-a');
    await holdDealerAStock();

    await session(null, 'unauthenticated');
    await waitFor(async () => expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull());
    expect(queryClient.getQueryData(inventoryKeys.dashboard())).toBeUndefined();
  });
});
