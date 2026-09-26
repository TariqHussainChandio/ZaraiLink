import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllRead,
  markRead,
} from '../../services/modules/notifications/notificationsService';
import { useAuthStore } from '../../store/authStore';
import { useRealtimeNotifications } from '../realtime/useRealtimeNotifications';
import { queryKeys } from './keys';

export function useNotifications(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.notifications.list(), queryFn: fetchNotifications, enabled, staleTime: 0 });
}

/** Drives the notification bell badge (header buttons, the Expert tab's `tabBarBadge`). */
export function useUnreadNotificationsCount() {
  const userId = useAuthStore(state => state.user?.id);
  const queryClient = useQueryClient();
  const { data: count = 0, refetch } = useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: fetchUnreadCount,
    enabled: !!userId,
  });
  // A new or changed notification moves both the badge and the list.
  useRealtimeNotifications(userId, () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  });
  return { count, refresh: refetch };
}

function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({ mutationFn: (notificationId: string) => markRead(notificationId), onSuccess: invalidate });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({ mutationFn: () => markAllRead(), onSuccess: invalidate });
}
