import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';
import { supabase } from '../../services/supabase/client';
import type { Message } from '../../common/messaging';
import { queryKeys } from '../keys';

/** Subscribes to a conversation via Supabase Realtime: new messages (INSERT, handed to `onInsert`) and changes to
 * existing ones (UPDATE, mostly `read_at` when the other person opens the chat), which are merged into the cached
 * message list so the read ticks change live. Requires `public.messages` in the `supabase_realtime` publication
 * (see the phase3 migration). */
export function useRealtimeMessages(conversationId: string, onInsert: (message: Message) => void) {
  const queryClient = useQueryClient();
  // supabase.channel() returns the existing channel when a topic repeats, and adding a listener to a subscribed channel
  // throws; each mounted hook (a bell in an app bar and the list it opens, say) gets its own topic, so its own channel.
  const instance = useId();
  useEffect(() => {
    const filter = `conversation_id=eq.${conversationId}`;
    const channel = supabase
      .channel(`messages:${conversationId}:${instance}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, payload => onInsert(payload.new as Message))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, payload => {
        const changed = payload.new as Message;
        // Only a message already in the list is patched; a row never loaded is picked up by the next fetch.
        queryClient.setQueryData<Message[]>(queryKeys.messaging.messages(conversationId), previous =>
          previous?.map(message => (message.id === changed.id ? { ...message, ...changed } : message)),
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, instance]);
}
