import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Bell, CheckCheck } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ScreenState, useToast } from '../../components';
import { NotificationRow } from '../components/NotificationRow';
import { APP_TABS, MESSAGING_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../hooks/notifications';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../../theme';
import type { Notification } from '../types/notifications';
import { errorMessage } from '../../../utils/errorMessage';

const ORDER_TYPES = new Set(['order_new', 'order_status_changed', 'payment_status_changed']);

const EMPTY_LIST = {
  title: 'No notifications yet',
  description: 'News about your orders, messages and account will show here.',
  icon: Bell,
};

export function NotificationListScreen() {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const userId = useAuthStore(state => state.user?.id);
  // Untyped: this screen is mounted inside three different tab navigators (buyer/farmer/dealer,
  // expert, admin) with different param lists — deep-linking below is best-effort per type and
  // no-ops harmlessly if the current tab bar doesn't have the target route.
  const navigation = useNavigation<any>();
  const toast = useToast();
  const notificationsQuery = useNotifications(!!userId);
  const { refetch } = notificationsQuery;
  // With no signed-in user the query never runs; show the empty list instead of a skeleton that never ends.
  const query = userId
    ? notificationsQuery
    : { ...notificationsQuery, data: notificationsQuery.data ?? [], isPending: false };
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
      // On top of the conversation list (initial: false), so Back and the Messages tab reach it, not a stack whose root is this chat.
      tabNavigation.navigate(APP_TABS.Messages, {
        screen: MESSAGING_ROUTES.Chat,
        initial: false,
        params: {
          conversationId: notification.payload.conversation_id,
          otherUserName: notification.payload.sender_name || 'Conversation',
        },
      });
    }
  };

  const onMarkAllRead = async () => {
    if (!userId) return;
    try {
      await markEverythingRead.mutateAsync();
    } catch (err) {
      // Nothing to decide: the dots simply stay, so a short toast says why.
      toast.error(`Couldn't mark all as read. ${errorMessage(err)}`);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenState query={query} errorTitle="Couldn't load notifications" empty={EMPTY_LIST}>
        {notifications => (
          <>
            {notifications.some(n => !n.read) ? (
              <TouchableOpacity
                onPress={onMarkAllRead}
                style={styles.markAllRow}
                disabled={markEverythingRead.isPending}
                accessibilityRole="button"
                accessibilityLabel="Mark all as read"
                accessibilityState={{ disabled: markEverythingRead.isPending, busy: markEverythingRead.isPending }}
              >
                <CheckCheck size={theme.size.iconSm} color={accent.ink} />
                <Text style={styles.markAllLabel}>Mark all as read</Text>
              </TouchableOpacity>
            ) : null}
            <FlashList
              data={notifications}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <NotificationRow notification={item} onPress={() => onPressNotification(item)} />
              )}
            />
          </>
        )}
      </ScreenState>
    </View>
  );
}

function makeStyles({ colors, space, typography, fontWeight, size }: Theme, accent: Accent) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    markAllRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-end',
      gap: space[1],
      minHeight: size.touchMin,
      paddingHorizontal: space[4],
    },
    markAllLabel: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: accent.ink,
    },
  });
}
