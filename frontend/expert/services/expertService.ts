import type { PickedPhoto } from '../../utils/photoPicker';
import { extensionFromMimeType } from '../../utils/mimeExtension';
import { apiFetch } from '../../services/api/client';
import { supabase } from '../../services/supabase/client';
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
  };
}

/**
 * Creates the `experts` row (defaults to `verification_status = 'pending'`) plus the first
 * `expert_verifications` row logging the application. `document_url` is a storage path in the
 * private `expert-documents` bucket, resolved to a signed URL only when an admin reviews it —
 * never rendered directly. No `userId` param — the backend always uses the caller's own id.
 */
export async function submitExpertApplication(
  input: ExpertProfileInput,
  documentPath: string | null,
): Promise<Expert> {
  return apiFetch('/api/v1/expert/application', {
    method: 'POST',
    body: { profile: toApiProfile(input), document_path: documentPath },
  });
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

export interface ExpertWithVerifications extends ExpertWithProfile {
  expert_verifications: ExpertVerification[];
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

/**
 * Approve/reject/suspend/reactivate. No `actorId` param — the backend derives the acting admin
 * from the verified session token and writes the audit_logs row itself.
 */
export async function reviewExpertVerification(
  expertId: string,
  verificationId: string,
  decision: VerificationStatus,
  notes: string,
): Promise<void> {
  await apiFetch(`/api/v1/expert/admin/${expertId}/verification`, {
    method: 'PATCH',
    body: { verification_id: verificationId, decision, notes: notes || null },
  });
}

/**
 * Signed URL for the expert's current verification document. Takes `expertId`, not a raw
 * storage path — the backend looks up which document actually belongs to that expert and mints
 * a signed URL for that, so a caller can't ask it to resolve an arbitrary path.
 */
export async function resolveExpertDocumentUrl(expertId: string): Promise<string | null> {
  const { url } = await apiFetch<{ url: string | null }>(`/api/v1/expert/admin/${expertId}/document-url`);
  return url;
}

// Storage-direct, unchanged — owner-scoped RLS on the private `expert-documents` bucket already
// correctly restricts this to the uploading expert.
export async function uploadExpertDocument(userId: string, file: PickedPhoto): Promise<string | null> {
  if (!file.uri) return null;

  const extension = extensionFromMimeType(file.mimeType, 'pdf');
  const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;

  const response = await fetch(file.uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from('expert-documents')
    .upload(path, arrayBuffer, { contentType: file.mimeType ?? 'application/octet-stream' });
  if (error) throw error;

  return path;
}
