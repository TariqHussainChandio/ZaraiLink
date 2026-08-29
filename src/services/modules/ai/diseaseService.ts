import type { Asset } from 'react-native-image-picker';
import { supabase } from '../../supabase/client';
import { apiFetch } from '../../api/client';
import type { DiseaseCase, DiseaseCaseWithPrediction, DiseasePrediction } from '../../../types/disease';

export async function uploadDiseaseImage(userId: string, image: Asset): Promise<string> {
  if (!image.uri) throw new Error('No image selected');

  const extension = image.fileName?.split('.').pop() ?? 'jpg';
  const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;

  const response = await fetch(image.uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from('disease-images')
    .upload(path, arrayBuffer, { contentType: image.type ?? 'image/jpeg' });
  if (error) throw error;

  const { data } = supabase.storage.from('disease-images').getPublicUrl(path);
  return data.publicUrl;
}

export async function createDiseaseCase(cropId: string | null, imageUrl: string): Promise<DiseaseCase> {
  return apiFetch('/api/v1/disease/cases', {
    method: 'POST',
    body: { crop_id: cropId, image_url: imageUrl },
  });
}

/**
 * Calls the FastAPI inference endpoint. Until real Colab-trained weights replace the placeholder
 * `model.pth`, this reliably fails with a 503 — callers should treat any failure here as "AI
 * analysis isn't available right now" rather than a hard error.
 */
export async function predictDisease(diseaseCaseId: string): Promise<DiseasePrediction> {
  return apiFetch('/api/v1/disease/predict', {
    method: 'POST',
    body: { disease_case_id: diseaseCaseId },
  });
}

export async function fetchDiseaseCaseWithPrediction(diseaseCaseId: string): Promise<DiseaseCaseWithPrediction> {
  return apiFetch(`/api/v1/disease/cases/${diseaseCaseId}`);
}
