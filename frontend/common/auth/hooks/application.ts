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

export function useRequiredDocuments(enabled = true) {
  return useQuery({ queryKey: queryKeys.application.requiredDocuments(), queryFn: fetchRequiredDocuments, enabled });
}

export function useDealerApplication(enabled = true) {
  return useQuery({ queryKey: queryKeys.application.dealer(), queryFn: fetchDealerApplication, enabled });
}

export function useApplicationDocuments(role: ApplicationRole, enabled = true) {
  return useQuery({
    queryKey: queryKeys.application.documents(role),
    queryFn: () => fetchApplicationDocuments(role),
    enabled,
  });
}

export function useSaveDealerApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DealerApplicationInput) => saveDealerApplication(input),
    onSuccess: saved => queryClient.setQueryData(queryKeys.application.dealer(), saved),
  });
}

/** Thrown before any upload when a chosen file is over the buckets' 10 MB limit. */
const TOO_LARGE_MESSAGE = 'This file is larger than 10 MB. Choose a smaller file or take a photo instead.';

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

export function useRemoveDocument(role: ApplicationRole) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => removeDocument(role, documentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.application.documents(role) }),
  });
}

export function useSubmitApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitApplication,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.application.all }),
  });
}
