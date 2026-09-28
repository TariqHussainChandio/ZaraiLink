import { useEffect } from 'react';
import { supabase } from '../../services/supabase/client';
import type { Notification } from '../../common/notifications';

/** Subscribes to inserts/updates on the signed-in user's own notifications via Supabase
 * Realtime. Requires `public.notifications` in the `supabase_realtime` publication (Module 13). */
export function useRealtimeNotifications(userId: string | undefined, onChange: (notification: Notification) => void) {
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        payload => onChange((payload.new ?? payload.old) as Notification),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}
