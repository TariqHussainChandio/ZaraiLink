import { useEffect, useId } from 'react';
import { supabase } from '../../services/supabase/client';
import type { ConsultationMessage } from '../../expert';

/** Mirrors `useRealtimeMessages`. Requires `public.consultation_messages` in the
 * `supabase_realtime` publication (added in Module 14's migration). */
export function useRealtimeConsultationMessages(consultationId: string, onInsert: (message: ConsultationMessage) => void) {
  // supabase.channel() returns the existing channel when a topic repeats, and adding a listener to a subscribed channel
  // throws; each mounted hook (a bell in an app bar and the list it opens, say) gets its own topic, so its own channel.
  const instance = useId();
  useEffect(() => {
    const channel = supabase
      .channel(`consultation_messages:${consultationId}:${instance}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'consultation_messages',
          filter: `consultation_id=eq.${consultationId}`,
        },
        payload => onInsert(payload.new as ConsultationMessage),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultationId, instance]);
}
