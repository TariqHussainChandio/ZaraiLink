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
import type { ConversationWithPreview, Message } from '../types/messaging';
import type { PickedPhoto } from '../../../utils/photoPicker';
import { useRealtimeMessages } from '../../../hooks/realtime/useRealtimeMessages';
import { queryKeys } from '../../../hooks/keys';

/** Opens (or creates) the conversation with another user, for a "Message seller" button. */
export function useOpenConversation() {
  return useMutation({ mutationFn: (otherUserId: string) => findOrCreateConversation(otherUserId) });
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

/** Uploads any photos, then posts the message and appends it to the open conversation. `attachments` are photos already
 * uploaded (a retry), which are posted as they are. */
export function useSendMessage(conversationId: string, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, images, attachments }: { body: string; images: PickedPhoto[]; attachments?: string[] }) => {
      const paths = attachments ?? (images.length > 0 && userId ? await uploadMessageAttachments(conversationId, userId, images) : []);
      return sendMessage(conversationId, body, paths);
    },
    onSuccess: message => {
      queryClient.setQueryData<Message[]>(queryKeys.messaging.messages(conversationId), previous =>
        withoutDuplicate(previous ?? [], message),
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.conversations() });
    },
  });
}

/** The conversation ends with a message from the other person that has not been read: the unread dot and bold name. */
export function isUnread(conversation: ConversationWithPreview, userId: string | undefined): boolean {
  const last = conversation.lastMessage;
  return !!last && !!userId && last.sender_id !== userId && last.read_at === null;
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
