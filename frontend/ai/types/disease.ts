export interface DiseaseCase {
  id: string;
  user_id: string;
  crop_id: string | null;
  /** A signed, time-limited URL minted fresh by the backend on every response — the
   * disease-images bucket is private (security fix C2), so this is never a stable/cacheable URL. */
  image_signed_url: string;
  created_at: string;
}

/** A crop the model was trained on (D16). `key` is what the app sends back as `chosen_crop`. */
export interface SupportedCrop {
  key: string;
  name: string;
}

interface DiseasePrediction {
  id: string;
  disease_case_id: string;
  predicted_disease: string;
  confidence_score: number;
  description: string | null;
  recommended_actions: string[];
  model_version: string | null;
  created_at: string;
}

/** What the predict call answers. `crop_matches` is false when the model reads the photo as another crop than the one
 * chosen: the server then sends no description or actions, and the app shows no report (BR-13, D16). */
export interface DiseasePredictResult extends DiseasePrediction {
  predicted_crop: SupportedCrop | null;
  crop_matches: boolean | null;
}

export interface DiseaseCaseWithPrediction extends DiseaseCase {
  crop: { id: string; name: string } | null;
  prediction: DiseasePrediction | null;
}

/** Carries a scan into the consultation request without writing the AI's words into the farmer's own description
 * (FA-09): the farmer describes the problem in their own words, and `diseaseCaseId` lets the expert read the AI
 * suggestion as a separate block. A scan that never ran (an unsupported crop, a failed check) sends no case id. */
export interface DiseasePrefill {
  subject: string;
  /** Always empty from the scan: the farmer's own words only. */
  problemDescription: string;
  cropId: string | null;
  imageUrl: string | null;
  diseaseCaseId?: string;
}

/** Below this the scan is "not sure": no treatment steps, and a Banner says so. */
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const HIGH_CONFIDENCE_THRESHOLD = 0.85;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
  return score >= LOW_CONFIDENCE_THRESHOLD ? 'medium' : 'low';
}

/** "Tomato — Late blight" (how the server stores a prediction) as the crop and the plain condition. */
export function splitPredictedDisease(predicted: string): { crop: string | null; condition: string } {
  const [crop = null, ...rest] = predicted.split(' — ');
  if (rest.length === 0) return { crop: null, condition: predicted };
  const condition = rest.join(' — ');
  return { crop, condition: condition.toLowerCase() === 'healthy' ? 'Healthy leaf' : condition };
}
