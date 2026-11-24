// React Query hooks for two-factor sign-in with an authenticator app.
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  enrollTotp,
  getVerifiedTotpFactorId,
  unenrollTotp,
  verifySecondFactor,
  verifyTotpEnrollment,
  type TotpEnrollment,
} from '../services/mfaService';
import { queryKeys } from '../../../hooks/keys';

export type { TotpEnrollment };

/**
 * The id of the user's verified authenticator factor, or `null`. It decides whether two-factor sign-in is on, so it
 * is read fresh every time the screen opens and never kept in the cache afterwards.
 */
export function useVerifiedTotpFactor() {
  return useQuery({
    queryKey: queryKeys.mfa.verifiedFactor(),
    queryFn: getVerifiedTotpFactorId,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

// Starts adding an authenticator app (returns the QR code).
export function useEnrollTotp() {
  return useMutation({ mutationFn: () => enrollTotp() });
}

// Confirms the new authenticator app with its first code.
export function useVerifyTotpEnrollment() {
  return useMutation({
    mutationFn: ({ factorId, code }: { factorId: string; code: string }) => verifyTotpEnrollment(factorId, code),
  });
}

// Checks the authenticator code at sign-in.
export function useVerifySecondFactor() {
  return useMutation({ mutationFn: (code: string) => verifySecondFactor(code) });
}

// Removes the authenticator app from the account.
export function useUnenrollTotp() {
  return useMutation({ mutationFn: (factorId: string) => unenrollTotp(factorId) });
}
