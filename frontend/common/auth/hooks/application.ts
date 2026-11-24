// React Query hooks for the dealer or expert application and its documents.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../hooks/keys';
import { MAX_DOCUMENT_BYTES, type PickedDocument } from '../../../utils/documentPicker';
import {
  attachDocument,
  fetchApplicationDocuments,
  fetchDealerApplication,
  fetchRequiredDocuments,
  removeDocument,
  saveDealerApplication,
  submitApplication,
} from '../services/applicationService';
import type { ApplicationRole, DealerApplicationInput } from '../types/application';

/*
 * The signed-in applicant's own application (A3b). Never written to the on-disk cache; the server decides what may
 * change, and a refused change comes back as `application_locked` for the screen to show.
 */

// Loads the documents the administrator requires for the user's role.
export function useRequiredDocuments(enabled = true) {
  return useQuery({ queryKey: queryKeys.application.requiredDocuments(), queryFn: fetchRequiredDocuments, enabled });
}

// Loads the dealer's saved business details.
export function useDealerApplication(enabled = true) {
  return useQuery({ queryKey: queryKeys.application.dealer(), queryFn: fetchDealerApplication, enabled });
}

// Loads the files already attached to the application.
export function useApplicationDocuments(role: ApplicationRole, enabled = true) {
  return useQuery({
    queryKey: queryKeys.application.documents(role),
    queryFn: () => fetchApplicationDocuments(role),
    enabled,
  });
}

// Saves the dealer's business details and updates the cached copy.
export function useSaveDealerApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DealerApplicationInput) => saveDealerApplication(input),
    onSuccess: saved => queryClient.setQueryData(queryKeys.application.dealer(), saved),
  });
}

/** Thrown before any upload when a chosen file is over the buckets' 10 MB limit. */
const TOO_LARGE_MESSAGE = 'This file is larger than 10 MB. Choose a smaller file or take a photo instead.';

// Checks the file size, uploads the file and attaches it to the application.
export function useAttachDocument(role: ApplicationRole, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, requiredDocumentId }: { file: PickedDocument; requiredDocumentId: string | null }) => {
      if (!userId) throw new Error('Sign in again to add documents.');
      if (file.sizeBytes !== undefined && file.sizeBytes > MAX_DOCUMENT_BYTES) throw new Error(TOO_LARGE_MESSAGE);
      return attachDocument(role, userId, file, requiredDocumentId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.application.documents(role) }),
  });
}

// Removes an attached document and refreshes the list.
export function useRemoveDocument(role: ApplicationRole) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => removeDocument(role, documentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.application.documents(role) }),
  });
}

// Sends the application for review and refreshes the application data.
export function useSubmitApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitApplication,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.application.all }),
  });
}
