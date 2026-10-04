import { apiFetch } from '../../../services/api/client';
import { supabase } from '../../../services/supabase/client';
import { extensionFromMimeType } from '../../../utils/mimeExtension';
import type { PickedDocument } from '../../../utils/documentPicker';
import type {
  ApplicationDocument,
  ApplicationRole,
  DealerApplicationInput,
  DealerProfile,
  RequiredDocument,
} from '../types/application';

/*
 * A dealer's or expert's application (A3b; SRDS §7–§11). The database decides who may change what
 * (20261012080000_applications.sql): the applicant, while it is a draft or rejected; nothing while it is under review.
 * The API answers `application_locked` then, and `application_incomplete` (with what is missing) to an early submit.
 */

// Each role has its own private bucket; files go under the applicant's own folder, which the bucket's policies require.
const BUCKETS: Record<ApplicationRole, string> = { dealer: 'dealer-documents', expert: 'expert-documents' };

/** The documents the caller's role is asked for, as an admin last set them. */
export async function fetchRequiredDocuments(): Promise<RequiredDocument[]> {
  return apiFetch('/api/v1/profile/application/required-documents');
}

/** Sends the application for review, the first time or after a rejection. */
export async function submitApplication(): Promise<void> {
  await apiFetch('/api/v1/profile/application/submit', { method: 'POST' });
}

export async function fetchDealerApplication(): Promise<DealerProfile | null> {
  return apiFetch('/api/v1/dealer/application');
}

export async function saveDealerApplication(input: DealerApplicationInput): Promise<DealerProfile> {
  return apiFetch('/api/v1/dealer/application', { method: 'PUT', body: input });
}

export async function fetchApplicationDocuments(role: ApplicationRole): Promise<ApplicationDocument[]> {
  return apiFetch(`/api/v1/${role}/application/documents`);
}

/**
 * Uploads a file into the applicant's own folder of their role's bucket, then attaches it to the application. If the
 * attach is refused (the application is locked, say), the uploaded file is removed again so nothing is left behind.
 */
export async function attachDocument(
  role: ApplicationRole,
  userId: string,
  file: PickedDocument,
  requiredDocumentId: string | null,
): Promise<ApplicationDocument> {
  const extension = extensionFromMimeType(file.mimeType, 'pdf');
  const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;
  const bucket = supabase.storage.from(BUCKETS[role]);

  const response = await fetch(file.uri);
  const content = await response.arrayBuffer();
  const { error } = await bucket.upload(path, content, { contentType: file.mimeType });
  if (error) throw error;

  try {
    return await apiFetch(`/api/v1/${role}/application/documents`, {
      method: 'POST',
      body: { storage_path: path, file_name: file.fileName, required_document_id: requiredDocumentId },
    });
  } catch (attachError) {
    await bucket.remove([path]);
    throw attachError;
  }
}

/** Removes an attached document and its file; refused while the application is under review. */
export async function removeDocument(role: ApplicationRole, documentId: string): Promise<void> {
  await apiFetch(`/api/v1/${role}/application/documents/${documentId}`, { method: 'DELETE' });
}
