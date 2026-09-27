import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import {
  createDiseaseCase,
  fetchDiseaseCaseWithPrediction,
  predictDisease,
  uploadDiseaseImage,
} from '../../services/modules/ai/diseaseService';
import type { PickedPhoto } from '../../utils/photoPicker';
import { queryKeys } from './keys';

/** A disease case with its prediction (BR-13: the prediction is advisory; the screen routes to an expert). */
export function useDiseaseCase(diseaseCaseId: string) {
  return useQuery({
    queryKey: queryKeys.disease.case(diseaseCaseId),
    queryFn: () => fetchDiseaseCaseWithPrediction(diseaseCaseId),
  });
}

/**
 * Uploads the photo to the private bucket, records the case and runs the model on it. A retry after a failure part
 * way through does not upload the photo again.
 */
export function useRunDiseaseAnalysis() {
  const uploadedPath = useRef<string | null>(null);
  return useMutation({
    mutationFn: async ({ userId, image, cropId }: { userId: string; image: PickedPhoto; cropId: string | null }) => {
      const storagePath = uploadedPath.current ?? (await uploadDiseaseImage(userId, image));
      uploadedPath.current = storagePath;
      const diseaseCase = await createDiseaseCase(cropId, storagePath);
      await predictDisease(diseaseCase.id);
      return diseaseCase;
    },
  });
}
