import { useMutation, useQuery } from '@tanstack/react-query';
import {
  enrollTotp,
  getVerifiedTotpFactorId,
  unenrollTotp,
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

export function useEnrollTotp() {
  return useMutation({ mutationFn: () => enrollTotp() });
}

export function useVerifyTotpEnrollment() {
  return useMutation({
    mutationFn: ({ factorId, code }: { factorId: string; code: string }) => verifyTotpEnrollment(factorId, code),
  });
}

export function useUnenrollTotp() {
  return useMutation({ mutationFn: (factorId: string) => unenrollTotp(factorId) });
}
