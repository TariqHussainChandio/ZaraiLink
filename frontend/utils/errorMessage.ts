import { isApiError, type ApiErrorKind, type ErrorCode } from '../services/api/errors';

/**
 * One message per stable API error code. Typed by `ErrorCode`, so a code the backend adds to its OpenAPI document
 * (and therefore to the generated types) fails the type check until it has a message here.
 */
export const ERROR_CODE_MESSAGES: Record<ErrorCode, string> = {
  bad_request: 'The request was not valid.',
  unauthenticated: 'Please sign in again.',
  token_invalid: 'Your session is no longer valid. Please sign in again.',
  session_expired: 'Your session has expired. Please sign in again.',
  auth_unavailable: 'We could not verify your sign-in just now. Please try again in a moment.',
  account_suspended: 'Your account is suspended.',
  account_not_approved: 'Your application is waiting for an administrator.',
  sign_in_again: 'Your account was approved. Sign in again to continue.',
  insufficient_role: 'You are not allowed to do this.',
  mfa_required: 'This action needs two-step verification.',
  incorrect_password: 'That password is not correct.',
  forbidden: 'You are not allowed to do this.',
  not_found: 'We could not find what you were looking for.',
  conflict: 'This already exists or is still in use.',
  idempotency_in_progress: 'Your previous request is still being processed. Please wait a moment.',
  idempotency_key_reused: 'This request cannot be sent again as it is. Please start again.',
  payload_too_large: 'The file or data you sent is too large.',
  validation_failed: 'Some of the information is not valid. Please check it and try again.',
  insufficient_stock: 'That quantity is not available.',
  listing_unavailable: 'This listing is no longer available.',
  invalid_transition: 'That change is not possible at this stage.',
  // A3b. The review step lists what is missing itself; the server's list is in English, which is never shown.
  application_incomplete: 'Your application is missing something. Check the list of required items.',
  application_locked: 'Your application is with an administrator and cannot be changed until they decide.',
  rate_limited: 'Too many requests. Please try again in a minute.',
  service_unavailable: 'The service is not available right now. Please try again shortly.',
  server_error: 'Something went wrong on our side. Please try again shortly.',
  network: 'No internet connection. Check your connection and try again.',
  timeout: 'This is taking too long. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

/** Used when a newer backend sends a code this build does not know yet. */
export const ERROR_KIND_MESSAGES: Record<ApiErrorKind, string> = {
  network: 'No internet connection. Check your connection and try again.',
  timeout: 'This is taking too long. Please try again.',
  auth: 'Please sign in again.',
  forbidden: 'You are not allowed to do this.',
  validation: 'Some of the information is not valid. Please check it and try again.',
  notFound: 'We could not find what you were looking for.',
  conflict: 'This already exists or is still in use.',
  rateLimited: 'Too many requests. Please try again in a minute.',
  server: 'Something went wrong on our side. Please try again shortly.',
  unknown: 'Something went wrong. Please try again.',
};

// Read through a string index so an unknown code from a newer server falls through to the kind's message.
const byCode: Readonly<Record<string, string | undefined>> = ERROR_CODE_MESSAGES;

/**
 * The text a user sees for a failure.
 *
 * An `ApiError` is mapped from its stable `code`, never from the server's English title. A validation error that
 * names a field says which one. Anything else (an error from the Supabase SDK, a bug) keeps its own message, so a
 * non-API failure is never hidden behind a generic line; a value that is not an Error becomes the generic message.
 */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    const field = error.code === 'validation_failed' ? error.fields[0]?.loc.filter(part => part !== 'body').join('.') : '';
    const base = byCode[error.code] ?? ERROR_KIND_MESSAGES[error.kind];
    return field ? `${base} (${field})` : base;
  }
  if (error instanceof Error && error.message) return error.message;
  return ERROR_CODE_MESSAGES.unknown;
}
