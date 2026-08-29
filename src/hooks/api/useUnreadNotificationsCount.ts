import { useCallback, useEffect, useState } from 'react';
import { fetchUnreadCount } from '../../services/modules/notifications/notificationsService';
import { useAuthStore } from '../../store/authStore';
import { useRealtimeNotifications } from '../realtime/useRealtimeNotifications';

/** Drives the notification bell badge (header buttons, the Expert tab's `tabBarBadge`). Kept
 * per-consumer rather than a shared store — mirrors how the rest of this app fetches locally
 * per screen rather than caching cross-screen state that doesn't need to be shared. */
export function useUnreadNotificationsCount() {
  const userId = useAuthStore(state => state.user?.id);
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!userId) return;
    fetchUnreadCount().then(setCount).catch(err => {
      console.warn('[useUnreadNotificationsCount] failed to load unread count:', err);
    });
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRealtimeNotifications(userId, () => refresh());

  return { count, refresh };
}
