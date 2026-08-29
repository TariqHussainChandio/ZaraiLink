import { useEffect } from 'react';
import { supabase } from '../../services/supabase/client';
import type { ConsultationMessage } from '../../types/expert';

/** Mirrors `useRealtimeMessages`. Requires `public.consultation_messages` in the
 * `supabase_realtime` publication (added in Module 14's migration). */
export function useRealtimeConsultationMessages(consultationId: string, onInsert: (message: ConsultationMessage) => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`consultation_messages:${consultationId}`)
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
  }, [consultationId]);
}
