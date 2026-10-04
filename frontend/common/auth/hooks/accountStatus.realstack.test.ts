/**
 * A3a real-stack test: a dealer waiting for a decision, through the app's own client against the real FastAPI and the
 * real local Supabase (no fakes). Setup and how to run it: frontend/testUtils/realStack.ts
 * (`ZARAILINK_REALSTACK=1 npx jest realstack`).
 */
import type { ApiError as ApiErrorType } from '../../../services/api/errors';
import { API_URL, approveInLocalDatabase, installNodeFetch, realStackEnabled, signUp } from '../../../testUtils/realStack';

installNodeFetch();

const describeReal = realStackEnabled ? describe : describe.skip;

async function loadApp(token: string) {
  process.env.EXPO_PUBLIC_API_BASE_URL = API_URL;
  jest.resetModules();
  jest.doMock('../../../services/supabase/client', () => ({
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { access_token: token } } }),
        refreshSession: async () => ({ data: { session: null }, error: new Error('no refresh in this test') }),
        signOut: async () => ({ error: null }),
      },
    },
  }));
  return {
    client: jest.requireActual<typeof import('../../../services/api/client')>('../../../services/api/client'),
    store: jest.requireActual<typeof import('../../../state/authStore')>('../../../state/authStore').useAuthStore,
  };
}

function userIdOf(token: string): string {
  const payload = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
  return (JSON.parse(atob(payload)) as { sub: string }).sub;
}

describeReal('a dealer waiting for a decision, against the real backend (D10)', () => {
  it('is refused as not approved and sent to the Application Status screen; once approved, the same call works', async () => {
    const token = await signUp('dealer', { pending: true });
    const { client, store } = await loadApp(token);
    store.setState({ status: 'authenticated' });

    const error = (await client.apiFetch('/api/v1/dealer/inventory').catch((e: unknown) => e)) as ApiErrorType;
    expect(error).toBeInstanceOf(client.ApiError);
    expect(error).toMatchObject({ status: 403, code: 'account_not_approved' });
    expect(store.getState().status).toBe('awaitingApproval');

    // What a pending dealer may still do: edit their own profile.
    await expect(client.apiFetch('/api/v1/profile', { method: 'PATCH', body: { city: 'Multan' } })).resolves.toBeUndefined();

    approveInLocalDatabase(userIdOf(token));
    await expect(client.apiFetch('/api/v1/dealer/inventory')).resolves.toEqual([]);
  }, 60_000);

  it('has nothing to resubmit while pending', async () => {
    const token = await signUp('dealer', { pending: true });
    const { client } = await loadApp(token);
    const error = (await client
      .apiFetch('/api/v1/profile/application/resubmit', { method: 'POST' })
      .catch((e: unknown) => e)) as ApiErrorType;
    expect(error).toMatchObject({ status: 409, code: 'invalid_transition' });
  }, 60_000);
});
