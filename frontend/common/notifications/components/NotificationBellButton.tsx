import { Bell } from 'lucide-react-native';
import React from 'react';
import { IconButton } from '../../components';
import { useUnreadNotificationsCount } from '../hooks/notifications';

/** The app bar bell, with the amber count of unread notifications, plus `extra`: alerts that live elsewhere but are read
 * in the same list (a dealer's stock alerts from the inventory system, D20). */
export function NotificationBellButton({ onPress, extra = 0 }: { onPress: () => void; extra?: number }) {
  const { count } = useUnreadNotificationsCount();
  return <IconButton icon={Bell} label="Notifications" count={count + extra} onPress={onPress} />;
}
