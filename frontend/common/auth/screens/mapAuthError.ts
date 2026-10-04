import { AuthError } from '@supabase/supabase-js';

const RATE_LIMITED = 'Too many attempts. Wait a moment before trying again.';

/**
 * The same idea for the password flows (sign in, sign up, forgot and reset password). `invalid_credentials` means a
 * wrong password here, where in the one-time-code flow below it means a wrong code, so the two have separate mappers.
 */
export function mapPasswordFlowErrorMessage(error: unknown, fallbackMessage: string): string {
  const code = error instanceof AuthError ? error.code : undefined;

  switch (code) {
    case 'invalid_credentials':
      return 'Incorrect email or password.';
    case 'email_not_confirmed':
    case 'phone_not_confirmed':
      return 'Confirm your account with the code we sent, then sign in.';
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

  switch (code) {
    case 'otp_expired':
      return 'This code has expired. Request a new one.';
    case 'invalid_credentials':
      return "That code isn't right. Check it and try again.";
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return RATE_LIMITED;
    default:
      return fallbackMessage;
  }
}
