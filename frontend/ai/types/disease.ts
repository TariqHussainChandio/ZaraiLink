import type {
  DiseaseCaseResponse,
  DiseaseCaseWithPredictionResponse,
  DiseaseReport as GeneratedDiseaseReport,
  PredictResponse,
} from '../../services/api/generated';

// The disease API's shapes come from the generated contract (AGENTS.md rule 9), so a backend change to the report
// fails the type check here instead of reaching a farmer as a blank section.

/** A recorded case. `image_signed_url` is minted fresh by the backend on every response: the disease-images bucket is
 * private (security fix C2), so it is never a stable or cacheable URL. */
export type DiseaseCase = DiseaseCaseResponse;

/** What `POST /disease/predict` answers: the stored prediction plus the report built from the knowledge base. */
export type DiseasePrediction = PredictResponse;

/** The advisory report for one prediction (SRDS §34-§35). Its text comes from the expert-reviewed knowledge base;
 * `confidence_band` is decided by the backend (threshold 0.60) and `disclaimer` is shown on every result (BR-13). */
export type DiseaseReport = GeneratedDiseaseReport;

/** A case with its latest prediction and report. `status` is 'failed' with a `failure_reason` when the model could
 * not run on the photo; `report` is null until a prediction exists. */
export type DiseaseCaseWithPrediction = DiseaseCaseWithPredictionResponse;

/** Carries a disease case's context into `RequestConsultationScreen`. The farmer still describes the problem in their
 * own words: the AI's advisory text is never put forward as theirs (BR-13, AI results are advisory). `diseaseCaseId`
 * links the consultation to the case (sent as `disease_case_id`), so the expert sees the photo and the AI assessment
 * separately; it is absent when the case was never created. `imageUrl` is a short-lived signed link, or null when the
 * photo is no longer in storage. */
export interface DiseasePrefill {
  subject: string;
  cropId: string | null;
  imageUrl: string | null;
  diseaseCaseId?: string;
}
