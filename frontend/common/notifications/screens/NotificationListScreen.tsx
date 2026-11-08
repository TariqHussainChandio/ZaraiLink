import { useFocusEffect } from '@react-navigation/native';
import { Bell, CheckCheck } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, ListGroup, QueryState, ScreenScaffold } from '../../components';
import { NotificationRow } from '../components/NotificationRow';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '../hooks/notifications';
import { notificationTarget } from '../hooks/notificationTargets';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { formatDay } from '../../../utils/dates';
import { errorMessage } from '../../../utils/errorMessage';
import type { Notification } from '../types/notifications';

/** Notifications from today, and everything before. */
function splitByDay(notifications: Notification[], now: Date) {
  const today = formatDay(now, { now });
  return {
    today: notifications.filter(n => formatDay(n.created_at, { now }) === today),
    earlier: notifications.filter(n => formatDay(n.created_at, { now }) !== today),
  };
}

export function NotificationListScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  // The tab navigator above this stack: the three shells (buyer/farmer/dealer, expert, admin) all hold the list in a tab, and
  // every target goes through navigateInTab so Back stays in the tab it opened.
  const tabs = useAppTabNavigation();
  const query = useNotifications(!!userId);
  const { data: notifications = [], refetch } = query;
  const markNotificationRead = useMarkNotificationRead();
  const markEverythingRead = useMarkAllNotificationsRead();
  const [markAllError, setMarkAllError] = useState<unknown>(null);
  // Only a pull shows the spinner; the refetch on every return to the list is quiet.
  const [pulling, setPulling] = useState(false);

  // Coming back to the list shows notifications that arrived meanwhile.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  const now = new Date();
  const { today, earlier } = splitByDay(notifications, now);
  const hasUnread = notifications.some(n => !n.read);

  const open = (notification: Notification) => {
    if (!notification.read) {
      // Fire-and-forget: opening the notification must not wait for, or fail on, clearing its unread dot.
      markNotificationRead.mutate(notification.id);
    }
    notificationTarget(notification, tabs)?.();
  };

  const markAll = async () => {
    setMarkAllError(null);
    try {
      await markEverythingRead.mutateAsync();
    } catch (error) {
      setMarkAllError(error);
    }
  };

  const pull = async () => {
    setPulling(true);
    try {
      await refetch();
    } finally {
      setPulling(false);
    }
  };

  const section = (title: string, rows: Notification[]) =>
    rows.length === 0 ? null : (
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        <ListGroup>
          {rows.map(notification => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              now={now}
              opens={notificationTarget(notification, tabs) !== null}
              onPress={() => open(notification)}
            />
          ))}
        </ListGroup>
      </View>
    );

  return (
    <ScreenScaffold onRefresh={pull} refreshing={pulling}>
      <QueryState
        query={query}
        isEmpty={notifications.length === 0}
        empty={{ icon: Bell, title: 'No notifications yet', description: 'Updates about your orders, listings, messages and account show up here.' }}
        failureTitle="Couldn't load notifications"
      >
        {markAllError ? (
          <Banner tone="danger" title="Couldn't mark them as read" actionLabel="Try again" onAction={() => {
              // Not returned: the press is done at once; the request is tracked by the mutation.
              markAll();
            }}>
            {errorMessage(markAllError)}
          </Banner>
        ) : null}
        {hasUnread ? (
          <View style={styles.markAll}>
            <Button
              label="Mark all as read"
              variant="secondary"
              size="sm"
              icon={CheckCheck}
              fullWidth={false}
              loading={markEverythingRead.isPending}
              onPress={() => {
                markAll();
              }}
            />
          </View>
        ) : null}
        {section('Today', today)}
        {section('Earlier', earlier)}
      </QueryState>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    markAll: { alignItems: 'flex-end' },
    section: { gap: space[2] },
    sectionTitle: { ...typography.title, color: colors.ink },
  });
}
