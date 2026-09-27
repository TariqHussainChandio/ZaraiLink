import { dehydrate, type QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../services/api/errors';
import { useAuthStore } from '../../store/authStore';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';
import { queryKeys } from './keys';
import { connectQueryManagers, queryClient, shouldPersist, shouldRetry } from './queryClient';

const apiError = (kind: ApiError['kind']) => new ApiError({ status: 500, code: 'unknown', kind, message: 'm' });

// Query gc timers would otherwise keep the Jest worker alive after the last test.
afterEach(() => queryClient.clear());

describe('shouldRetry', () => {
  it('never repeats a request that repeating cannot fix', () => {
    for (const kind of ['auth', 'forbidden', 'validation', 'notFound', 'conflict', 'rateLimited'] as const) {
      expect(shouldRetry(0, apiError(kind))).toBe(false);
    }
  });

  it('leaves network failures to the client (already retried) and to the offline pause', () => {
    expect(shouldRetry(0, apiError('network'))).toBe(false);
    expect(shouldRetry(0, apiError('timeout'))).toBe(false);
  });

  it('retries a server error once, and an unknown failure once', () => {
    expect(shouldRetry(0, apiError('server'))).toBe(true);
    expect(shouldRetry(1, apiError('server'))).toBe(false);
    expect(shouldRetry(0, new Error('boom'))).toBe(true);
    expect(shouldRetry(1, new Error('boom'))).toBe(false);
  });
});

describe('the persisted cache', () => {
  async function seeded() {
    const client = createTestQueryClient();
    await client.prefetchQuery({ queryKey: queryKeys.marketplace.categories(), queryFn: async () => ['seeds'] });
    await client.prefetchQuery({ queryKey: queryKeys.orders.list('buyer'), queryFn: async () => [{ id: 'order-1' }] });
    await client.prefetchQuery({ queryKey: queryKeys.marketplace.crops(), queryFn: async () => Promise.reject(new Error('x')) });
    return client;
  }

  const clients: QueryClient[] = [];
  afterEach(() => clients.forEach(client => client.clear()));

  it('writes public marketplace reads to disk and nothing personal', async () => {
    const client = await seeded();
    clients.push(client);
    const state = dehydrate(client, { shouldDehydrateQuery: shouldPersist });
    const keys = state.queries.map(query => query.queryKey);
    expect(keys).toEqual([queryKeys.marketplace.categories()]);
    expect(JSON.stringify(state)).not.toContain('order-1');
  });

  it('never writes a failed query', async () => {
    const client = await seeded();
    clients.push(client);
    const failed = client.getQueryCache().find({ queryKey: queryKeys.marketplace.crops() });
    expect(failed && shouldPersist(failed)).toBe(false);
  });
});

describe('sign-out', () => {
  it('empties the cache whichever way the session ends, so the next account sees nothing of the last', async () => {
    const disconnect = connectQueryManagers();
    useAuthStore.setState({ user: { id: 'user-a' } as never });
    await queryClient.prefetchQuery({ queryKey: queryKeys.orders.list('buyer'), queryFn: async () => [{ id: 'order-1' }] });
    expect(queryClient.getQueryData(queryKeys.orders.list('buyer'))).toBeDefined();

    useAuthStore.setState({ user: null });
    expect(queryClient.getQueryData(queryKeys.orders.list('buyer'))).toBeUndefined();
    disconnect();
  });

  it('also empties it when a different account signs in without a sign-out in between', async () => {
    const disconnect = connectQueryManagers();
    useAuthStore.setState({ user: { id: 'user-a' } as never });
    await queryClient.prefetchQuery({ queryKey: queryKeys.orders.list('buyer'), queryFn: async () => [{ id: 'order-1' }] });
    useAuthStore.setState({ user: { id: 'user-b' } as never });
    expect(queryClient.getQueryData(queryKeys.orders.list('buyer'))).toBeUndefined();
    disconnect();
    useAuthStore.setState({ user: null });
  });
});
