// Types for Scan Disease (from the generated API contract) and the confidence-level helper.
import type {
  DiseaseCaseResponse,
  DiseaseCaseWithPredictionResponse,
  DiseaseReport as GeneratedDiseaseReport,
  PredictResponse,
  SupportedCrop as GeneratedSupportedCrop,
} from '../../services/api/generated';

// The disease API's shapes come from the generated contract (AGENTS.md rule 9), so a backend change to the report
// fails the type check here instead of reaching a farmer as a blank section.

/** A recorded case. `image_signed_url` is minted fresh by the backend on every response: the disease-images bucket is
 * private (security fix C2), so it is never a stable or cacheable URL. */
export type DiseaseCase = DiseaseCaseResponse;

/** A crop the model was trained on (D16). `key` is what the app sends back as `chosen_crop`. */
export type SupportedCrop = GeneratedSupportedCrop;

/** What `POST /disease/predict` answers: the stored prediction plus the report built from the knowledge base.
 * `crop_matches` is false when the model reads the photo as another crop than the one chosen: the report then carries
 * no symptoms, treatment or precautions, and the result screen says so (BR-13, D16). */
export type DiseasePredictResult = PredictResponse;

/** The advisory report for one prediction (SRDS §34-§35). Its text comes from the expert-reviewed knowledge base;
 * `confidence_band` is decided by the backend (threshold 0.60) and `disclaimer` is shown on every result (BR-13). */
export type DiseaseReport = GeneratedDiseaseReport;

/** A case with its latest prediction and report. `status` is 'failed' with a `failure_reason` when the model could
 * not run on the photo; `report` is null until a prediction exists. */
export type DiseaseCaseWithPrediction = DiseaseCaseWithPredictionResponse;

/** Carries a disease case's context into `RequestConsultationScreen`. The farmer still describes the problem in their
 * own words: the AI's advisory text is never put forward as theirs (BR-13, FA-09). `diseaseCaseId` links the
 * consultation to the case (sent as `disease_case_id`), so the expert sees the photo and the AI assessment
 * separately; it is absent when the case was never created. `imageUrl` is a short-lived signed link, or null when the
 * photo is no longer in storage. */
export interface DiseasePrefill {
  subject: string;
  /** Always empty from the scan: the farmer's own words only. */
  problemDescription: string;
  cropId: string | null;
  imageUrl: string | null;
  diseaseCaseId?: string;
}

/** Above this a confident result reads "Very likely"; the backend's band decides "Not sure" (below 0.60). */
const HIGH_CONFIDENCE_THRESHOLD = 0.85;

// The three confidence words the result screen can show.
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Confidence in words (FA-06). Low is the backend's `confidence_band`, so the app and the expert's view never
 * disagree on it; a confident result is split into "very likely" and "likely" for the farmer only. */
export function confidenceLevel(report: Pick<DiseaseReport, 'confidence_band' | 'confidence_score'>): ConfidenceLevel {
  if (report.confidence_band === 'low') return 'low';
  return report.confidence_score >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'medium';
}
