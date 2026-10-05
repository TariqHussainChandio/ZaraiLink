import { apiFetch } from '../../services/api/client';
import type {
  Expert,
  ExpertSpecialization,
  ExpertVerification,
  ExpertWithProfile,
  VerificationStatus,
} from '../types/expert';

export interface ExpertProfileInput {
  qualifications: string;
  degree: string;
  experience: string;
  professionalDescription: string;
  contact: string;
  country: string | null;
  province: string | null;
  city: string | null;
  specializations: ExpertSpecialization[];
  /** SRDS §10 (A3b). Left out (undefined) by a form that does not ask, so an edit keeps the saved value. */
  yearsExperience?: number;
  institutionAffiliation?: string;
}

function toApiProfile(input: ExpertProfileInput) {
  return {
    qualifications: input.qualifications,
    degree: input.degree,
    experience: input.experience,
    professional_description: input.professionalDescription,
    contact: input.contact,
    country: input.country,
    province: input.province,
    city: input.city,
    specializations: input.specializations,
    years_experience: input.yearsExperience,
    institution_affiliation: input.institutionAffiliation,
  };
}

/**
 * Starts the expert's application with their professional details (a draft, `verification_status = 'pending'`). The
 * documents are attached next and the application is submitted for review separately (A3b). No `userId` param: the
 * backend always uses the caller's own id.
 */
export async function createExpertApplication(input: ExpertProfileInput): Promise<Expert> {
  return apiFetch('/api/v1/expert/application', { method: 'POST', body: toApiProfile(input) });
}

export async function updateExpertProfile(input: ExpertProfileInput): Promise<Expert> {
  return apiFetch('/api/v1/expert/application', { method: 'PATCH', body: toApiProfile(input) });
}

export async function fetchExpertProfile(): Promise<ExpertWithProfile | null> {
  return apiFetch('/api/v1/expert/me');
}

/** Public read. */
export async function fetchExpertById(expertId: string): Promise<ExpertWithProfile> {
  return apiFetch(`/api/v1/expert/${expertId}`);
}

export interface FetchExpertsParams {
  specialization?: ExpertSpecialization;
}

/** Public read; RLS already restricts a non-owner/non-admin caller to `approved` rows only. */
export async function fetchExperts({ specialization }: FetchExpertsParams = {}): Promise<ExpertWithProfile[]> {
  return apiFetch('/api/v1/expert', { query: { specialization } });
}

interface ExpertApplicationDocument {
  id: string;
  required_document_id: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  required_document: { id: string; code: string; label: string } | null;
}

/** An expert as the admin reviews them (SRDS §12): the account, one verification record per submission, the documents. */
export interface ExpertWithVerifications extends Omit<ExpertWithProfile, 'profile'> {
  profile: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    phone: string | null;
    account_status: 'pending' | 'approved' | 'rejected';
    account_status_reason: string | null;
    application_submitted_at: string | null;
  } | null;
  expert_verifications: ExpertVerification[];
  expert_documents: ExpertApplicationDocument[];
}

/**
 * Admin-facing browse — unlike `fetchExperts()` (public, hardcoded to `approved` only), this
 * omits that filter (or applies the given `status`). Newest `expert_verifications` row first —
 * sorting now happens backend-side (`expert_service._sorted_verifications`), not here.
 */
export async function fetchExpertsForAdmin(status?: VerificationStatus): Promise<ExpertWithVerifications[]> {
  return apiFetch('/api/v1/expert/admin', { query: { status } });
}

/** Same shape as `fetchExpertsForAdmin`, single row — used where a report/action needs an
 * expert's `expert_verifications` history by id (e.g. `ReportsScreen`'s "Suspend Expert" action). */
export async function fetchExpertForAdminById(expertId: string): Promise<ExpertWithVerifications> {
  return apiFetch(`/api/v1/expert/admin/${expertId}`);
}

/** What an admin's decision returns: the move, and whether the applicant's email went out (SRDS §9). */
export interface ApplicationDecision {
  role: string;
  previous_status: 'pending' | 'approved' | 'rejected';
  new_status: 'pending' | 'approved' | 'rejected';
  email_delivered: boolean;
}

/**
 * An admin's decision on a submitted expert application (A3a, A3b). The account, the verification and its latest record
 * move together with the audit row in one database transaction; a rejection's `notes` is the reason the expert reads.
 * The expert is emailed after the decision is recorded.
 */
export async function reviewExpertVerification(
  expertId: string,
  decision: 'approved' | 'rejected',
  notes: string,
): Promise<ApplicationDecision> {
  return apiFetch(`/api/v1/expert/admin/${expertId}/verification`, {
    method: 'PATCH',
    body: { decision, notes: notes.trim() || null },
  });
}

/**
 * A ten-minute link to one of the expert's documents. The backend finds the file from the document's own row, under
 * this expert, so a caller cannot ask it to sign an arbitrary path.
 */
export async function resolveExpertDocumentUrl(expertId: string, documentId: string): Promise<string> {
  const { url } = await apiFetch<{ url: string }>(`/api/v1/expert/admin/${expertId}/documents/${documentId}/url`);
  return url;
}
