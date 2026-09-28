import { useMutation } from '@tanstack/react-query';
import {
  resendRecoveryOtp,
  resendSignupOtp,
  resetPassword,
  signIn,
  signUp,
  verifyRecoveryOtp,
  verifySignupOtp,
  type AuthChannel,
} from '../services/authService';

export type { AuthChannel };

/*
 * Sign-in, sign-up and the one-time-code flows. None of them is cached or retried: a failed attempt is shown to the
 * user, who decides whether to try again (a retried sign-up or code check could lock the account or use up a code).
 * A successful sign-in or sign-out is picked up by the auth store's own session listener, not by these hooks.
 */

export function useSignIn() {
  return useMutation({ mutationFn: (input: Parameters<typeof signIn>[0]) => signIn(input) });
}

export function useSignUp() {
  return useMutation({ mutationFn: (input: Parameters<typeof signUp>[0]) => signUp(input) });
}

export function useVerifySignupOtp() {
  return useMutation({
    mutationFn: ({ channel, identifier, token }: { channel: AuthChannel; identifier: string; token: string }) =>
      verifySignupOtp(channel, identifier, token),
  });
}

export function useResendSignupOtp() {
  return useMutation({
    mutationFn: ({ channel, identifier }: { channel: AuthChannel; identifier: string }) =>
      resendSignupOtp(channel, identifier),
  });
}

export function useResetPassword() {
  return useMutation({ mutationFn: (email: string) => resetPassword(email) });
}

export function useVerifyRecoveryOtp() {
  return useMutation({
    mutationFn: ({ email, token }: { email: string; token: string }) => verifyRecoveryOtp(email, token),
  });
}

export function useResendRecoveryOtp() {
  return useMutation({ mutationFn: (email: string) => resendRecoveryOtp(email) });
}
