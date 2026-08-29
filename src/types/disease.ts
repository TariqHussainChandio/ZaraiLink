export interface DiseaseCase {
  id: string;
  user_id: string;
  crop_id: string | null;
  image_url: string;
  created_at: string;
}

export interface DiseasePrediction {
  id: string;
  disease_case_id: string;
  predicted_disease: string;
  confidence_score: number;
  description: string | null;
  recommended_actions: string[];
  model_version: string | null;
  created_at: string;
}

export interface DiseaseCaseWithPrediction extends DiseaseCase {
  crop: { id: string; name: string } | null;
  prediction: DiseasePrediction | null;
}

/** Carries a disease case's context into `RequestConsultationScreen` so a farmer/buyer/dealer
 * doesn't have to re-describe a problem the AI advisory already captured. */
export interface DiseasePrefill {
  subject: string;
  problemDescription: string;
  cropId: string | null;
  imageUrl: string | null;
}

/** Below this, the Result screen emphasizes "Consult an Expert" over the prediction itself. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;
