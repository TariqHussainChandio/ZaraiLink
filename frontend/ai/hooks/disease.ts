import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  createDiseaseCase,
  fetchDiseaseCaseWithPrediction,
  fetchSupportedCrops,
  predictDisease,
  uploadDiseaseImage,
} from '../services/diseaseService';
import type { PickedPhoto } from '../../utils/photoPicker';
import { queryKeys } from '../../hooks/keys';
import { isApiError } from '../../services/api/client';
import { ERROR_KIND_MESSAGES, errorMessage } from '../../utils/errorMessage';

/** A disease case with its prediction (BR-13: the prediction is advisory; the screen routes to an expert). */
export function useDiseaseCase(diseaseCaseId: string) {
  return useQuery({
    queryKey: queryKeys.disease.case(diseaseCaseId),
    queryFn: () => fetchDiseaseCaseWithPrediction(diseaseCaseId),
  });
}

/** The crops the model knows (D16). Reference data that changes only with a new model, so it is kept for the session. */
export function useSupportedCrops() {
  return useQuery({
    queryKey: [...queryKeys.disease.all, 'crops'] as const,
    queryFn: fetchSupportedCrops,
    staleTime: Infinity,
  });
}

export type AnalysisStage = 'sending' | 'checking';

/**
 * Uploads the photo to the private bucket, records the case and runs the model on it. A retry after a failure part
 * way through repeats only the step that failed: the photo is not uploaded again and the same case is reused, so
 * Retry never leaves a second case behind (FA-07). `stage` says which step is running, for the progress list.
 */
export function useRunDiseaseAnalysis() {
  const uploadedPath = useRef<string | null>(null);
  const caseId = useRef<string | null>(null);
  const [stage, setStage] = useState<AnalysisStage>('sending');
  const mutation = useMutation({
    mutationFn: async ({
      userId,
      image,
      cropId,
      cropKey,
    }: {
      userId: string;
      image: PickedPhoto;
      cropId: string | null;
      cropKey: string | null;
    }) => {
      setStage('sending');
      if (!caseId.current) {
        const storagePath = uploadedPath.current ?? (await uploadDiseaseImage(userId, image));
        uploadedPath.current = storagePath;
        caseId.current = (await createDiseaseCase(cropId, storagePath)).id;
      }
      setStage('checking');
      const prediction = await predictDisease(caseId.current, cropKey);
      return { diseaseCaseId: caseId.current, prediction };
    },
  });
  return { ...mutation, stage };
}

type FailureCause = 'photo' | 'offline' | 'unavailable' | 'other';

/** Why a check failed, in the terms the farmer can act on (FA-07): a bad photo, no connection, or the service. */
export function failureCause(error: unknown): FailureCause {
  if (isApiError(error)) {
    if (error.kind === 'network' || error.kind === 'timeout') return 'offline';
    if (error.status === 422) return 'photo';
    if (error.status >= 500) return 'unavailable';
    return 'other';
  }
  return errorMessage(error) === ERROR_KIND_MESSAGES.network ? 'offline' : 'other';
}
