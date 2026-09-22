import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { NotificationRow } from '../../components/features/notifications/NotificationRow';
import { APP_TABS, MESSAGING_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import { fetchNotifications, markAllRead, markRead } from '../../services/modules/notifications/notificationsService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { Notification } from '../../types/notifications';

const ORDER_TYPES = new Set(['order_new', 'order_status_changed', 'payment_status_changed']);

export function NotificationListScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  // Untyped: this screen is mounted inside three different tab navigators (buyer/farmer/dealer,
  // expert, admin) with different param lists — deep-linking below is best-effort per type and
  // no-ops harmlessly if the current tab bar doesn't have the target route.
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    fetchNotifications().then(data => {
      setNotifications(data);
      setLoading(false);
    }).catch(err => {
      console.warn('[NotificationListScreen] failed to load notifications:', err);
      setError(true);
      setLoading(false);
    });
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onPressNotification = async (notification: Notification) => {
    if (!notification.read) {
      markRead(notification.id).then(load).catch(err => {
        console.warn('[NotificationListScreen] failed to mark notification read:', err);
      });
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
    await markAllRead();
    load();
  };

  if (loading) return <Spinner fullscreen />;
  if (error) {
    return (
      <EmptyState
        title={t('notifications.notificationList.loadErrorTitle')}
        description={t('notifications.notificationList.loadErrorDescription')}
        actionLabel={t('common.retry')}
        onAction={load}
      />
    );
  }

  const hasUnread = notifications.some(n => !n.read);

  return (
    <View style={styles.container}>
      {hasUnread ? (
        <TouchableOpacity onPress={onMarkAllRead} style={styles.markAllRow}>
          <Text style={styles.markAllLabel}>{t('notifications.notificationList.markAllReadLabel')}</Text>
        </TouchableOpacity>
      ) : null}
      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <NotificationRow notification={item} onPress={() => onPressNotification(item)} />
        )}
        ListEmptyComponent={
          <EmptyState
            title={t('notifications.notificationList.emptyTitle')}
            description={t('notifications.notificationList.emptyDescription')}
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
      fontWeight: typography.weights.semibold as any,
      color: colors.brand.primary,
    },
  });
}
