import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Avatar,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  ListGroup,
  ListRow,
  OrderTimeline,
  PriceBreakdown,
  QueryState,
  RatePlate,
  ScreenScaffold,
  StatusBadge,
  StickyActionBar,
  useSnackbar,
} from '../../components';
import { paymentMethodName, useResolvePayment } from '../../payments';
import { ReviewCard } from '../../reviews';
import { APP_TABS, MESSAGING_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import { useOpenConversation } from '../../messaging';
import { useOrderDetail, useUpdateOrderStatus } from '../hooks/orders';
import { orderNextStep, type OrderViewer } from '../utils/orderCopy';
import { useAuthStore } from '../../../state/authStore';
import { navigateInTab } from '../../../navigation/navigateInTab';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../../theme';
import type { OrderStatus, OrderStatusHistoryEntry } from '../types/orders';
import { formatWhen } from '../../../utils/dates';
import { hapticSuccess } from '../../../utils/haptics';
import { errorMessage } from '../../../utils/errorMessage';
import { formatAmount, formatRs } from '../../../utils/money';

/** When each status was first reached, from the order's status history, in the app's date format. */
function reachedAt(history: OrderStatusHistoryEntry[]): Partial<Record<OrderStatus, string>> {
  const out: Partial<Record<OrderStatus, string>> = {};
  for (const entry of history) out[entry.to_status] ??= formatWhen(entry.created_at);
  return out;
}

// What the snackbar says once a status change has gone through, in the action's past tense.
const DONE: Record<OrderStatus, string> = {
  pending: 'Order placed',
  confirmed: 'Order confirmed',
  processing: 'Marked as being prepared',
  ready: 'Marked ready for dispatch',
  dispatched: 'Order dispatched',
  completed: 'Order completed',
  cancelled: 'Order cancelled',
  rejected: 'Order rejected',
  payment_failed: 'Payment marked as not received',
  disputed: 'Dispute opened',
  refunded: 'Order refunded',
  expired: 'Order expired',
};

/** The seller's next forward step for each status, named for what it does. One of these is the seller's single primary
 * action; the rest of what a seller can do is quiet. */
const SELLER_STEP: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  pending: { to: 'confirmed', label: 'Confirm order' },
  confirmed: { to: 'processing', label: 'Start preparing' },
  processing: { to: 'ready', label: 'Mark ready for dispatch' },
  ready: { to: 'dispatched', label: 'Dispatch order' },
  dispatched: { to: 'completed', label: 'Complete order' },
};

type Pending = 'reject' | 'cancel' | 'dispute' | 'dispatch' | 'paid' | 'notPaid';

// Untyped navigation/route: this screen is mounted inside two different stacks (the buyer/farmer/dealer Orders tab, and
// Admin's Home stack for platform-wide order oversight) with different param lists. The navigations below to PaymentMethod
// and WriteReview are only reachable when the viewer is the order's buyer, which an admin never is.
export function OrderDetailScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { orderId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const role = useAuthStore(state => state.role);
  const tabs = useAppTabNavigation();
  const snackbar = useSnackbar();
  const openConversation = useOpenConversation();

  const query = useOrderDetail(orderId);
  const { order, history = [], payment, review } = query.data ?? {};
  const statusMutation = useUpdateOrderStatus(orderId);
  const paymentMutation = useResolvePayment();
  const [pending, setPending] = useState<Pending | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isSeller = order?.seller_id === userId;
  const isBuyer = order?.buyer_id === userId;
  const viewer: OrderViewer = isBuyer ? 'buyer' : isSeller ? 'seller' : 'other';
  const buyerName = order?.buyer?.full_name || 'The buyer';
  const sellerName = order?.seller?.full_name || 'The seller';
  const otherName = isBuyer ? sellerName : buyerName;

  /** Moves the order to `to`. Rejects when the API refuses (a shortage at dispatch arrives with its message), so a
   * ConfirmSheet shows the failure inside itself and a direct button shows it in the banner. */
  const advance = async (to: OrderStatus) => {
    await statusMutation.mutateAsync(to);
    if (to === 'confirmed') hapticSuccess();
    snackbar.show(DONE[to]);
  };
  const advanceDirect = async (to: OrderStatus) => {
    setActionError(null);
    try {
      await advance(to);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const resolvePayment = async (action: 'received' | 'failed', reason: string) => {
    if (!payment) return;
    await paymentMutation.mutateAsync({ paymentId: payment.id, action, reason });
    snackbar.show(action === 'received' ? 'Payment marked as received' : 'Payment marked as not received');
  };

  const openChat = async () => {
    if (!userId || !order) return;
    setActionError(null);
    try {
      const conversation = await openConversation.mutateAsync(isBuyer ? order.seller_id : order.buyer_id);
      // On top of the conversation list, so Back and the Messages tab reach it (MK-01).
      navigateInTab(tabs, APP_TABS.Messages, MESSAGING_ROUTES.Chat, { conversationId: conversation.id, otherUserName: otherName });
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const step = isSeller && order ? SELLER_STEP[order.status] : undefined;
  const canPay = isBuyer && !payment && order !== undefined && ['pending', 'confirmed'].includes(order.status);
  const canReview = isBuyer && !review && order?.status === 'completed';
  const paymentPending = payment !== undefined && payment !== null && ['pending', 'processing'].includes(payment.status);

  // The single primary action of this viewer at this status; it goes in the sticky bar (MK-12).
  let primary: { label: string; busy?: boolean; onPress: () => void } | null = null;
  if (order && step) {
    primary = {
      label: step.label,
      busy: statusMutation.isPending,
      onPress: () => (step.to === 'dispatched' ? setPending('dispatch') : advanceDirect(step.to)),
    };
  } else if (order && canPay) {
    primary = { label: 'Choose how to pay', onPress: () => navigation.navigate(ORDERS_ROUTES.PaymentMethod, { orderId: order.id }) };
  } else if (order && canReview) {
    primary = {
      label: 'Write a review',
      onPress: () =>
        navigation.navigate(ORDERS_ROUTES.WriteReview, {
          orderId: order.id,
          listingId: order.order_items[0]?.listing_id ?? null,
          sellerId: order.seller_id,
        }),
    };
  }

  const canReject = isSeller && order?.status === 'pending';
  // A seller may cancel only once they have confirmed; before that, Reject says what they mean (MK-06).
  const canCancel = order !== undefined && ((isBuyer && ['pending', 'confirmed'].includes(order.status)) || (isSeller && order.status === 'confirmed'));
  const canDispute = isBuyer && order?.status === 'completed';
  const dealer = role === 'dealer';

  // One sheet for every irreversible act; what it says and does depends on which one was opened.
  const sheet = (() => {
    if (!pending || !order) return null;
    switch (pending) {
      case 'reject':
        return { title: 'Reject this order?', message: `${buyerName} is told you rejected it. This can't be undone.`, confirmLabel: 'Reject order', keepLabel: 'Keep the order', destructive: true, run: () => advance('rejected') };
      case 'cancel':
        return { title: 'Cancel this order?', message: `${otherName} is told it was cancelled. This can't be undone.`, confirmLabel: 'Cancel order', keepLabel: 'Keep the order', destructive: true, run: () => advance('cancelled') };
      case 'dispute':
        return { title: 'Dispute this order?', message: 'You are saying something is wrong with it. An administrator looks into it. This can\'t be undone.', confirmLabel: 'Open dispute', keepLabel: 'Keep it as completed', destructive: true, run: () => advance('disputed') };
      case 'dispatch':
        return {
          title: 'Dispatch this order?',
          message: `${dealer ? 'Your stock is reduced now, and ' : ''}${buyerName} sees the order as dispatched. This can't be undone.`,
          confirmLabel: 'Dispatch order',
          keepLabel: 'Not yet',
          destructive: false,
          run: () => advance('dispatched'),
        };
      case 'paid':
        return {
          title: 'Mark payment as received?',
          message: `Confirm that ${buyerName} paid you ${formatRs(payment?.amount ?? 0)}. They paid you directly; ZaraiLink holds no money.`,
          confirmLabel: 'Mark as paid',
          keepLabel: 'Not yet',
          destructive: false,
          run: () => resolvePayment('received', ''),
        };
      case 'notPaid':
        return {
          title: 'Mark payment as not received?',
          message: `${buyerName} is told you did not receive ${formatRs(payment?.amount ?? 0)}. The order moves to payment failed.`,
          confirmLabel: 'Mark as not received',
          keepLabel: 'Go back',
          destructive: true,
          // The payments API accepts a reason for this one, so it is asked for (optional).
          reason: { label: 'Reason', optional: true, helper: 'Recorded with the payment.' },
          run: (reason: string) => resolvePayment('failed', reason),
        };
    }
  })();

  return (
    <>
      <ScreenScaffold
        onRefresh={() => query.refetch()}
        refreshing={query.isRefetching}
        footer={
          primary ? (
            <StickyActionBar>
              <Button label={primary.label} size="lg" loading={primary.busy} onPress={primary.onPress} />
            </StickyActionBar>
          ) : undefined
        }
      >
        <QueryState query={query} failureTitle="Couldn't load this order">
          {order ? (
            <>
              {actionError ? (
                <Banner tone="danger" title="That did not go through">
                  {actionError}
                </Banner>
              ) : null}

              <View style={styles.summary}>
                <StatusBadge kind="order" status={order.status} />
                <Text style={styles.next}>{orderNextStep(order.status, viewer, { buyer: buyerName, seller: sellerName }, dealer)}</Text>
                <RatePlate amount={order.total} unit="Total, delivery included" size="xl" />
              </View>

              <Card style={styles.card}>
                <Text style={styles.cardTitle} accessibilityRole="header">
                  What was ordered
                </Text>
                {order.order_items.map(item => (
                  <View key={item.id} style={styles.itemRow} accessible accessibilityLabel={`${item.quantity} ${item.listing?.unit ?? ''} ${item.listing?.title ?? 'Listing removed'}, ${formatRs(item.unit_price * item.quantity)}`}>
                    <Text style={styles.itemLabel}>{`${formatAmount(item.quantity)} ${item.listing?.unit ?? ''} × ${item.listing?.title ?? 'Listing removed'}`}</Text>
                    <Text style={styles.itemPrice}>{formatRs(item.unit_price * item.quantity)}</Text>
                  </View>
                ))}
                <PriceBreakdown
                  subtotal={order.product_subtotal}
                  delivery={order.delivery_charge}
                  total={order.total}
                  payTo={
                    isBuyer
                      ? `You pay ${sellerName} directly. ZaraiLink does not hold your money.`
                      : isSeller
                        ? `${buyerName} pays you directly. ZaraiLink does not hold the money.`
                        : undefined
                  }
                />
              </Card>

              {payment ? (
                <Card style={styles.card}>
                  <View style={styles.paymentRow}>
                    <Text style={styles.cardTitle} accessibilityRole="header">
                      {paymentMethodName(payment.method)}
                    </Text>
                    <StatusBadge kind="payment" status={payment.status} />
                  </View>
                  {isSeller && paymentPending ? (
                    <View style={styles.paymentActions}>
                      <Button label="Mark payment as received" variant="secondary" onPress={() => setPending('paid')} />
                      <Button label="Payment not received" variant="quiet" onPress={() => setPending('notPaid')} />
                    </View>
                  ) : null}
                </Card>
              ) : null}

              <Card style={styles.card}>
                <Text style={styles.cardTitle} accessibilityRole="header">
                  Progress
                </Text>
                <OrderTimeline status={order.status} reachedAt={reachedAt(history)} />
              </Card>

              {isBuyer || isSeller ? (
                <ListGroup>
                  <ListRow
                    title={otherName}
                    meta={isBuyer ? 'Seller. Tap to message.' : 'Buyer. Tap to message.'}
                    leading={<Avatar name={otherName} size={theme.size.avatarMd} />}
                    onPress={openChat}
                    accessibilityLabel={`Message ${otherName}, ${isBuyer ? 'the seller' : 'the buyer'}`}
                  />
                </ListGroup>
              ) : (
                <ListGroup>
                  <ListRow title={buyerName} meta="Buyer" leading={<Avatar name={buyerName} size={theme.size.avatarMd} />} />
                  <ListRow title={sellerName} meta="Seller" leading={<Avatar name={sellerName} size={theme.size.avatarMd} />} />
                </ListGroup>
              )}

              {review ? <ReviewCard review={review} /> : null}

              {canReject || canCancel || canDispute ? (
                <View style={styles.quiet}>
                  {canReject ? <Button label="Reject order" variant="quiet" onPress={() => setPending('reject')} /> : null}
                  {canCancel ? <Button label="Cancel order" variant="quiet" onPress={() => setPending('cancel')} /> : null}
                  {canDispute ? <Button label="Dispute order" variant="quiet" onPress={() => setPending('dispute')} /> : null}
                </View>
              ) : null}
            </>
          ) : null}
        </QueryState>
      </ScreenScaffold>
      {sheet ? (
        <ConfirmSheet
          visible
          onClose={() => setPending(null)}
          title={sheet.title}
          message={sheet.message}
          confirmLabel={sheet.confirmLabel}
          keepLabel={sheet.keepLabel}
          destructive={sheet.destructive}
          reason={'reason' in sheet ? sheet.reason : undefined}
          onConfirm={reason => sheet.run(reason)}
        />
      ) : null}
    </>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    summary: { gap: space[3], alignItems: 'flex-start' },
    next: { ...typography.bodyLg, color: colors.ink },
    card: { gap: space[3] },
    cardTitle: { ...typography.title, color: colors.ink },
    itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
    itemLabel: { ...typography.body, flex: 1, color: colors.ink },
    itemPrice: { ...typography.figure, color: colors.ink },
    paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3] },
    paymentActions: { gap: space[2] },
    quiet: { gap: space[1] },
  });
}
