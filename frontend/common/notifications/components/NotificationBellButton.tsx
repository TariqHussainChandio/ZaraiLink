import { Bell } from 'lucide-react-native';
import React from 'react';
import { IconButton } from '../../components';
import { useUnreadNotificationsCount } from '../hooks/notifications';

/** The app bar bell, with the amber count of unread notifications. */
export function NotificationBellButton({ onPress }: { onPress: () => void }) {
  const { count } = useUnreadNotificationsCount();
  return <IconButton icon={Bell} label="Notifications" count={count} onPress={onPress} />;
}
