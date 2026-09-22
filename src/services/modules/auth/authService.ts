import { supabase } from '../../supabase/client';
import type { Role } from '../../../constants/roles';

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

export async function resetPassword(email: string) {
  // Without redirectTo, Supabase falls back to the project's site_url (a placeholder value with
  // nothing hosted there, since this app has no web frontend) — the app-scheme deep link below is
  // registered from `scheme` in app.config.ts (see linking.ts) and caught by authStore's Linking listener.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'zarailink://reset-password',
  });
  if (error) throw error;
}
