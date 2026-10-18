import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNetworkStore } from '../../state/networkStore';
import { inventoryKeys } from './keys';

/** Shown when a change is attempted without a connection. */
const OFFLINE_WRITE_MESSAGE = "You're offline — this change wasn't saved.";

/** A write refused on the device because there is no connection; nothing was sent, so nothing can be half-applied. */
class OfflineWriteError extends Error {
  constructor() {
    super(OFFLINE_WRITE_MESSAGE);
    this.name = 'OfflineWriteError';
  }
}

/** True for a write refused on the phone because it is offline (nothing was sent). */
export function isOfflineWrite(error: unknown): boolean {
  return error instanceof OfflineWriteError;
}

/**
 * Every inventory write goes through here. The maintainer's rule for the inventory system (2026-10-11): reads come
 * from the device cache when offline, writes fail at once and say so. There is no queue: a stock change replayed
 * later could take stock that has since been sold, so the dealer re-enters it once back online.
 *
 * `networkMode: 'always'` matters: under React Query's default ('online') a mutation started offline is paused and
 * replayed on reconnect, which is exactly the silent queue this rule forbids. On success every inventory query is
 * invalidated, since one movement changes stock, the dashboard, alerts and reconciliation together. A write that changes
 * no inventory figure (an export file) passes `{ invalidate: false }`.
 */
export function useInventoryMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
  { invalidate = true }: { invalidate?: boolean } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: (variables: TVariables) => {
      if (useNetworkStore.getState().isOffline) return Promise.reject(new OfflineWriteError());
      return mutationFn(variables);
    },
    onSuccess: () => (invalidate ? queryClient.invalidateQueries({ queryKey: inventoryKeys.all }) : undefined),
  });
}
