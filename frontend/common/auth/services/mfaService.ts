import { supabase } from '../../../services/supabase/client';

// P4 (4A.4/4B): admin MFA enrolment goes straight through the Supabase Auth SDK, the same way
// every other auth operation in this app does (signup, signin, OTP, password reset) — FastAPI
// never brokers this, it only ever consumes the resulting session's `aal` claim
// (auth/dependencies.py:require_admin_aal2).

export interface TotpEnrollment {
  factorId: string;
  qrCodeSvg: string;
  secret: string;
}

/** The verified TOTP factor's id, or null if none is enrolled — needed either way: to show the
 * enrolled state, and to actually call unenrollTotp(factorId) for a factor enrolled in an
 * earlier session (enrollTotp()'s own response is the only other source of a factorId, but that
 * only exists for a freshly-started enrollment, not one already on the account). */
export async function getVerifiedTotpFactorId(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data.totp.find(factor => factor.status === 'verified')?.id ?? null;
}

export async function enrollTotp(): Promise<TotpEnrollment> {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  if (error) throw error;
  return { factorId: data.id, qrCodeSvg: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyTotpEnrollment(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
}

export async function unenrollTotp(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

/**
 * The second factor at sign-in (A3a verification, H1): the code from the authenticator turns this session into aal2, which
 * every admin write needs. Supabase then emits MFA_CHALLENGE_VERIFIED and the auth store applies the stronger session.
 */
export async function verifySecondFactor(code: string): Promise<void> {
  const factorId = await getVerifiedTotpFactorId();
  if (!factorId) throw new Error('No authenticator is set up for this account');
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
}
