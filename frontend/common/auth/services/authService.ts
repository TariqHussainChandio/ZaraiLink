import { supabase } from '../../../services/supabase/client';
import type { Role } from '../../constants/roles';

/** Which identifier the user chose at sign-up/sign-in — both send a numeric OTP. */
export type AuthChannel = 'email' | 'phone';

export interface SignUpInput {
  channel: AuthChannel;
  /** Email address or E.164 phone number, matching `channel`. */
  identifier: string;
  password: string;
  fullName: string;
  role: Role;
}

export interface SignInInput {
  channel: AuthChannel;
  identifier: string;
  password: string;
}

export async function signUp({ channel, identifier, password, fullName, role }: SignUpInput) {
  const { data, error } = await supabase.auth.signUp({
    ...(channel === 'email' ? { email: identifier } : { phone: identifier }),
    password,
    options: {
      data: {
        full_name: fullName,
        role,
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function signIn({ channel, identifier, password }: SignInInput) {
  const { data, error } = await supabase.auth.signInWithPassword(
    channel === 'email' ? { email: identifier, password } : { phone: identifier, password },
  );
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function verifySignupOtp(channel: AuthChannel, identifier: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp(
    channel === 'email'
      ? { email: identifier, token, type: 'signup' }
      : { phone: identifier, token, type: 'sms' },
  );
  if (error) throw error;
  return data;
}

export async function resendSignupOtp(channel: AuthChannel, identifier: string) {
  const { error } = await supabase.auth.resend(
    channel === 'email' ? { type: 'signup', email: identifier } : { type: 'sms', phone: identifier },
  );
  if (error) throw error;
}

// P4 (4B.4): recovery via a numeric code (VerifyOtpScreen, `type: 'recovery'`), not a deep link —
// no `redirectTo`, since there is no link to follow anymore. `verifyOtp` below returns a real
// session on success, the same way it already does for signup, firing the PASSWORD_RECOVERY auth
// event authStore listens for regardless of how that session was established.
export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function verifyRecoveryOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
  if (error) throw error;
  return data;
}

// There is no `resend` type for recovery (GoTrue's ResendParams only covers 'signup'/
// 'email_change' — a recovery code has no "pending confirmation" to resend). Requesting the
// reset again generates a fresh code the same way the first request did, which is exactly what
// "resend" means here.
export async function resendRecoveryOtp(email: string) {
  await resetPassword(email);
}
