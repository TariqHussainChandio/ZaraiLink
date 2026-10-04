import { useEffect, useId } from 'react';
import { supabase } from '../../services/supabase/client';
import type { Message } from '../../common/messaging';

/** Subscribes to new messages in a conversation via Supabase Realtime. Requires `public.messages`
 * to be added to the `supabase_realtime` publication (see the phase3 migration). */
export function useRealtimeMessages(conversationId: string, onInsert: (message: Message) => void) {
  // supabase.channel() returns the existing channel when a topic repeats, and adding a listener to a subscribed channel
  // throws; each mounted hook (a bell in an app bar and the list it opens, say) gets its own topic, so its own channel.
  const instance = useId();
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}:${instance}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        payload => onInsert(payload.new as Message),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, instance]);
}
