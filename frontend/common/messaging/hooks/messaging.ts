import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  fetchConversations,
  fetchMessages,
  findOrCreateConversation,
  markConversationRead,
  resolveAttachmentUrls,
  sendMessage,
  uploadMessageAttachments,
} from '../services/messagingService';
import type { ConversationContext, Message } from '../types/messaging';
import type { PickedPhoto } from '../../../utils/photoPicker';
import { useRealtimeMessages } from '../../../hooks/realtime/useRealtimeMessages';
import { queryKeys } from '../../../hooks/keys';

/** Opens (or creates) the conversation with another user about a listing or order, for a "Message" button. */
export function useOpenConversation() {
  return useMutation({
    mutationFn: ({ otherUserId, context }: { otherUserId: string; context: ConversationContext }) =>
      findOrCreateConversation(otherUserId, context),
  });
}

export function useConversations(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.messaging.conversations(),
    queryFn: fetchConversations,
    enabled,
    staleTime: 0,
  });
}

const withoutDuplicate = (messages: Message[], incoming: Message) =>
  messages.some(message => message.id === incoming.id) ? messages : [...messages, incoming];

/**
 * A conversation's messages: loaded, then kept current by the realtime subscription (a new row is appended to the
 * cache, not refetched). Opening the conversation marks it read.
 */
export function useConversationMessages(conversationId: string, userId: string | undefined) {
  const queryClient = useQueryClient();
  const key = queryKeys.messaging.messages(conversationId);
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const messages = await fetchMessages(conversationId);
      if (userId) {
        markConversationRead(conversationId)
          .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.messaging.conversations() }))
          // The unread badge is cosmetic; failing to clear it must not fail loading the messages.
          .catch(() => undefined);
      }
      return messages;
    },
    staleTime: 0,
  });
  useRealtimeMessages(conversationId, incoming => {
    queryClient.setQueryData<Message[]>(key, previous => withoutDuplicate(previous ?? [], incoming));
  });
  return query;
}

/** Uploads any photos, then posts the message and appends it to the open conversation. */
export function useSendMessage(conversationId: string, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, images }: { body: string; images: PickedPhoto[] }) => {
      const attachments =
        images.length > 0 && userId ? await uploadMessageAttachments(conversationId, userId, images) : [];
      return sendMessage(conversationId, body, attachments);
    },
    onSuccess: message => {
      queryClient.setQueryData<Message[]>(queryKeys.messaging.messages(conversationId), previous =>
        withoutDuplicate(previous ?? [], message),
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.conversations() });
    },
  });
}

/** Signed URLs for attachment paths. They expire after an hour, so they are refreshed well before that. */
export function useAttachmentUrls(paths: string[]) {
  const unique = useMemo(() => [...new Set(paths)].sort(), [paths]);
  return useQuery({
    queryKey: queryKeys.messaging.attachments(unique),
    queryFn: () => resolveAttachmentUrls(unique),
    enabled: unique.length > 0,
    staleTime: 30 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
