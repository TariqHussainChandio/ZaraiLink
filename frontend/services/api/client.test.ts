jest.mock('../supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual('../../testUtils/supabaseMock');
  return { supabase: makeSupabaseMock({ session: { access_token: 'token-1', user: { id: 'user-1' } } }) };
});

import { adminGetPlatformStats } from './generated';
import { makeSupabaseMock } from '../../testUtils/supabaseMock';
import { useAuthStore } from '../../state/authStore';
import { useNetworkStore } from '../../state/networkStore';
import { setBreadcrumbSink, type ApiBreadcrumb } from '../observability/breadcrumbs';
import { supabase } from '../supabase/client';
import { apiFetch, apiFetchPage, ApiError, configureGeneratedClient, parseNextLink } from './client';
import problems from './__fixtures__/problems.json';

const mockedSupabase = supabase as unknown as ReturnType<typeof makeSupabaseMock>;

type Fixture = { status: number; contentType: string; body: Record<string, unknown> };
const fixtures = problems as unknown as Record<string, Fixture>;

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    clone() {
      return response(status, body, headers);
    },
  } as unknown as Response;
}

/** A response shaped exactly like one the real backend sent (recorded by the real-stack error contract test). */
function fromFixture(name: string, extraHeaders: Record<string, string> = {}): Response {
  const fixture = fixtures[name] as Fixture;
  return response(fixture.status, fixture.body, {
    'Content-Type': fixture.contentType,
    'X-Request-ID': 'server-request-id',
    ...extraHeaders,
  });
}

function sentHeaders(callIndex = 0): Record<string, string> {
  const init = (globalThis.fetch as jest.Mock).mock.calls[callIndex][1] as { headers: Record<string, string> };
  return init.headers;
}

/** Runs a request that sleeps between attempts (fake timers) to completion. */
async function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  const outcome = promise.then(
    value => ({ status: 'fulfilled', value }) as const,
    reason => ({ status: 'rejected', reason }) as const,
  );
  await jest.advanceTimersByTimeAsync(60_000);
  return outcome;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  setBreadcrumbSink(null);
  useNetworkStore.setState({ isOffline: false });
  useAuthStore.setState({ session: null, user: null, profile: null, role: null, status: 'authenticated' });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('apiFetch: success', () => {
  it('returns the parsed body and sends the token, a request id and JSON headers', async () => {
    globalThis.fetch = jest.fn(() => Promise.resolve(response(200, { hello: 'world' }))) as never;

    const result = await apiFetch<{ hello: string }>('/api/v1/thing', { method: 'POST', body: { a: 1 } });

    expect(result).toEqual({ hello: 'world' });
    const headers = sentHeaders();
    expect(headers.Authorization).toBe('Bearer token-1');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Request-ID']).toMatch(/[0-9a-f-]{36}/);
  });

  it('returns undefined for a 204', async () => {
    globalThis.fetch = jest.fn(() => Promise.resolve(response(204, null))) as never;
    expect(await apiFetch('/api/v1/thing', { method: 'PATCH', body: {} })).toBeUndefined();
  });

  it('sends an Idempotency-Key when given one', async () => {
    globalThis.fetch = jest.fn(() => Promise.resolve(response(200, []))) as never;
    await apiFetch('/api/v1/orders/checkout', { method: 'POST', body: {}, idempotencyKey: 'zl-abc' });
    expect(sentHeaders()['Idempotency-Key']).toBe('zl-abc');
  });

  it('clears the offline flag once any response arrives', async () => {
    useNetworkStore.setState({ isOffline: true });
    globalThis.fetch = jest.fn(() => Promise.resolve(response(200, {}))) as never;
    await apiFetch('/api/v1/thing');
    expect(useNetworkStore.getState().isOffline).toBe(false);
  });
});

describe('apiFetch: the error contract, replayed from real backend responses', () => {
  it.each([
    ['not_found', 404, 'notFound'],
    ['validation_failed', 422, 'validation'],
    ['insufficient_stock', 422, 'validation'],
    ['insufficient_role', 403, 'forbidden'],
    ['mfa_required', 403, 'forbidden'],
    ['idempotency_key_reused', 422, 'validation'],
  ])('%s becomes an ApiError with its code, status and kind', async (name, status, kind) => {
    globalThis.fetch = jest.fn(() => Promise.resolve(fromFixture(name))) as never;

    const result = await settle(apiFetch('/api/v1/thing', { method: 'POST', body: {} }));

    expect(result.status).toBe('rejected');
    const error = (result as PromiseRejectedResult).reason as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(name);
    expect(error.status).toBe(status);
    expect(error.kind).toBe(kind);
    expect(error.message).toBe(fixtures[name]?.body.title);
    expect(error.requestId).toBe('server-request-id');
  });

  it('carries the field errors of a validation failure', async () => {
    globalThis.fetch = jest.fn(() => Promise.resolve(fromFixture('validation_failed'))) as never;
    const result = await settle(apiFetch('/api/v1/orders/checkout', { method: 'POST', body: {} }));
    const error = (result as PromiseRejectedResult).reason as ApiError;
    expect(error.fields).toEqual([{ loc: ['body', 'cart_items'], msg: 'Input should be a valid list' }]);
  });

  it('falls back to the status when the body is not problem+json (a proxy error page)', async () => {
    const page = { ...response(502, null), json: () => Promise.reject(new Error('not json')) } as unknown as Response;
    globalThis.fetch = jest.fn(() => Promise.resolve(page)) as never;
    const result = await settle(apiFetch('/api/v1/thing', { method: 'POST', body: {} }));
    const error = (result as PromiseRejectedResult).reason as ApiError;
    expect(error.code).toBe('server_error');
    expect(error.message).toBe('Request failed (502)');
  });

  it('reads Retry-After from a rate-limit response', async () => {
    globalThis.fetch = jest.fn(() => Promise.resolve(fromFixture('rate_limited', { 'Retry-After': '60' }))) as never;
    const result = await settle(apiFetch('/api/v1/thing', { method: 'POST', body: {} }));
    const error = (result as PromiseRejectedResult).reason as ApiError;
    expect(error.kind).toBe('rateLimited');
    expect(error.retryAfterSeconds).toBe(60);
  });
});

describe('apiFetch: expired sessions (P4 4B.2, kept)', () => {
  it('refreshes once and resends with the new token when the token is rejected', async () => {
    let call = 0;
    globalThis.fetch = jest.fn(() => {
      call += 1;
      return Promise.resolve(call === 1 ? fromFixture('token_invalid') : response(200, { ok: true }));
    }) as never;
    mockedSupabase.auth.refreshSession.mockResolvedValueOnce({
      data: { session: { access_token: 'token-2' } },
      error: null,
    } as never);

    const result = await apiFetch<{ ok: boolean }>('/api/v1/thing');

    expect(result).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(sentHeaders(1).Authorization).toBe('Bearer token-2');
  });

  it('signs the user out with session_expired when the refresh fails', async () => {
    globalThis.fetch = jest.fn(() => Promise.resolve(fromFixture('unauthenticated'))) as never;
    mockedSupabase.auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('no') } as never);
    const signOut = jest.spyOn(useAuthStore.getState(), 'signOut').mockResolvedValue();

    const result = await settle(apiFetch('/api/v1/thing'));

    const error = (result as PromiseRejectedResult).reason as ApiError;
    expect(error.code).toBe('session_expired');
    expect(error.kind).toBe('auth');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out when the resent request is still rejected', async () => {
    globalThis.fetch = jest.fn(() => Promise.resolve(fromFixture('token_invalid'))) as never;
    mockedSupabase.auth.refreshSession.mockResolvedValueOnce({
      data: { session: { access_token: 'token-2' } },
      error: null,
    } as never);
    const signOut = jest.spyOn(useAuthStore.getState(), 'signOut').mockResolvedValue();

    await settle(apiFetch('/api/v1/thing'));

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('does not sign out when Supabase is unreachable during the refresh: that is offline, not expired', async () => {
    globalThis.fetch = jest.fn(() => Promise.resolve(fromFixture('token_invalid'))) as never;
    const unreachable = Object.assign(new Error('fetch failed'), { name: 'AuthRetryableFetchError' });
    mockedSupabase.auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: unreachable } as never);
    const signOut = jest.spyOn(useAuthStore.getState(), 'signOut').mockResolvedValue();

    const result = await settle(apiFetch('/api/v1/thing'));

    expect((result as PromiseRejectedResult).reason.kind).toBe('network');
    expect(signOut).not.toHaveBeenCalled();
    expect(useNetworkStore.getState().isOffline).toBe(true);
  });

  it('treats a 401 that is not about the token (a wrong password) as an ordinary error', async () => {
    const wrongPassword = response(
      401,
      { type: 'about:blank', title: 'Incorrect password.', status: 401, code: 'incorrect_password' },
      { 'Content-Type': 'application/problem+json' },
    );
    globalThis.fetch = jest.fn(() => Promise.resolve(wrongPassword)) as never;
    const signOut = jest.spyOn(useAuthStore.getState(), 'signOut').mockResolvedValue();

    const result = await settle(apiFetch('/api/v1/profile/me', { method: 'DELETE', body: { password: 'x' } }));

    const error = (result as PromiseRejectedResult).reason as ApiError;
    expect(error.code).toBe('incorrect_password');
    expect(mockedSupabase.auth.refreshSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('apiFetch: account suspended and other 403s (P4 4B.2, kept)', () => {
  it('routes to the suspended screen for account_suspended, without signing out', async () => {
    globalThis.fetch = jest.fn(() => Promise.resolve(fromFixture('account_suspended'))) as never;
    const signOut = jest.spyOn(useAuthStore.getState(), 'signOut').mockResolvedValue();

    const result = await settle(apiFetch('/api/v1/orders'));

    expect((result as PromiseRejectedResult).reason.code).toBe('account_suspended');
    expect(useAuthStore.getState().status).toBe('suspended');
    expect(signOut).not.toHaveBeenCalled();
  });

  it.each(['insufficient_role', 'mfa_required'])('does not treat %s as a suspension', async name => {
    globalThis.fetch = jest.fn(() => Promise.resolve(fromFixture(name))) as never;
    await settle(apiFetch('/api/v1/admin/stats'));
    expect(useAuthStore.getState().status).toBe('authenticated');
  });
});

describe('apiFetch: an application waiting for a decision (A3a)', () => {
  it('routes account_not_approved to the Application Status screen, without signing out', async () => {
    globalThis.fetch = jest.fn(() => Promise.resolve(fromFixture('account_not_approved'))) as never;
    const signOut = jest.spyOn(useAuthStore.getState(), 'signOut').mockResolvedValue();

    const result = await settle(apiFetch('/api/v1/dealer/inventory'));

    expect((result as PromiseRejectedResult).reason.code).toBe('account_not_approved');
    expect(useAuthStore.getState().status).toBe('awaitingApproval');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('routes sign_in_again to the screen that asks the approved user to sign in again', async () => {
    globalThis.fetch = jest.fn(() => Promise.resolve(fromFixture('sign_in_again'))) as never;

    const result = await settle(apiFetch('/api/v1/dealer/inventory'));

    expect((result as PromiseRejectedResult).reason.code).toBe('sign_in_again');
    expect(useAuthStore.getState().status).toBe('approvalGranted');
  });
});

describe('apiFetch: connection failures, timeouts and retries', () => {
  it('retries a GET twice on a dropped connection, then reports a network error and sets the offline flag', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as never;

    const result = await settle(apiFetch('/api/v1/thing'));

    const error = (result as PromiseRejectedResult).reason as ApiError;
    expect(error.code).toBe('network');
    expect(error.status).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(useNetworkStore.getState().isOffline).toBe(true);
  });

  it('never retries a write: whether the first try arrived is unknown', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as never;
    const result = await settle(apiFetch('/api/v1/orders/checkout', { method: 'POST', body: {} }));
    expect((result as PromiseRejectedResult).reason.code).toBe('network');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('recovers when a retry of a GET succeeds', async () => {
    let call = 0;
    globalThis.fetch = jest.fn(() => {
      call += 1;
      return call === 1 ? Promise.reject(new TypeError('Network request failed')) : Promise.resolve(response(200, { ok: 1 }));
    }) as never;
    const result = await settle(apiFetch('/api/v1/thing'));
    expect(result).toEqual({ status: 'fulfilled', value: { ok: 1 } });
    expect(useNetworkStore.getState().isOffline).toBe(false);
  });

  it('gives up on a request that takes longer than its timeout', async () => {
    globalThis.fetch = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as never;

    const result = await settle(apiFetch('/api/v1/thing', { method: 'POST', body: {}, timeoutMs: 1_000 }));

    const error = (result as PromiseRejectedResult).reason as ApiError;
    expect(error.code).toBe('timeout');
    expect(error.kind).toBe('timeout');
  });

  it('lets the caller cancel: a cancelled request rejects with the abort, not an ApiError', async () => {
    const controller = new AbortController();
    globalThis.fetch = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    ) as never;
    const pending = settle(apiFetch('/api/v1/thing', { signal: controller.signal }));
    controller.abort();
    const result = await pending;
    expect((result as PromiseRejectedResult).reason).not.toBeInstanceOf(ApiError);
  });

  it('retries a GET on 503 and honours Retry-After on 429, but not a POST', async () => {
    let call = 0;
    globalThis.fetch = jest.fn(() => {
      call += 1;
      return Promise.resolve(call < 3 ? fromFixture('service_unavailable') : response(200, { ok: true }));
    }) as never;
    expect(await settle(apiFetch('/api/v1/thing'))).toEqual({ status: 'fulfilled', value: { ok: true } });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    globalThis.fetch = jest.fn(() => Promise.resolve(fromFixture('service_unavailable'))) as never;
    await settle(apiFetch('/api/v1/thing', { method: 'POST', body: {} }));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('observability', () => {
  it('reports one breadcrumb per call with the request id the backend also logs', async () => {
    const breadcrumbs: ApiBreadcrumb[] = [];
    setBreadcrumbSink(b => breadcrumbs.push(b));
    globalThis.fetch = jest.fn(() => Promise.resolve(fromFixture('not_found'))) as never;

    await settle(apiFetch('/api/v1/orders/abc'));

    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]).toMatchObject({ method: 'GET', path: '/api/v1/orders/abc', status: 404, errorCode: 'not_found' });
    expect(breadcrumbs[0]?.requestId).toBe(sentHeaders()['X-Request-ID']);
  });
});

describe('pagination', () => {
  it('reads the next page from the Link header', () => {
    expect(parseNextLink('</api/v1/orders?limit=20&offset=20>; rel="next"')).toEqual({ limit: 20, offset: 20 });
    expect(parseNextLink(null)).toBeNull();
    expect(parseNextLink('</api/v1/orders>; rel="prev"')).toBeNull();
  });

  it('apiFetchPage returns the data and the next-page cursor', async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve(response(200, [{ id: 1 }], { Link: '</api/v1/orders?limit=2&offset=2>; rel="next"' })),
    ) as never;
    expect(await apiFetchPage('/api/v1/orders', { query: { limit: 2 } })).toEqual({
      data: [{ id: 1 }],
      next: { limit: 2, offset: 2 },
    });
  });
});

describe('the generated client goes through the same pipeline', () => {
  it('attaches the session token and maps errors to ApiError', async () => {
    configureGeneratedClient();
    globalThis.fetch = jest.fn(() => Promise.resolve(fromFixture('insufficient_role'))) as never;

    const result = await settle(adminGetPlatformStats());

    expect((result as PromiseRejectedResult).reason).toBeInstanceOf(ApiError);
    expect((result as PromiseRejectedResult).reason.code).toBe('insufficient_role');
    expect(sentHeaders().Authorization).toBe('Bearer token-1');
  });
});
