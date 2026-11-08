import type { PickedPhoto } from '../../utils/photoPicker';
import { extensionFromMimeType } from '../../utils/mimeExtension';
import { supabase } from '../../services/supabase/client';
import { apiFetch } from '../../services/api/client';
import type { DiseaseCase, DiseaseCaseWithPrediction, DiseasePredictResult, SupportedCrop } from '../types/disease';

/**
 * Uploads the photo and returns its storage PATH, not a URL — the disease-images bucket is
 * private (security fix C2), so a public URL was never valid to begin with, and the backend
 * mints its own signed URL for display rather than trusting one from the client. The returned
 * path is what `createDiseaseCase` sends on; there is nothing else to do with it client-side.
 */
export async function uploadDiseaseImage(userId: string, image: PickedPhoto): Promise<string> {
  if (!image.uri) throw new Error('No image selected');

  const extension = extensionFromMimeType(image.mimeType);
  const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;

  const response = await fetch(image.uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from('disease-images')
    .upload(path, arrayBuffer, { contentType: image.mimeType ?? 'image/jpeg' });
  if (error) throw error;

  return path;
}

export async function createDiseaseCase(cropId: string | null, storagePath: string): Promise<DiseaseCase> {
  return apiFetch('/api/v1/disease/cases', {
    method: 'POST',
    body: { crop_id: cropId, storage_path: storagePath },
  });
}

/** The crops the model knows (D16): the only crops the scan offers. */
export async function fetchSupportedCrops(): Promise<SupportedCrop[]> {
  const response = await apiFetch<{ crops: SupportedCrop[] }>('/api/v1/disease/crops');
  return response.crops;
}

/**
 * Calls the FastAPI inference endpoint. It answers 503 when the model checkpoint is missing or
 * fails to load, and 422 when the stored image can't be fetched or decoded. A successful response
 * is advisory only (BR-13): the model cannot yet tell "not a plant leaf" from a real leaf, so a
 * confident label is not evidence of a diagnosis (docs/status/baseline-2026-09.md). `chosenCrop` lets
 * the server say whether the photo looks like the crop the farmer chose (`crop_matches`, D16).
 */
export async function predictDisease(diseaseCaseId: string, chosenCrop: string | null = null): Promise<DiseasePredictResult> {
  return apiFetch('/api/v1/disease/predict', {
    method: 'POST',
    body: { disease_case_id: diseaseCaseId, chosen_crop: chosenCrop },
  });
}

export async function fetchDiseaseCaseWithPrediction(diseaseCaseId: string): Promise<DiseaseCaseWithPrediction> {
  return apiFetch(`/api/v1/disease/cases/${diseaseCaseId}`);
}
