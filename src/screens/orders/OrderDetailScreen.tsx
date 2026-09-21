import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Spinner } from '../../components/ui';
import { StatusBadge } from '../../components/features/orders/StatusBadge';
import { PaymentStatusBadge } from '../../components/features/payments/PaymentStatusBadge';
import { ReviewCard } from '../../components/features/reviews/ReviewCard';
import { APP_TABS, MESSAGING_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import {
  fetchOrderById,
  fetchOrderStatusHistory,
  updateOrderStatus,
} from '../../services/modules/orders/ordersService';
import { findOrCreateConversation } from '../../services/modules/messaging/messagingService';
import {
  fetchPaymentByOrderId,
  markPaymentFailed,
  markPaymentReceived,
} from '../../services/modules/payments/paymentsService';
import { fetchReviewByOrderId } from '../../services/modules/reviews/reviewsService';
import { useAuthStore } from '../../store/authStore';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../theme';
import type { OrderStatus } from '../../types/orders';
import { hapticSuccess } from '../../utils/haptics';

const TIMELINE: OrderStatus[] = ['pending', 'confirmed', 'processing', 'ready', 'completed'];
const TERMINAL_SIDE_STATES: OrderStatus[] = [
  'cancelled',
  'rejected',
  'payment_failed',
  'disputed',
  'refunded',
  'expired',
];

// Order status display strings live under orders.orderDetail.statusLabels.<status> in the
// translation resources, keyed by the same OrderStatus values used throughout this screen.

// Untyped navigation/route: this screen is mounted inside two different stacks (the buyer/
// farmer/dealer Orders tab, and Admin's Home stack for platform-wide order oversight) with
// different param lists — same pattern as NotificationListScreen. The two navigation.navigate
// calls below (PaymentMethod, WriteReview) are only reachable when `canPay`/`canReview`, both
// of which require `isBuyer`, so they're unreachable — and therefore harmless — for an admin
// viewer, who is never the order's buyer.
export function OrderDetailScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { orderId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const tabNavigation = useAppTabNavigation();
  const queryClient = useQueryClient();
  const [messaging, setMessaging] = useState(false);

  const queryKey = ['order-detail', orderId];
  const { data, isLoading: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      const [order, history, payment, review] = await Promise.all([
        fetchOrderById(orderId),
        fetchOrderStatusHistory(orderId),
        fetchPaymentByOrderId(orderId),
        fetchReviewByOrderId(orderId),
      ]);
      return { order, history, payment, review };
    },
  });
  const { order, history = [], payment, review } = data ?? {};

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const statusMutation = useMutation({
    mutationFn: (to: OrderStatus) => updateOrderStatus(orderId, to),
    onSuccess: invalidate,
    onError: error =>
      Alert.alert(
        t('orders.orderDetail.couldNotUpdateOrderTitle'),
        error instanceof Error ? error.message : String(error),
      ),
  });
  const advance = (to: OrderStatus) => {
    // The seller accepting an order is the one transition worth a stronger "something
    // completed" pulse — cancelling/rejecting isn't a moment to celebrate.
    const options = to === 'confirmed' ? { onSuccess: hapticSuccess } : undefined;
    statusMutation.mutate(to, options);
  };
  const updating = statusMutation.isPending;

  const paymentMutation = useMutation({
    mutationFn: (action: 'received' | 'failed') =>
      action === 'received' ? markPaymentReceived(payment!.id) : markPaymentFailed(payment!.id, null),
    onSuccess: invalidate,
    onError: error =>
      Alert.alert(
        t('orders.orderDetail.couldNotUpdatePaymentTitle'),
        error instanceof Error ? error.message : String(error),
      ),
  });
  const onMarkPaymentReceived = () => paymentMutation.mutate('received');
  const onMarkPaymentFailed = () => paymentMutation.mutate('failed');
  const payingAction = paymentMutation.isPending;

  if (loading || !order) return <Spinner fullscreen />;

  const isSeller = order.seller_id === userId;
  const isBuyer = order.buyer_id === userId;
  const isTerminalSideState = TERMINAL_SIDE_STATES.includes(order.status);
  const canCancel = (isBuyer || isSeller) && ['pending', 'confirmed'].includes(order.status);
  const canConfirm = isSeller && order.status === 'pending';
  const canReject = isSeller && order.status === 'pending';
  const canProcess = isSeller && order.status === 'confirmed';
  const canMarkReady = isSeller && order.status === 'processing';
  const canComplete = isSeller && order.status === 'ready';
  const canDispute = isBuyer && order.status === 'completed';
  const canPay = isBuyer && !payment && ['pending', 'confirmed'].includes(order.status);
  const paymentPending = payment && ['pending', 'processing'].includes(payment.status);
  const canReview = isBuyer && !review && order.status === 'completed';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.total}>{t('orders.orderDetail.amountLine', { amount: order.total.toFixed(0) })}</Text>
        <StatusBadge status={order.status} />
      </View>

      {payment ? (
        <Card style={styles.paymentCard}>
          <View style={styles.paymentRow}>
            <Text style={styles.sectionTitle}>{t('orders.orderDetail.paymentSectionTitle')}</Text>
            <PaymentStatusBadge status={payment.status} />
          </View>
          {isSeller && paymentPending ? (
            <View style={styles.paymentActions}>
              <Button
                label={t('orders.orderDetail.markPaymentReceivedLabel')}
                loading={payingAction}
                onPress={onMarkPaymentReceived}
                style={styles.paymentButton}
              />
              <Button
                label={t('orders.orderDetail.markPaymentFailedLabel')}
                variant="destructive"
                loading={payingAction}
                onPress={onMarkPaymentFailed}
                style={styles.paymentButton}
              />
            </View>
          ) : null}
        </Card>
      ) : null}

      {canPay ? (
        <Button
          label={t('orders.orderDetail.payNowLabel')}
          onPress={() => navigation.navigate(ORDERS_ROUTES.PaymentMethod, { orderId: order.id })}
          style={styles.action}
        />
      ) : null}

      {!isTerminalSideState ? (
        <View style={styles.timeline}>
          {TIMELINE.map((stage, index) => {
            const reached = TIMELINE.indexOf(order.status) >= index;
            return (
              <View key={stage} style={styles.timelineStep}>
                <View style={[styles.timelineDot, reached && styles.timelineDotActive]} />
                <Text style={[styles.timelineLabel, reached && styles.timelineLabelActive]}>
                  {t(`orders.orderDetail.statusLabels.${stage}`)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <Card style={styles.itemsCard}>
        <Text style={styles.sectionTitle}>{t('orders.orderDetail.itemsSectionTitle')}</Text>
        {order.order_items.map(item => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemLabel} numberOfLines={1}>
              {t('orders.orderDetail.itemLine', {
                quantity: item.quantity,
                unit: item.listing?.unit ?? '',
                title: item.listing?.title ?? t('orders.orderDetail.listingRemovedFallback'),
              })}
            </Text>
            <Text style={styles.itemPrice}>
              {t('orders.orderDetail.amountLine', { amount: (item.unit_price * item.quantity).toFixed(0) })}
            </Text>
          </View>
        ))}
        <View style={styles.summaryDivider} />
        <View style={styles.itemRow}>
          <Text style={styles.itemLabel}>{t('orders.orderDetail.subtotalLabel')}</Text>
          <Text style={styles.itemPrice}>
            {t('orders.orderDetail.amountLine', { amount: order.product_subtotal.toFixed(0) })}
          </Text>
        </View>
        <View style={styles.itemRow}>
          <Text style={styles.itemLabel}>{t('orders.orderDetail.deliveryLabel')}</Text>
          <Text style={styles.itemPrice}>
            {t('orders.orderDetail.amountLine', { amount: order.delivery_charge.toFixed(0) })}
          </Text>
        </View>
      </Card>

      <Card style={styles.partiesCard}>
        <Text style={styles.sectionTitle}>{t('orders.orderDetail.buyerLabel')}</Text>
        <Text style={styles.partyName}>
          {order.buyer?.full_name ?? t('orders.orderDetail.unknownPartyFallback')}
        </Text>
        <Text style={[styles.sectionTitle, styles.sellerLabel]}>{t('orders.orderDetail.sellerLabel')}</Text>
        <Text style={styles.partyName}>
          {order.seller?.full_name ?? t('orders.orderDetail.unknownPartyFallback')}
        </Text>
      </Card>

      {isBuyer || isSeller ? (
        <Button
          label={isBuyer ? t('orders.orderDetail.messageSellerLabel') : t('orders.orderDetail.messageBuyerLabel')}
          variant="secondary"
          loading={messaging}
          onPress={async () => {
            if (!userId) return;
            const otherPartyId = isBuyer ? order.seller_id : order.buyer_id;
            const otherPartyName =
              (isBuyer ? order.seller?.full_name : order.buyer?.full_name) ??
              t('orders.orderDetail.unknownPartyFallback');
            setMessaging(true);
            try {
              const conversation = await findOrCreateConversation(otherPartyId);
              tabNavigation?.navigate(APP_TABS.Messages, {
                screen: MESSAGING_ROUTES.Chat,
                params: { conversationId: conversation.id, otherUserName: otherPartyName },
              });
            } finally {
              setMessaging(false);
            }
          }}
          style={styles.action}
        />
      ) : null}

      {canConfirm ? (
        <Button
          label={t('orders.orderDetail.confirmOrderLabel')}
          loading={updating}
          onPress={() => advance('confirmed')}
          style={styles.action}
        />
      ) : null}
      {canProcess ? (
        <Button
          label={t('orders.orderDetail.startProcessingLabel')}
          loading={updating}
          onPress={() => advance('processing')}
          style={styles.action}
        />
      ) : null}
      {canMarkReady ? (
        <Button
          label={t('orders.orderDetail.markReadyLabel')}
          loading={updating}
          onPress={() => advance('ready')}
          style={styles.action}
        />
      ) : null}
      {canComplete ? (
        <Button
          label={t('orders.orderDetail.markCompletedLabel')}
          loading={updating}
          onPress={() => advance('completed')}
          style={styles.action}
        />
      ) : null}
      {canReject ? (
        <Button
          label={t('orders.orderDetail.rejectOrderLabel')}
          variant="destructive"
          loading={updating}
          onPress={() => advance('rejected')}
          style={styles.action}
        />
      ) : null}
      {canCancel ? (
        <Button
          label={t('orders.orderDetail.cancelOrderLabel')}
          variant="destructive"
          loading={updating}
          onPress={() => advance('cancelled')}
          style={styles.action}
        />
      ) : null}
      {canDispute ? (
        <Button
          label={t('orders.orderDetail.disputeOrderLabel')}
          variant="secondary"
          loading={updating}
          onPress={() => advance('disputed')}
          style={styles.action}
        />
      ) : null}
      {canReview ? (
        <Button
          label={t('orders.orderDetail.writeReviewLabel')}
          variant="secondary"
          onPress={() =>
            navigation.navigate(ORDERS_ROUTES.WriteReview, {
              orderId: order.id,
              listingId: order.order_items[0]?.listing_id ?? null,
              sellerId: order.seller_id,
            })
          }
          style={styles.action}
        />
      ) : null}
      {review ? <ReviewCard review={review} /> : null}

      {history.length > 0 ? (
        <Card style={styles.historyCard}>
          <Text style={styles.sectionTitle}>{t('orders.orderDetail.statusHistoryTitle')}</Text>
          {history.map(entry => (
            <View key={entry.id} style={styles.historyRow}>
              <Text style={styles.historyLabel}>
                {entry.from_status
                  ? `${t(`orders.orderDetail.statusLabels.${entry.from_status}`)} → `
                  : ''}
                {t(`orders.orderDetail.statusLabels.${entry.to_status}`)}
              </Text>
              <Text style={styles.historyDate}>{new Date(entry.created_at).toLocaleString()}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    content: {
      padding: spacing.lg,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    total: {
      fontSize: typography.sizes['2xl'],
      fontWeight: typography.weights.bold as any,
      color: colors.text.primary,
    },
    timeline: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.xl,
    },
    timelineStep: {
      alignItems: 'center',
      flex: 1,
    },
    timelineDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.border,
      marginBottom: spacing.xs,
    },
    timelineDotActive: {
      backgroundColor: colors.brand.primary,
    },
    timelineLabel: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
    timelineLabelActive: {
      color: colors.brand.primary,
      fontWeight: typography.weights.semibold as any,
    },
    paymentCard: {
      marginBottom: spacing.md,
    },
    paymentRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    paymentActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    paymentButton: {
      flex: 1,
    },
    summaryDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginVertical: spacing.xs,
    },
    historyCard: {
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    historyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    historyLabel: {
      flex: 1,
      marginRight: spacing.sm,
      fontSize: typography.sizes.sm,
      color: colors.text.primary,
    },
    historyDate: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
    itemsCard: {
      marginBottom: spacing.md,
    },
    partiesCard: {
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.secondary,
      marginBottom: spacing.xs,
    },
    sellerLabel: {
      marginTop: spacing.md,
    },
    partyName: {
      fontSize: typography.sizes.base,
      color: colors.text.primary,
    },
    itemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    itemLabel: {
      flex: 1,
      marginRight: spacing.sm,
      color: colors.text.primary,
    },
    itemPrice: {
      color: colors.text.secondary,
      fontWeight: typography.weights.medium as any,
    },
    action: {
      marginTop: spacing.sm,
    },
  });
}
