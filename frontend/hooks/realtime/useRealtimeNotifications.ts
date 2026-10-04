import { useEffect, useId } from 'react';
import { supabase } from '../../services/supabase/client';
import type { Notification } from '../../common/notifications';

/** Subscribes to inserts/updates on the signed-in user's own notifications via Supabase
 * Realtime. Requires `public.notifications` in the `supabase_realtime` publication (Module 13). */
export function useRealtimeNotifications(userId: string | undefined, onChange: (notification: Notification) => void) {
  // supabase.channel() returns the existing channel when a topic repeats, and adding a listener to a subscribed channel
  // throws; each mounted hook (a bell in an app bar and the list it opens, say) gets its own topic, so its own channel.
  const instance = useId();
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications:${userId}:${instance}`)
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
  }, [userId, instance]);
}
