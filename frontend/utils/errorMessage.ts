import { isApiError, type ApiErrorKind, type ErrorCode } from '../services/api/errors';

/**
 * One message per stable API error code. Typed by `ErrorCode`, so a code the backend adds to its OpenAPI document
 * (and therefore to the generated types) fails the type check until it has a message here.
 *
 * The voice (D15, "Content"): short, active, no "we" and no apology, and each says what to do next.
 */
export const ERROR_CODE_MESSAGES: Record<ErrorCode, string> = {
  bad_request: 'That request was not valid. Check what you entered and try again.',
  unauthenticated: 'Sign in again to continue.',
  token_invalid: 'Your session is no longer valid. Sign in again.',
  session_expired: 'Your session has expired. Sign in again.',
  auth_unavailable: 'Signing in is not available just now. Try again in a moment.',
  account_suspended: 'Your account is suspended.',
  account_not_approved: 'Your application is waiting for an administrator.',
  sign_in_again: 'Your account was approved. Sign in again to continue.',
  insufficient_role: 'Your account cannot do this.',
  mfa_required: 'This action needs two-step verification.',
  incorrect_password: 'That password is not correct.',
  forbidden: 'Your account cannot do this.',
  not_found: 'That could not be found. It may have been removed.',
  conflict: 'That already exists, or it is still in use.',
  idempotency_in_progress: 'Your last request is still being processed. Wait a moment.',
  idempotency_key_reused: 'That request cannot be sent again as it is. Start again.',
  payload_too_large: 'The file or data is too large. Choose a smaller one.',
  validation_failed: 'Some of the information is not valid. Check it and try again.',
  insufficient_stock: 'That quantity is not in stock. Choose a smaller amount.',
  listing_unavailable: 'This listing is no longer available.',
  invalid_transition: 'That cannot be done at this stage.',
  // A3b. The review step lists what is missing itself; the server's list is in English, which is never shown.
  application_incomplete: 'Your application is missing something. Check the list of required items.',
  application_locked: 'Your application is with an administrator and cannot be changed until they decide.',
  rate_limited: 'Too many tries. Wait a minute, then try again.',
  service_unavailable: 'The service is not available right now. Try again shortly.',
  server_error: 'The server had a problem. Try again shortly.',
  network: 'No connection. Check your internet, then try again.',
  timeout: 'This is taking too long. Check your internet, then try again.',
  unknown: 'That did not work. Try again.',
};

/** Used when a newer backend sends a code this build does not know yet. A network failure, a rejected sign-in, a missing
 * item (404), a clash (409), invalid input (422) and a server fault (5xx) each say something different to do. */
export const ERROR_KIND_MESSAGES: Record<ApiErrorKind, string> = {
  network: 'No connection. Check your internet, then try again.',
  timeout: 'This is taking too long. Check your internet, then try again.',
  auth: 'Sign in again to continue.',
  forbidden: 'Your account cannot do this.',
  validation: 'Some of the information is not valid. Check it and try again.',
  notFound: 'That could not be found. It may have been removed.',
  conflict: 'That changed while you were working. Reload, then try again.',
  rateLimited: 'Too many tries. Wait a minute, then try again.',
  server: 'The server had a problem. Try again shortly.',
  unknown: 'That did not work. Try again.',
};

// Read through a string index so an unknown code from a newer server falls through to the kind's message.
const byCode: Readonly<Record<string, string | undefined>> = ERROR_CODE_MESSAGES;

/** A request that never got an answer from outside our API client: supabase-js (sign-in, sign-up) and `fetch` itself. */
const NETWORK_FAILURE = /network request failed|failed to fetch|\bload failed|internet connection appears to be offline/i;

/** A field's name in the words a person uses: `stock_quantity` is "stock quantity", `category_id` is "category". The
 * server's field names, brackets and dots never reach the screen. */
function plainFieldName(loc: (string | number)[]): string | null {
  const name = [...loc].reverse().find((part): part is string => typeof part === 'string' && part !== 'body');
  if (!name) return null;
  return name
    .replace(/_id$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase();
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Check the stock quantity and price, then try again." for a validation failure that names fields; null when it names
 * none we can say in words. At most three are named. */
function fieldsMessage(fields: { loc: (string | number)[] }[]): string | null {
  const names = [...new Set(fields.map(field => plainFieldName(field.loc)).filter((name): name is string => name !== null))].slice(0, 3);
  return names.length ? `Check the ${joinNames(names)}, then try again.` : null;
}

/**
 * The text a user sees for a failure.
 *
 * An `ApiError` is mapped from its stable `code`, never from the server's English title; a validation error that names
 * fields says which, in plain words. A connection that never reached anywhere reads as a connection problem whichever
 * client it came from. Anything else (an error from the Supabase SDK, a bug) keeps its own message, so a non-API failure
 * is never hidden behind a generic line; a value that is not an Error becomes the generic message.
 */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === 'validation_failed') return fieldsMessage(error.fields) ?? ERROR_CODE_MESSAGES.validation_failed;
    return byCode[error.code] ?? ERROR_KIND_MESSAGES[error.kind];
  }
  if (error instanceof Error && error.message) {
    return NETWORK_FAILURE.test(error.message) || error.name === 'AuthRetryableFetchError' ? ERROR_CODE_MESSAGES.network : error.message;
  }
  return ERROR_CODE_MESSAGES.unknown;
}
