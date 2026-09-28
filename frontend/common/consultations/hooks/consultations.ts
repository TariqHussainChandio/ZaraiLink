import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  createConsultationRequest,
  fetchConsultationById,
  fetchConsultationMessages,
  fetchConsultationsForExpert,
  fetchConsultationsForUser,
  resolveConsultationAttachmentUrls,
  sendConsultationMessage,
  updateConsultationImages,
  updateConsultationStatus,
  uploadConsultationAttachments,
  type ConsultationRequestInput,
} from '../services/consultationService';
import { createConsultationReview, fetchReviewByConsultationId } from '../../reviews';
import type { ConsultationMessageWithListing, ConsultationStatus } from '../../../expert';
import type { PickedPhoto } from '../../../utils/photoPicker';
import { useRealtimeConsultationMessages } from '../../../hooks/realtime/useRealtimeConsultationMessages';
import { queryKeys } from '../../../hooks/keys';

/** A farmer or buyer sees the consultations they asked for; an expert sees the ones addressed to them. */
export function useConsultations(asExpert: boolean, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.consultations.list(asExpert ? 'expert' : 'requester'),
    queryFn: asExpert ? fetchConsultationsForExpert : fetchConsultationsForUser,
    enabled,
  });
}

export function useConsultation(id: string) {
  return useQuery({ queryKey: queryKeys.consultations.detail(id), queryFn: () => fetchConsultationById(id) });
}

const withoutDuplicate = (messages: ConsultationMessageWithListing[], incoming: ConsultationMessageWithListing) =>
  messages.some(message => message.id === incoming.id) ? messages : [...messages, incoming];

/** A consultation's messages, kept current by the realtime subscription (a new row is appended to the cache). */
export function useConsultationMessages(consultationId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.consultations.messages(consultationId);
  const query = useQuery({ queryKey: key, queryFn: () => fetchConsultationMessages(consultationId), staleTime: 0 });
  useRealtimeConsultationMessages(consultationId, incoming => {
    queryClient.setQueryData<ConsultationMessageWithListing[]>(key, previous =>
      withoutDuplicate(previous ?? [], incoming as ConsultationMessageWithListing),
    );
  });
  return query;
}

export function useConsultationReview(consultationId: string) {
  return useQuery({
    queryKey: queryKeys.consultations.review(consultationId),
    queryFn: () => fetchReviewByConsultationId(consultationId),
  });
}

/** Signed URLs for a consultation's photos and message attachments; they expire, so they are refreshed in good time. */
export function useConsultationAttachmentUrls(paths: string[]) {
  const unique = useMemo(() => [...new Set(paths)].sort(), [paths]);
  return useQuery({
    queryKey: queryKeys.consultations.attachments(unique),
    queryFn: () => resolveConsultationAttachmentUrls(unique),
    enabled: unique.length > 0,
    staleTime: 30 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

function useInvalidateConsultations() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.consultations.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
    ]);
}

export function useUpdateConsultationStatus(consultationId: string) {
  const invalidate = useInvalidateConsultations();
  return useMutation({
    mutationFn: (to: ConsultationStatus) => updateConsultationStatus(consultationId, to),
    onSuccess: invalidate,
  });
}

interface SendConsultationMessageVariables {
  body: string;
  images?: PickedPhoto[];
  /** A listing the expert recommends; the message is then the recommendation itself. */
  recommendedListingId?: string;
}

/** Uploads any photos, posts the message, and appends it to the open consultation. */
export function useSendConsultationMessage(consultationId: string, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, images = [], recommendedListingId }: SendConsultationMessageVariables) => {
      const attachments =
        images.length > 0 && userId ? await uploadConsultationAttachments(consultationId, userId, images) : [];
      return recommendedListingId
        ? sendConsultationMessage(consultationId, body, attachments, recommendedListingId)
        : sendConsultationMessage(consultationId, body, attachments);
    },
    onSuccess: message => {
      queryClient.setQueryData<ConsultationMessageWithListing[]>(
        queryKeys.consultations.messages(consultationId),
        previous => withoutDuplicate(previous ?? [], message),
      );
    },
  });
}

export function useCreateConsultationReview(consultationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rating, comment }: { rating: number; comment: string | null }) =>
      createConsultationReview(consultationId, rating, comment),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.consultations.review(consultationId) }),
  });
}

/** Sends a consultation request, then attaches any photos (they need the new consultation's id for their path). */
export function useRequestConsultation(userId: string | undefined) {
  const invalidate = useInvalidateConsultations();
  return useMutation({
    mutationFn: async ({ input, images }: { input: ConsultationRequestInput; images: PickedPhoto[] }) => {
      const consultation = await createConsultationRequest(input);
      if (images.length > 0 && userId) {
        const paths = await uploadConsultationAttachments(consultation.id, userId, images);
        await updateConsultationImages(consultation.id, paths);
      }
      return consultation;
    },
    onSuccess: invalidate,
  });
}
