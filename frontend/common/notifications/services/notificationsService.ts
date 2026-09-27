import { apiFetch } from '../../api/client';
import type { Notification } from '../../../types/notifications';

// No userId params — the backend always scopes these to the caller's own notifications
// (derived from the verified session token), never from a client-supplied id.
export async function fetchNotifications(): Promise<Notification[]> {
  return apiFetch('/api/v1/notifications');
}

export async function fetchUnreadCount(): Promise<number> {
  const { count } = await apiFetch<{ count: number }>('/api/v1/notifications/unread-count');
  return count;
}

export async function markRead(notificationId: string): Promise<void> {
  await apiFetch(`/api/v1/notifications/${notificationId}/read`, { method: 'PATCH' });
}

export async function markAllRead(): Promise<void> {
  await apiFetch('/api/v1/notifications/read-all', { method: 'PATCH' });
}
