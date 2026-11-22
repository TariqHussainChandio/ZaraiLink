// The AI module as the admin reads it (A6; SRDS §37): activity counts and the disease knowledge base. The generated
// contract is the source of truth (AGENTS.md rule 9), so this only re-exports it.
export type { AiActivity, DiseaseKnowledgeEntry, DiseaseKnowledgeUpdate } from '../../services/api/generated/types.gen';
