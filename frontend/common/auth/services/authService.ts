import { supabase } from '../../../services/supabase/client';
import type { Role } from '../../constants/roles';

// Email only (A3a): Supabase Auth sends every code (sign-up, recovery, reauthentication) by email. Phone sign-up is off
// in supabase/config.toml because no SMS provider is configured (G2). Password strength, code length and expiry are
// Supabase's settings (config.toml); the app checks the same rules first only to answer sooner.
export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  role: Role;
}

export interface SignInInput {
  email: string;
  password: string;
}

export async function signUp({ email, password, fullName, role }: SignUpInput) {
  const { data, error } = await supabase.auth.signUp({
    email,
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

export async function signIn({ email, password }: SignInInput) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function verifySignupOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
  if (error) throw error;
  return data;
}

export async function resendSignupOtp(email: string) {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
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
