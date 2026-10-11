// Consultations as the admin moderates them (SRDS §14). The shapes come from the generated contract (AGENTS.md rule 9);
// the status is derived from it, so a status added on the API reaches the filter without a second list here.
import type { ConsultationWithRelations } from '../../services/api/generated/types.gen';

export type {
  ConsultationDetail,
  ConsultationWithRelations,
  ModerateConsultationRequest,
} from '../../services/api/generated/types.gen';

export type ConsultationStatus = ConsultationWithRelations['status'];
