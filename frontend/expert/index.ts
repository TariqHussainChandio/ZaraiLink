// Public entry point of frontend/expert (A1, docs/plan.md §1 rule 4): other modules import only what is
// listed here: what the other modules use, nothing more.
export { useExpertProfile, useExperts, useOwnExpertProfile, useSaveExpertProfile } from './hooks/experts';
export {
  fetchExpertById,
  fetchExpertForAdminById,
  fetchExpertsForAdmin,
  resolveExpertDocumentUrl,
  reviewExpertVerification,
} from './services/expertService';
export type { ApplicationDecision } from './services/expertService';
export type { Consultation, ConsultationMessage, ConsultationMessageWithListing, ConsultationPriority, ConsultationStatus, ConsultationWithRelations, ExpertSpecialization, ExpertWithProfile, VerificationStatus } from './types/expert';
