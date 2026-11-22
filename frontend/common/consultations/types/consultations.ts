import type { ConsultationWithRelations } from '../../../expert';

// Mirrors the A6 contract (`AiCaseSummary`, `DiseaseReport`, `ConsultationAssessment` in backend/openapi.json).

type ConfidenceBand = 'confident' | 'low';
type KnowledgeReviewStatus = 'pending_review' | 'reviewed';

/** The AI report on the consultation's disease case. Advisory only (BR-13); its text comes from `disease_knowledge`. */
interface DiseaseReport {
  predicted_disease: string;
  class_label: string;
  crop: string;
  disease: string;
  confidence_score: number;
  confidence_band: ConfidenceBand;
  is_healthy: boolean;
  symptoms?: string[];
  treatment?: string[];
  precautions?: string[];
  advisory: string;
  review_status: KnowledgeReviewStatus;
  disclaimer: string;
  model_version?: string | null;
  created_at: string;
}

export interface AiCaseSummary {
  case_id: string;
  /** Signed and short-lived; null when the photo could not be signed. */
  image_url?: string | null;
  report: DiseaseReport;
}

/** One consultation as the detail endpoint returns it: the AI report rides along when a disease case is attached. */
export interface ConsultationDetail extends ConsultationWithRelations {
  ai_report?: AiCaseSummary | null;
}

export type AssessmentVerdict = 'agree' | 'correct' | 'additional_diagnosis' | 'request_information';

/** The Expert Assessment (SRDS §35): stored apart from the AI report, append-only, always shown as the expert's. */
export interface ConsultationAssessment {
  id: string;
  consultation_id: string;
  expert_id: string;
  verdict: AssessmentVerdict;
  diagnosis: string | null;
  recommendations: string | null;
  created_at: string;
}

export interface ConsultationAssessmentInput {
  verdict: AssessmentVerdict;
  diagnosis?: string | null;
  recommendations?: string | null;
}

/** The server refuses these verdicts without a diagnosis (422); the form checks first so the expert is told sooner. */
export const VERDICTS_NEEDING_DIAGNOSIS: readonly AssessmentVerdict[] = ['correct', 'additional_diagnosis'];
