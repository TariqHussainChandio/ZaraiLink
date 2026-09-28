import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient, type Query } from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import { AppState, type AppStateStatus } from 'react-native';
import { isApiError } from '../services/api/errors';
import { useAuthStore } from '../state/authStore';
import { useNetworkStore } from '../state/networkStore';

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
 * Only public marketplace reads are written to disk. Orders, messages, profiles and anything else personal stay
 * in memory, so a lost or shared phone never exposes them and there is nothing to purge for correctness.
 */
const PERSISTED_ROOTS = new Set<unknown>(['marketplace']);

export function shouldPersist(query: Query): boolean {
  return query.state.status === 'success' && PERSISTED_ROOTS.has(query.queryKey[0]);
}

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'zl-query-cache' });

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
  // (sign out, expiry, suspension).
  const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
    if (previous.user && state.user?.id !== previous.user.id) {
      queryClient.clear();
      persister.removeClient();
    }
  });

  return () => {
    subscription.remove();
    unsubscribeNetInfo();
    unsubscribeAuth();
  };
}
