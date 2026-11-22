import { AuthError } from '@supabase/supabase-js';
import { ERROR_CODE_MESSAGES, errorMessage } from '../../../utils/errorMessage';

const RATE_LIMITED = 'Too many attempts. Wait a moment before trying again.';

/** A request that never reached Supabase has no error code, so every mapper below would fall back to "Failed to sign in".
 * That says nothing about the cause or the fix; a lost connection is named instead. */
function connectionMessage(error: unknown): string | null {
  const message = errorMessage(error);
  return message === ERROR_CODE_MESSAGES.network || message === ERROR_CODE_MESSAGES.timeout ? message : null;
}

/** True when a send was refused only because one went out a moment ago. The code in the inbox is still good. */
export function isSendRateLimited(error: unknown): boolean {
  return error instanceof AuthError && (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit');
}

/** True when sign-in was refused because the email code was never entered. */
export function isEmailNotConfirmed(error: unknown): boolean {
  return error instanceof AuthError && error.code === 'email_not_confirmed';
}

/**
 * The same idea for the password flows (sign in, sign up, forgot and reset password). `invalid_credentials` means a
 * wrong password here, where in the one-time-code flow below it means a wrong code, so the two have separate mappers.
 */
export function mapPasswordFlowErrorMessage(error: unknown, fallbackMessage: string): string {
  const code = error instanceof AuthError ? error.code : undefined;
  const offline = connectionMessage(error);
  if (offline) return offline;

  switch (code) {
    case 'invalid_credentials':
      return 'Incorrect email or password.';
    case 'email_not_confirmed':
    case 'phone_not_confirmed':
      return 'Confirm your email first. Enter the code that was emailed to you.';
    case 'user_already_exists':
    case 'email_exists':
    case 'phone_exists':
      return 'An account with these details already exists. Try signing in.';
    case 'weak_password':
      return 'That password is too weak. Use at least 8 characters, with letters and numbers.';
    case 'same_password':
      return 'Choose a password different from your current one.';
    // A3a: a password change confirmed with the emailed code (secure_password_change).
    case 'reauthentication_not_valid':
      return 'That code is wrong or has expired. Send a new one and try again.';
    case 'reauthentication_needed':
      return 'Confirm it is you with the code we email you.';
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return RATE_LIMITED;
    default:
      return fallbackMessage;
  }
}

/** Two-factor enrolment and verification: a wrong or expired code says so; everything else shows the screen's own text. */
export function mapMfaErrorMessage(error: unknown, fallbackMessage: string): string {
  const code = error instanceof AuthError ? error.code : undefined;
  const offline = connectionMessage(error);
  if (offline) return offline;

  switch (code) {
    case 'mfa_verification_failed':
    case 'mfa_challenge_expired':
    case 'mfa_verification_rejected':
      return "That code isn't right. Check your app and try again.";
    case 'over_request_rate_limit':
      return RATE_LIMITED;
    default:
      return fallbackMessage;
  }
}

// P4 (4B.3): maps known GoTrue error codes to readable copy — a raw `error.message` off the SDK is inconsistent in
// tone and occasionally exposes implementation detail (e.g. Postgres error text). Falls back to `fallbackMessage`
// for anything not explicitly mapped, so an unrecognized error still shows something sensible rather than the raw
// string. This one is for the one-time-code flows (`invalid_credentials` there means a wrong code).
export function mapAuthErrorMessage(error: unknown, fallbackMessage: string): string {
  const code = error instanceof AuthError ? error.code : undefined;
  const offline = connectionMessage(error);
  if (offline) return offline;

  switch (code) {
    case 'otp_expired':
      return 'This code has expired. Ask for a new one.';
    case 'invalid_credentials':
      return 'That code is not right. Check it, or ask for a new one.';
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return RATE_LIMITED;
    default:
      return fallbackMessage;
  }
}
