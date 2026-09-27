import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { EmptyState, Spinner } from '../../components/ui';
import { NotificationRow } from '../../components/features/notifications/NotificationRow';
import { APP_TABS, MESSAGING_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../../hooks/api/notifications';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { Notification } from '../../types/notifications';
import { errorMessage } from '../../utils/errorMessage';

const ORDER_TYPES = new Set(['order_new', 'order_status_changed', 'payment_status_changed']);

export function NotificationListScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  // Untyped: this screen is mounted inside three different tab navigators (buyer/farmer/dealer,
  // expert, admin) with different param lists — deep-linking below is best-effort per type and
  // no-ops harmlessly if the current tab bar doesn't have the target route.
  const navigation = useNavigation<any>();
  const { data: notifications = [], isPending, error, refetch } = useNotifications(!!userId);
  const markNotificationRead = useMarkNotificationRead();
  const markEverythingRead = useMarkAllNotificationsRead();

  // Coming back to the list shows notifications that arrived meanwhile.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  const onPressNotification = async (notification: Notification) => {
    if (!notification.read) {
      // Fire-and-forget: opening the notification must not wait for, or fail on, clearing its unread dot.
      markNotificationRead.mutate(notification.id);
    }

    const tabNavigation = navigation.getParent?.() ?? navigation;

    if (ORDER_TYPES.has(notification.type) && notification.payload?.order_id) {
      tabNavigation.navigate(APP_TABS.Orders, {
        screen: ORDERS_ROUTES.OrderDetail,
        params: { orderId: notification.payload.order_id },
      });
      return;
    }

    if (notification.type === 'new_message' && notification.payload?.conversation_id) {
      tabNavigation.navigate(APP_TABS.Messages, {
        screen: MESSAGING_ROUTES.Chat,
        params: {
          conversationId: notification.payload.conversation_id,
          otherUserName: notification.payload.sender_name ?? 'Conversation',
        },
      });
    }
  };

  const onMarkAllRead = async () => {
    if (!userId) return;
    try {
      await markEverythingRead.mutateAsync();
    } catch (err) {
      Alert.alert('Could not mark notifications as read', errorMessage(err));
    }
  };

  if (isPending && userId) return <Spinner fullscreen />;
  if (error && notifications.length === 0) {
    return (
      <EmptyState
        title="Couldn't load notifications"
        description={errorMessage(error)}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    );
  }

  const hasUnread = notifications.some(n => !n.read);

  return (
    <View style={styles.container}>
      {hasUnread ? (
        <TouchableOpacity onPress={onMarkAllRead} style={styles.markAllRow}>
          <Text style={styles.markAllLabel}>Mark all as read</Text>
        </TouchableOpacity>
      ) : null}
      <FlashList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <NotificationRow notification={item} onPress={() => onPressNotification(item)} />
        )}
        ListEmptyComponent={
          <EmptyState
            title="No notifications yet"
            description="Updates about your activity will show up here."
          />
        }
      />
    </View>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    markAllRow: {
      padding: spacing.md,
      alignItems: 'flex-end',
    },
    markAllLabel: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: colors.brand.primary,
    },
  });
}
