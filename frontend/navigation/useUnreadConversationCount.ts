import { useMemo } from 'react';
import { isUnread, useConversations } from '../common/messaging';
import { useAuthStore } from '../state/authStore';

/** How many conversations end with a message from the other person that has not been read: the count on the Messages
 * button in the Home app bar. It shares the conversation list's query, so opening the inbox costs no second request. */
export function useUnreadConversationCount(enabled = true): number {
  const userId = useAuthStore(state => state.user?.id);
  const { data } = useConversations(enabled && !!userId);
  return useMemo(() => (data ?? []).filter(conversation => isUnread(conversation, userId)).length, [data, userId]);
}
