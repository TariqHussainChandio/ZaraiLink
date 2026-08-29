import { useEffect } from 'react';
import { supabase } from '../../services/supabase/client';
import type { Message } from '../../types/messaging';

/** Subscribes to new messages in a conversation via Supabase Realtime. Requires `public.messages`
 * to be added to the `supabase_realtime` publication (see the phase3 migration). */
export function useRealtimeMessages(conversationId: string, onInsert: (message: Message) => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
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
  }, [conversationId]);
}
