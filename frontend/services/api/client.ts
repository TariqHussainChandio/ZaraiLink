import * as Crypto from 'expo-crypto';
import { client as generatedClient } from '../../api/generated/client.gen';
import { ENV } from '../../config/env';
import { useAuthStore } from '../../store/authStore';
import { useNetworkStore } from '../../store/networkStore';
import { addApiBreadcrumb } from '../observability/breadcrumbs';
import { supabase } from '../supabase/client';
import { ApiError, apiErrorFromNetwork, apiErrorFromResponse } from './errors';

export { ApiError, isApiError } from './errors';

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Milliseconds before the request is abandoned. Default 15 s; slow calls (image inference) pass more. */
  timeoutMs?: number;
  /** Sent as `Idempotency-Key`. Only checkout and payment initiation honour it (see services/api/idempotency.ts). */
  idempotencyKey?: string;
  /** Lets a caller cancel (React Query passes one). A cancelled request rejects with the platform AbortError. */
  signal?: AbortSignal;
}

/** A request already reduced to what goes on the wire: shared by `apiFetch` and the generated client's transport. */
interface PreparedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_RETRY_AFTER_MS = 5_000;

// 401 codes that mean "this token is no good": worth one silent refresh, and a sign-out if that fails. A 401 with any
// other code (the wrong password on a re-authentication prompt) is an ordinary error, not a dead session.
const SESSION_CODES = new Set(['unauthenticated', 'token_invalid']);

function buildUrl(path: string, query?: ApiFetchOptions['query']): string {
  const url = new URL(`${ENV.apiBaseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter, capped, so many clients retrying one outage do not all return at once. */
function backoffMs(attempt: number): number {
  return Math.min(2_000, 300 * 2 ** attempt) * (0.5 + Math.random() * 0.5);
}

/** One try, with a timeout. Rejects with an ApiError (network or timeout), or the caller's own AbortError. */
async function tryOnce(request: PreparedRequest, token: string | undefined, requestId: string): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, request.timeoutMs);
  const onOuterAbort = () => controller.abort();
  request.signal?.addEventListener('abort', onOuterAbort);
  try {
    return await fetch(request.url, {
      method: request.method,
      headers: { ...request.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: request.body,
      signal: controller.signal,
    });
  } catch (cause) {
    if (request.signal?.aborted) throw cause;
    throw apiErrorFromNetwork(timedOut, requestId);
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * The whole request pipeline, shared by every call the app makes. Returns the successful Response, or throws ApiError.
 *
 * - The signed-in user's own Supabase session token is attached to every request. A missing session still sends the
 *   request (some endpoints, reference-data reads, are public); the backend decides what requires auth.
 * - Timeout and retries: a GET is tried up to three times on a dropped connection, a timeout, or a 502/503/504, with
 *   jittered exponential backoff (and `Retry-After` up to 5 s). A write is never retried automatically: whether the
 *   first try reached the server is unknown, and the caller's Idempotency-Key is what makes a manual retry safe.
 * - P4 (4B.2), kept: a 401 that means a bad token gets one `refreshSession()` and one resend before the user is signed
 *   out; a 403 `account_suspended` routes to the suspended screen without touching the session; a network failure sets
 *   the global offline flag and any response clears it.
 * - Every request carries an `X-Request-ID` that the backend echoes into its logs, and reports a breadcrumb (see
 *   services/observability) so a crash report can be matched to the server side.
 */
async function performRequest(request: PreparedRequest): Promise<Response> {
  const requestId = Crypto.randomUUID();
  const started = Date.now();
  const path = new URL(request.url).pathname;
  const headers = { ...request.headers, 'X-Request-ID': requestId };
  const prepared = { ...request, headers };
  const idempotent = request.method === 'GET' || request.method === 'HEAD';

  let refreshed = false;
  let attempt = 0;

  const finish = (status: number, errorCode?: string) =>
    addApiBreadcrumb({ method: request.method, path, status, requestId, durationMs: Date.now() - started, errorCode });

  for (;;) {
    const { data } = await supabase.auth.getSession();
    let response: Response;
    try {
      response = await tryOnce(prepared, data.session?.access_token, requestId);
    } catch (error) {
      if (error instanceof ApiError) {
        useNetworkStore.getState().setOffline(true);
        if (idempotent && attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt++));
          continue;
        }
        finish(0, error.code);
      }
      throw error;
    }
    useNetworkStore.getState().setOffline(false);

    if (response.ok) {
      finish(response.status);
      return response;
    }

    const failure = await apiErrorFromResponse(response.clone(), requestId);

    if (response.status === 401 && SESSION_CODES.has(failure.code) && !refreshed) {
      refreshed = true;
      const { data: next, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError?.name === 'AuthRetryableFetchError') {
        // Could not reach Supabase to refresh: that is being offline, not an expired session, so no sign-out.
        useNetworkStore.getState().setOffline(true);
        finish(0, 'network');
        throw apiErrorFromNetwork(false, requestId);
      }
      if (!refreshError && next.session) {
        let retried: Response;
        try {
          retried = await tryOnce(prepared, next.session.access_token, requestId);
        } catch (error) {
          useNetworkStore.getState().setOffline(true);
          finish(0, error instanceof ApiError ? error.code : undefined);
          throw error;
        }
        if (retried.ok) {
          finish(retried.status);
          return retried;
        }
        if (retried.status !== 401) {
          const error = await apiErrorFromResponse(retried, requestId);
          finish(retried.status, error.code);
          throw error;
        }
      }
    }
    if (response.status === 401 && SESSION_CODES.has(failure.code)) {
      await useAuthStore.getState().signOut();
      finish(401, 'session_expired');
      throw new ApiError({
        status: 401,
        code: 'session_expired',
        kind: 'auth',
        message: 'Your session has expired',
        requestId: failure.requestId,
      });
    }

    if (response.status === 403 && failure.code === 'account_suspended') {
      useAuthStore.setState({ status: 'suspended' });
    }

    const retryAfterMs = (failure.retryAfterSeconds ?? 0) * 1000;
    const retryable =
      RETRYABLE_STATUSES.has(response.status) || (response.status === 429 && retryAfterMs <= MAX_RETRY_AFTER_MS);
    if (idempotent && retryable && attempt < MAX_RETRIES) {
      await sleep(Math.max(retryAfterMs, backoffMs(attempt++)));
      continue;
    }

    finish(response.status, failure.code);
    throw failure;
  }
}

function prepare(path: string, options: ApiFetchOptions): PreparedRequest {
  const hasBody = options.body !== undefined;
  return {
    url: buildUrl(path, options.query),
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: options.signal,
  };
}

/**
 * The seam every domain service (except `authService.ts`, which stays on the Supabase Auth SDK) calls through.
 * Returns the parsed JSON body, or `undefined` for a 204. Any failure is an `ApiError`.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const response = await performRequest(prepare(path, options));
  if (response.status === 204) return undefined as T;
  return response.json();
}

export interface Page<T> {
  data: T;
  /** The limit and offset of the next page, from the `Link: rel="next"` header; null on the last page. */
  next: { limit: number; offset: number } | null;
}

/** Like `apiFetch` for a paginated list: also reads the `Link` header the backend sets on a full page. */
export async function apiFetchPage<T>(path: string, options: ApiFetchOptions = {}): Promise<Page<T>> {
  const response = await performRequest(prepare(path, options));
  return { data: (await response.json()) as T, next: parseNextLink(response.headers.get('Link')) };
}

export function parseNextLink(link: string | null): Page<unknown>['next'] {
  const match = link?.match(/<([^>]+)>\s*;\s*rel="next"/);
  if (!match) return null;
  const params = new URL(match[1] ?? '', 'http://placeholder').searchParams;
  const limit = Number(params.get('limit'));
  const offset = Number(params.get('offset'));
  return Number.isFinite(limit) && Number.isFinite(offset) && params.has('offset') ? { limit, offset } : null;
}

/** The generated SDK's transport: the same pipeline, so its calls get auth, timeouts, retries and ApiError too. */
async function generatedTransport(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'authorization') headers[key] = value; // the pipeline attaches the real session token
  });
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
  return performRequest({
    url: request.url,
    method: request.method,
    headers,
    body: body || undefined,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    signal: request.signal,
  });
}

/** Points the generated client (src/api/generated) at our backend and through our pipeline. Call once at startup. */
export function configureGeneratedClient(): void {
  generatedClient.setConfig({ baseUrl: ENV.apiBaseUrl, fetch: generatedTransport, throwOnError: true });
}
