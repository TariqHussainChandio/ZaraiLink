import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchExpertById,
  fetchExpertProfile,
  fetchExperts,
  createExpertApplication,
  updateExpertProfile,
  type ExpertProfileInput,
} from '../services/expertService';
import { fetchReviewsForExpert } from '../../common/reviews';
import type { ExpertSpecialization } from '../types/expert';
import { queryKeys } from '../../hooks/keys';

/** Verified experts, optionally narrowed to one specialization. */
export function useExperts(specialization: ExpertSpecialization | undefined) {
  return useQuery({
    queryKey: queryKeys.experts.list(specialization),
    queryFn: () => fetchExperts({ specialization }),
  });
}

/** An expert's public profile together with their reviews. */
export function useExpertProfile(expertId: string) {
  return useQuery({
    queryKey: queryKeys.experts.detail(expertId),
    queryFn: async () => {
      const [expert, reviews] = await Promise.all([fetchExpertById(expertId), fetchReviewsForExpert(expertId)]);
      return { expert, reviews };
    },
  });
}

/** The signed-in expert's own profile, or `null` when they have not applied yet. */
export function useOwnExpertProfile(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.experts.own(), queryFn: fetchExpertProfile, enabled });
}

/**
 * Saves the expert's professional details: starts the application the first time, updates it after (A3b). Documents
 * and the submission are separate steps of the application.
 */
export function useSaveExpertProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, exists }: { input: ExpertProfileInput; exists: boolean }) =>
      exists ? updateExpertProfile(input) : createExpertApplication(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.experts.all }),
  });
}
