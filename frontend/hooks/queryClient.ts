import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient, type Query } from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import { AppState, type AppStateStatus } from 'react-native';
import { isApiError } from '../services/api/errors';
import { useAuthStore } from '../state/authStore';
import { useNetworkStore } from '../state/networkStore';
import { forgetRememberedProfile } from '../state/rememberedProfile';
import { logger } from '../utils/logger';

const HOUR = 60 * 60 * 1000;

/** An error that repeating cannot fix. `apiFetch` already retried the network/5xx cases for GETs. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (!isApiError(error)) return failureCount < 1;
  if (error.kind === 'server') return failureCount < 1;
  return false;
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        // Kept as long as the persisted cache (below) so a restored entry is not garbage collected on restore.
        gcTime: 24 * HOUR,
        retry: shouldRetry,
      },
      // A failed write is shown to the user, never retried behind their back (a lost response could double-post).
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();

/**
 * Only public marketplace reads and the dealer's own inventory are written to disk. Orders, messages, profiles and
 * anything else personal stay in memory, so a lost or shared phone never exposes them.
 *
 * 'inventory' is the dealer's private stock data (BR-03/04: dealer-only). The maintainer decided (2026-10-11) that it
 * is kept on the device for 24 hours so the inventory system opens offline; in exchange the whole persisted cache is
 * wiped on sign-out and whenever a different user's session starts (`connectQueryManagers` below).
 */
const PERSISTED_ROOTS = new Set<unknown>(['marketplace', 'inventory']);

export function shouldPersist(query: Query): boolean {
  return query.state.status === 'success' && PERSISTED_ROOTS.has(query.queryKey[0]);
}

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'zl-query-cache' });

/** The id of the user whose data the persisted cache holds; it outlives the session so a cold start can compare. */
const CACHE_OWNER_KEY = 'zl-query-cache-owner';

/**
 * Drops every cached query, in memory and on disk, forgets whose data it was, and forgets the profile remembered for
 * an offline start (`frontend/state/rememberedProfile.ts`) under the same rules, so a remembered approved dealer never
 * outlives a sign-out or an account switch. `keepUserId` is the account starting now, whose own record is kept.
 */
async function wipeCache(keepUserId?: string): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
  await AsyncStorage.removeItem(CACHE_OWNER_KEY);
  await forgetRememberedProfile(keepUserId);
}

/**
 * A session has started (sign-in or a restored session at launch). In-memory comparison alone misses the cold start:
 * the previous user may have signed out or expired while the app was closed, so the disk cache restored at launch can
 * still hold their inventory. The stored owner id catches that case.
 */
async function claimCache(userId: string): Promise<void> {
  const owner = await AsyncStorage.getItem(CACHE_OWNER_KEY);
  if (owner !== null && owner !== userId) {
    await wipeCache(userId);
  }
  await AsyncStorage.setItem(CACHE_OWNER_KEY, userId);
}

function reportWipeFailure(err: unknown): void {
  logger.warn('queryClient: could not wipe the persisted cache', err);
}

export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister,
  maxAge: 24 * HOUR,
  // Bump to drop every persisted cache after a change in what the API returns.
  buster: 'v1',
  dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
};

/** NetInfo reports `null` for what it has not worked out yet, which counts as online. */
function isOnline(state: { isConnected: boolean | null; isInternetReachable: boolean | null }): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/** Connects React Query to the device: it pauses fetching offline and refetches on reconnect and on app resume. */
export function connectQueryManagers(): () => void {
  onlineManager.setEventListener(setOnline => NetInfo.addEventListener(state => setOnline(isOnline(state))));
  // The offline banner follows the device's connection too, not only a request that just failed: airplane mode shows
  // it at once, and it clears when the connection is back, before any request has to succeed to say so.
  const unsubscribeNetInfo = NetInfo.addEventListener(state => useNetworkStore.getState().setOffline(!isOnline(state)));
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });

  // Another account must never see the previous one's cached data, whichever way the session ended
  // (sign out, expiry, suspension). The persisted part now includes the dealer's inventory (BR-03/04), so the disk
  // copy is wiped with the memory one.
  const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
    if (previous.user && state.user?.id !== previous.user.id) {
      wipeCache(state.user?.id)
        .then(() => (state.user ? claimCache(state.user.id) : undefined))
        .catch(reportWipeFailure);
      return;
    }
    if (!previous.user && state.user) {
      claimCache(state.user.id).catch(reportWipeFailure);
      return;
    }
    // Launch found no session: whoever owned the restored cache is signed out, so their data goes too.
    if (previous.status === 'loading' && state.status === 'unauthenticated') {
      wipeCache().catch(reportWipeFailure);
    }
  });

  return () => {
    subscription.remove();
    unsubscribeNetInfo();
    unsubscribeAuth();
  };
}
