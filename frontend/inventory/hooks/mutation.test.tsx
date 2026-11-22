import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { useNetworkStore } from '../../state/networkStore';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';
import { inventoryKeys } from './keys';
import { useInventoryMutation } from './mutation';

// The maintainer's rule for the inventory system (2026-10-11): offline, reads come from the cache and writes fail at
// once and say so. No queue: a stock change replayed later could take stock that has since been sold.
function setup() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => useNetworkStore.getState().setOffline(false));

describe('useInventoryMutation', () => {
  it('refuses at once offline, says so, and sends nothing', async () => {
    const send = jest.fn().mockResolvedValue('saved');
    const { wrapper } = setup();
    useNetworkStore.getState().setOffline(true);
    const { result } = await renderHook(() => useInventoryMutation(send), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync('stock in')).rejects.toThrow("You're offline — this change wasn't saved.");
    });
    expect(send).not.toHaveBeenCalled();
    // Not paused for a replay on reconnect: the attempt is over.
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isPaused).toBe(false);
  });

  it('online, sends the write and refreshes every inventory read', async () => {
    const send = jest.fn().mockResolvedValue('saved');
    const { client, wrapper } = setup();
    const read = jest.fn().mockResolvedValue({ products: 1 });
    const { result } = await renderHook(
      () => ({ dashboard: useQuery({ queryKey: inventoryKeys.dashboard(), queryFn: read }), save: useInventoryMutation(send) }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.dashboard.isSuccess).toBe(true));

    await act(async () => {
      await result.current.save.mutateAsync('stock in');
    });
    expect(send).toHaveBeenCalledWith('stock in');
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(client.getQueryState(inventoryKeys.dashboard())?.isInvalidated).toBe(false);
  });

  it('a write that changes no figure (an export) refreshes nothing', async () => {
    const { wrapper } = setup();
    const read = jest.fn().mockResolvedValue({});
    const { result } = await renderHook(
      () => ({
        dashboard: useQuery({ queryKey: inventoryKeys.dashboard(), queryFn: read }),
        save: useInventoryMutation(jest.fn().mockResolvedValue({ url: 'https://x' }), { invalidate: false }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.dashboard.isSuccess).toBe(true));
    await act(async () => {
      await result.current.save.mutateAsync(undefined);
    });
    expect(read).toHaveBeenCalledTimes(1);
  });
});
