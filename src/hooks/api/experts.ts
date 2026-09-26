import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchExpertById,
  fetchExpertProfile,
  fetchExperts,
  submitExpertApplication,
  updateExpertProfile,
  uploadExpertDocument,
  type ExpertProfileInput,
} from '../../services/modules/expert/expertService';
import { fetchReviewsForExpert } from '../../services/modules/reviews/reviewsService';
import type { ExpertSpecialization } from '../../types/expert';
import type { PickedPhoto } from '../../utils/photoPicker';
import { queryKeys } from './keys';

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

/** Files a new application (with its certificate photo), or updates the profile of an expert who already applied. */
export function useSaveExpertProfile(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, isEditing, document }: { input: ExpertProfileInput; isEditing: boolean; document: PickedPhoto | null }) => {
      if (isEditing) return updateExpertProfile(input);
      const documentPath = document && userId ? await uploadExpertDocument(userId, document) : null;
      return submitExpertApplication(input, documentPath);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.experts.all }),
  });
}
