// Public entry point of frontend/common/consultations (A1, docs/plan.md §1 rule 4): other modules import only what is
// listed here: what the other modules use, nothing more.
export { ConsultationCard } from './components/ConsultationCard';
export { useConsultations, useDecideConsultation } from './hooks/consultations';
export { sortRequests } from './utils/requests';
