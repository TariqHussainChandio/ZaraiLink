import type { PickedPhoto } from '../../../utils/photoPicker';
import { extensionFromMimeType } from '../../../utils/mimeExtension';
import { apiFetch } from '../../../services/api/client';
import { supabase } from '../../../services/supabase/client';
import type {
  Consultation,
  ConsultationMessageWithListing,
  ConsultationPriority,
  ConsultationWithRelations,
} from '../../../expert';
import type {
  ConsultationAssessment,
  ConsultationAssessmentInput,
  ConsultationDetail,
} from '../types/consultations';

const ATTACHMENTS_BUCKET = 'consultation-attachments';

export interface ConsultationRequestInput {
  expertId: string;
  subject: string;
  cropId: string | null;
  problemDescription: string;
  farmId: string | null;
  images: string[];
  priority: ConsultationPriority;
  /** The AI disease case this request carries to the expert (A6, SRDS §34); null for a plain question. */
  diseaseCaseId?: string | null;
}

// No userId param — always the caller's own consultation, derived from the session token.
export async function createConsultationRequest(input: ConsultationRequestInput): Promise<Consultation> {
  return apiFetch('/api/v1/consultations', {
    method: 'POST',
    body: {
      expert_id: input.expertId,
      subject: input.subject,
      crop_id: input.cropId,
      problem_description: input.problemDescription,
      farm_id: input.farmId,
      images: input.images,
      priority: input.priority,
      // Sent only with a case, so a plain question keeps the request body it always had.
      ...(input.diseaseCaseId ? { disease_case_id: input.diseaseCaseId } : {}),
    },
  });
}

/**
 * `consultation-attachments` RLS scopes both read and upload to the consultation's two
 * participants via the object path — which means the consultation row must already exist
 * before an upload can succeed (unlike `listing-images`, which is owner-scoped only). Storage-
 * direct, unchanged. Callers must create the consultation first (with `images: []`), upload
 * using the real id, then call `updateConsultationImages` with the resulting paths.
 */
export async function uploadConsultationAttachments(
  consultationId: string,
  uploaderId: string,
  images: PickedPhoto[],
): Promise<string[]> {
  const paths: string[] = [];

  for (const image of images) {
    if (!image.uri) continue;

    const extension = extensionFromMimeType(image.mimeType);
    const path = `${consultationId}/${uploaderId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;

    const response = await fetch(image.uri);
    const arrayBuffer = await response.arrayBuffer();

    const { error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, arrayBuffer, { contentType: image.mimeType ?? 'image/jpeg' });
    if (error) throw error;
    paths.push(path);
  }

  return paths;
}

export async function resolveConsultationAttachmentUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;

  const urls: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
  }
  return urls;
}

export async function updateConsultationImages(id: string, images: string[]): Promise<void> {
  await apiFetch(`/api/v1/consultations/${id}/images`, { method: 'PATCH', body: { images } });
}

// No userId param — always the caller's own consultations.
export async function fetchConsultationsForUser(): Promise<ConsultationWithRelations[]> {
  return apiFetch('/api/v1/consultations/mine');
}

// No expertId param — always the caller's own assigned consultations.
export async function fetchConsultationsForExpert(): Promise<ConsultationWithRelations[]> {
  return apiFetch('/api/v1/consultations/assigned');
}

/** The consultation with its relations and, when a disease case is attached, the AI report (`ai_report`). */
export async function fetchConsultationById(id: string): Promise<ConsultationDetail> {
  return apiFetch(`/api/v1/consultations/${id}`);
}

/**
 * No `from` param — the client used to supply the current status alongside the target, but the
 * backend now always re-reads the actual current status itself (never trusts a client-asserted
 * "current state"), and additionally enforces which side (requester vs. assigned expert) is
 * allowed to make each specific transition — RLS alone only checked "is a participant."
 */
export async function updateConsultationStatus(id: string, to: Consultation['status']): Promise<void> {
  await apiFetch(`/api/v1/consultations/${id}/status`, { method: 'PATCH', body: { to } });
}

export async function fetchConsultationMessages(consultationId: string): Promise<ConsultationMessageWithListing[]> {
  return apiFetch(`/api/v1/consultations/${consultationId}/messages`);
}

// No senderId param — always the caller's own id.
export async function sendConsultationMessage(
  consultationId: string,
  body: string,
  attachments: string[] = [],
  recommendedListingId: string | null = null,
): Promise<ConsultationMessageWithListing> {
  return apiFetch(`/api/v1/consultations/${consultationId}/messages`, {
    method: 'POST',
    body: { body, attachments, recommended_listing_id: recommendedListingId },
  });
}

/** Every Expert Assessment on the consultation, newest first (the server's order); a later one supersedes an earlier one. */
export async function fetchConsultationAssessments(consultationId: string): Promise<ConsultationAssessment[]> {
  return apiFetch(`/api/v1/consultations/${consultationId}/assessments`);
}

// No expertId param: the server takes the caller as the expert and allows only the assigned one while the
// consultation is accepted or in progress (403 otherwise).
export async function createConsultationAssessment(
  consultationId: string,
  input: ConsultationAssessmentInput,
): Promise<ConsultationAssessment> {
  return apiFetch(`/api/v1/consultations/${consultationId}/assessments`, {
    method: 'POST',
    body: {
      verdict: input.verdict,
      diagnosis: input.diagnosis ?? null,
      recommendations: input.recommendations ?? null,
    },
  });
}
