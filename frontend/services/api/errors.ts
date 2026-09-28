import type { ProblemDetail } from './generated';

/** Codes the backend sends (documented in backend/openapi.json), plus the ones only the client can produce. */
export type ErrorCode = ProblemDetail['code'] | 'network' | 'timeout' | 'session_expired' | 'unknown';

/** What the app does about an error, coarser than the code: screens branch on this, messages use the code. */
export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'forbidden'
  | 'validation'
  | 'notFound'
  | 'conflict'
  | 'rateLimited'
  | 'server'
  | 'unknown';

export interface FieldError {
  loc: (string | number)[];
  msg: string;
}

export interface ApiErrorInit {
  status: number;
  code: ErrorCode;
  kind: ApiErrorKind;
  message: string;
  requestId?: string;
  fields?: FieldError[];
  retryAfterSeconds?: number;
}

/**
 * Every failure of a call to our API, from a dropped connection to a validation error, as one class the app can
 * reason about. `status` is 0 when no response arrived. `message` is the server's English title (or a client
 * fallback): it is for logs and developers; the user sees `errorMessage(error)`, which is mapped from `code`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly kind: ApiErrorKind;
  readonly requestId?: string;
  readonly fields: FieldError[];
  readonly retryAfterSeconds?: number;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.kind = init.kind;
    this.requestId = init.requestId;
    this.fields = init.fields ?? [];
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rateLimited';
  if (status === 400 || status === 413 || status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

function codeForStatus(status: number): ErrorCode {
  const byStatus: Record<number, ErrorCode> = {
    400: 'bad_request',
    401: 'unauthenticated',
    403: 'forbidden',
    404: 'not_found',
    409: 'conflict',
    413: 'payload_too_large',
    422: 'validation_failed',
    429: 'rate_limited',
    503: 'service_unavailable',
  };
  return byStatus[status] ?? (status >= 500 ? 'server_error' : 'unknown');
}

/** Builds the error for a non-2xx response. Reads the RFC 9457 body the backend sends; anything else (a proxy's HTML
 * page, an empty body) still yields a usable error from the status alone. */
export async function apiErrorFromResponse(response: Response, requestId?: string): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as Partial<ProblemDetail> | null;
  const code = (typeof body?.code === 'string' ? body.code : codeForStatus(response.status)) as ErrorCode;
  const retryAfter = Number(response.headers?.get?.('Retry-After'));
  return new ApiError({
    status: response.status,
    code,
    kind: kindForStatus(response.status),
    message: typeof body?.title === 'string' ? body.title : `Request failed (${response.status})`,
    requestId: response.headers?.get?.('X-Request-ID') ?? requestId,
    fields: Array.isArray(body?.errors)
      ? body.errors.map(error => ({ loc: error.loc ?? [], msg: error.msg ?? '' }))
      : undefined,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  });
}

export function apiErrorFromNetwork(timedOut: boolean, requestId?: string): ApiError {
  return new ApiError({
    status: 0,
    code: timedOut ? 'timeout' : 'network',
    kind: timedOut ? 'timeout' : 'network',
    message: timedOut ? 'The request timed out' : 'No connection to the server',
    requestId,
  });
}
