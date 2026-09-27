/**
 * P7 (7B) real-stack test: the client against the real FastAPI and the real local Supabase, not fakes.
 * Setup and how to run it: see src/testUtils/realStack.ts (`ZARAILINK_REALSTACK=1 npx jest realstack`).
 */
import type { ApiError as ApiErrorType } from './errors';
import { API_URL, installNodeFetch, realStackEnabled, signUp } from '../../testUtils/realStack';

installNodeFetch();

const describeReal = realStackEnabled ? describe : describe.skip;

async function loadClient(apiUrl: string, token: string | null) {
  process.env.EXPO_PUBLIC_API_BASE_URL = apiUrl;
  jest.resetModules();
  jest.doMock('../supabase/client', () => ({
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: token ? { access_token: token } : null } }),
        refreshSession: async () => ({ data: { session: null }, error: new Error('no refresh in this test') }),
        signOut: async () => ({ error: null }),
      },
    },
  }));
  return {
    client: jest.requireActual<typeof import('./client')>('./client'),
    network: jest.requireActual<typeof import('../../store/networkStore')>('../../store/networkStore').useNetworkStore,
    generated: jest.requireActual<typeof import('../../api/generated')>('../../api/generated'),
  };
}

describeReal('apiFetch against the real backend', () => {
  let buyerToken = '';
  let dealerToken = '';

  beforeAll(async () => {
    buyerToken = await signUp('buyer');
    dealerToken = await signUp('dealer');
  }, 60_000);

  it('reads an authenticated list and a public one', async () => {
    const { client } = await loadClient(API_URL, buyerToken);
    expect(await client.apiFetch('/api/v1/orders')).toEqual([]);
    const categories = await client.apiFetch<unknown[]>('/api/v1/marketplace/categories');
    expect(categories.length).toBeGreaterThan(0);
  });

  it('turns a missing record into a not_found ApiError carrying the request id the server logged', async () => {
    const { client } = await loadClient(API_URL, buyerToken);
    const error = (await client
      .apiFetch('/api/v1/orders/00000000-0000-4000-8000-000000000000')
      .catch((e: unknown) => e)) as ApiErrorType;
    expect(error).toBeInstanceOf(client.ApiError);
    expect(error).toMatchObject({ status: 404, code: 'not_found', kind: 'notFound', message: 'Order not found' });
    expect(error.requestId).toMatch(/^[0-9a-f-]{32,36}$/);
  });

  it('reports a validation failure with the offending field', async () => {
    const { client } = await loadClient(API_URL, buyerToken);
    const error = (await client
      .apiFetch('/api/v1/orders/checkout', { method: 'POST', body: { cart_items: 'nope' } })
      .catch((e: unknown) => e)) as ApiErrorType;
    expect(error).toMatchObject({ status: 422, code: 'validation_failed', kind: 'validation' });
    expect(error.fields[0]).toMatchObject({ loc: ['body', 'cart_items'] });
  });

  it('distinguishes a wrong role from a suspended account', async () => {
    const { client } = await loadClient(API_URL, buyerToken);
    const error = await client.apiFetch('/api/v1/dealer/inventory').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 403, code: 'insufficient_role', kind: 'forbidden' });
  });

  it('treats a rejected token as a dead session: refresh fails, so the user is signed out', async () => {
    const { client } = await loadClient(API_URL, 'not-a-real-token');
    const error = await client.apiFetch('/api/v1/orders').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 401, code: 'session_expired', kind: 'auth' });
  });

  it('reports a network failure when the server is unreachable, after retrying the GET', async () => {
    const { client, network } = await loadClient('http://127.0.0.1:1', buyerToken);
    const error = await client.apiFetch('/api/v1/orders').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, code: 'network', kind: 'network' });
    expect(network.getState().isOffline).toBe(true);
  }, 30_000);

  it('routes the generated SDK through the same pipeline: same token, same ApiError', async () => {
    const { client, generated } = await loadClient(API_URL, dealerToken);
    client.configureGeneratedClient();
    const stores = await generated.dealerListStores();
    expect(Array.isArray(stores.data)).toBe(true);
    const forbidden = (await generated.adminGetPlatformStats().catch((e: unknown) => e)) as ApiErrorType;
    expect(forbidden).toBeInstanceOf(client.ApiError);
    expect(forbidden.code).toBe('insufficient_role');
  });
});
