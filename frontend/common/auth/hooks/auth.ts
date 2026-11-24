// React Query mutation hooks for sign-in, sign-up and the email code flows.
import { useMutation } from '@tanstack/react-query';
import {
  resendRecoveryOtp,
  resendSignupOtp,
  resetPassword,
  signIn,
  signUp,
  verifyRecoveryOtp,
  verifySignupOtp,
} from '../services/authService';

/*
 * Sign-in, sign-up and the one-time-code flows. None of them is cached or retried: a failed attempt is shown to the
 * user, who decides whether to try again (a retried sign-up or code check could lock the account or use up a code).
 * A successful sign-in or sign-out is picked up by the auth store's own session listener, not by these hooks.
 */

// Signs in with email and password.
export function useSignIn() {
  return useMutation({ mutationFn: (input: Parameters<typeof signIn>[0]) => signIn(input) });
}

// Creates a new account.
export function useSignUp() {
  return useMutation({ mutationFn: (input: Parameters<typeof signUp>[0]) => signUp(input) });
}

// Checks the sign-up code from the email.
export function useVerifySignupOtp() {
  return useMutation({
    mutationFn: ({ email, token }: { email: string; token: string }) => verifySignupOtp(email, token),
  });
}

// Sends a new sign-up code.
export function useResendSignupOtp() {
  return useMutation({
    mutationFn: (email: string) => resendSignupOtp(email),
  });
}

// Sends a password reset code by email.
export function useResetPassword() {
  return useMutation({ mutationFn: (email: string) => resetPassword(email) });
}

// Checks the password reset code.
export function useVerifyRecoveryOtp() {
  return useMutation({
    mutationFn: ({ email, token }: { email: string; token: string }) => verifyRecoveryOtp(email, token),
  });
}

// Sends a new password reset code.
export function useResendRecoveryOtp() {
  return useMutation({ mutationFn: (email: string) => resendRecoveryOtp(email) });
}
