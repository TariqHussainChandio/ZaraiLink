import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  createDiseaseCase,
  fetchDiseaseCaseWithPrediction,
  predictDisease,
  uploadDiseaseImage,
} from '../services/diseaseService';
import type { PickedPhoto } from '../../utils/photoPicker';
import { queryKeys } from '../../hooks/keys';

/** A disease case with its prediction and report (BR-13: the report is advisory; the screen routes to an expert). */
export function useDiseaseCase(diseaseCaseId: string) {
  return useQuery({
    queryKey: queryKeys.disease.case(diseaseCaseId),
    queryFn: () => fetchDiseaseCaseWithPrediction(diseaseCaseId),
  });
}

/**
 * Uploads the photo to the private bucket, records the case and runs the model on it. A retry after a failure part
 * way through neither uploads the photo again nor records a second case. `createdCaseId` is the case recorded so far
 * (null before one exists), so a failure screen can still link an expert consultation to it.
 */
export function useRunDiseaseAnalysis() {
  const uploadedPath = useRef<string | null>(null);
  const createdCaseRef = useRef<string | null>(null);
  // The ref keeps retries inside one mutation consistent; the state mirrors it for rendering (a ref must not be read
  // during render).
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async ({ userId, image, cropId }: { userId: string; image: PickedPhoto; cropId: string | null }) => {
      const storagePath = uploadedPath.current ?? (await uploadDiseaseImage(userId, image));
      uploadedPath.current = storagePath;
      const diseaseCaseId = createdCaseRef.current ?? (await createDiseaseCase(cropId, storagePath)).id;
      createdCaseRef.current = diseaseCaseId;
      setCreatedCaseId(diseaseCaseId);
      await predictDisease(diseaseCaseId);
      return { id: diseaseCaseId };
    },
  });
  return { ...mutation, createdCaseId };
}
