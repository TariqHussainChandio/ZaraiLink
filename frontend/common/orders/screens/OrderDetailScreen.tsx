import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Ban,
  CheckCheck,
  CircleCheck,
  CircleX,
  CreditCard,
  Flag,
  MessageCircle,
  PackageCheck,
  Play,
  Star,
  Truck,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  OrderTimeline,
  PriceBreakdown,
  ScreenState,
  Sheet,
  SkeletonCard,
  SkeletonList,
  StatusBadge,
  useToast,
} from '../../components';
import { useResolvePayment } from '../../payments';
import { ReviewCard } from '../../reviews';
import { APP_TABS, MESSAGING_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import { useOpenConversation } from '../../messaging';
import { useOrderDetail, useUpdateOrderStatus } from '../hooks/orders';
import { useAuthStore } from '../../../state/authStore';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../../theme';
import type { OrderStatus, OrderStatusHistoryEntry } from '../types/orders';
import { hapticSuccess } from '../../../utils/haptics';
import { errorMessage } from '../../../utils/errorMessage';
import { statusMeta } from '../../constants/status';
import { formatRs } from '../../../utils/money';

const WHEN = new Intl.DateTimeFormat('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** When each status was first reached, from the order's status history. */
function reachedAt(history: OrderStatusHistoryEntry[]): Partial<Record<OrderStatus, string>> {
  const out: Partial<Record<OrderStatus, string>> = {};
  for (const entry of history) out[entry.to_status] ??= WHEN.format(new Date(entry.created_at));
  return out;
}

// Untyped navigation/route: this screen is mounted inside two different stacks (the buyer/
// farmer/dealer Orders tab, and Admin's Home stack for platform-wide order oversight) with
// different param lists — same pattern as NotificationListScreen. The two navigation.navigate
// calls below (PaymentMethod, WriteReview) are only reachable when `canPay`/`canReview`, both
// of which require `isBuyer`, so they're unreachable — and therefore harmless — for an admin
// viewer, who is never the order's buyer.
export function OrderDetailScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { orderId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const tabNavigation = useAppTabNavigation();
  const openConversation = useOpenConversation();
  const toast = useToast();

  const detail = useOrderDetail(orderId);
  const { data } = detail;
  const { order, history = [], payment, review } = data ?? {};

  const statusMutation = useUpdateOrderStatus(orderId);
  const [confirmingDispatch, setConfirmingDispatch] = useState(false);
  const advance = (to: OrderStatus, onDone?: () => void) => {
    // The seller accepting an order is the one transition worth a stronger "something
    // completed" pulse — cancelling/rejecting isn't a moment to celebrate.
    statusMutation.mutate(to, {
      onSuccess: () => {
        if (to === 'confirmed') hapticSuccess();
        onDone?.();
      },
      // A shortage at dispatch (D6) arrives here with the API's message, and the order stays ready.
      onError: error => toast.error(errorMessage(error)),
    });
  };
  const updating = statusMutation.isPending;

  const paymentMutation = useResolvePayment();
  const resolvePayment = (action: 'received' | 'failed') => {
    if (!payment) return;
    paymentMutation.mutate(
      { paymentId: payment.id, action },
      { onError: error => toast.error(errorMessage(error)) },
    );
  };
  const onMarkPaymentReceived = () => resolvePayment('received');
  const onMarkPaymentFailed = () => resolvePayment('failed');
  const payingAction = paymentMutation.isPending;

  // ScreenState is the guard: a skeleton while loading, an error Banner with Retry if the load failed (so this screen
  // never spins forever), and "not found" when the order is gone or not visible to this user.
  const skeleton = (
    <View style={styles.content}>
      <SkeletonCard />
      <SkeletonList count={3} />
    </View>
  );
  if (!order) {
    return (
      <View style={styles.container}>
        <ScreenState
          query={detail}
          skeleton={skeleton}
          isEmpty={loaded => !loaded.order}
          empty={{ title: 'Order not found', description: 'It may have been removed, or it is not yours to see.' }}
          errorTitle="Couldn't load this order"
        />
      </View>
    );
  }

  const isSeller = order.seller_id === userId;
  const isBuyer = order.buyer_id === userId;
  const canCancel = (isBuyer || isSeller) && ['pending', 'confirmed'].includes(order.status);
  const canConfirm = isSeller && order.status === 'pending';
  const canReject = isSeller && order.status === 'pending';
  const canProcess = isSeller && order.status === 'confirmed';
  const canMarkReady = isSeller && order.status === 'processing';
  // D5: the seller dispatches a ready order, then completes it; dispatch is when the stock leaves them.
  const canDispatch = isSeller && order.status === 'ready';
  const canComplete = isSeller && order.status === 'dispatched';
  const canDispute = isBuyer && order.status === 'completed';
  const canPay = isBuyer && !payment && ['pending', 'confirmed'].includes(order.status);
  const paymentPending = payment && ['pending', 'processing'].includes(payment.status);
  const canReview = isBuyer && !review && order.status === 'completed';

  return (
    <View style={styles.container}>
      <ScreenState query={detail} skeleton={skeleton} errorTitle="Couldn't refresh this order">
        {() => (
          <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.headerRow}>
              <Text style={styles.total}>{formatRs(order.total)}</Text>
              <StatusBadge kind="order" status={order.status} />
            </View>

            {payment ? (
              <Card style={styles.paymentCard}>
                <View style={styles.paymentRow}>
                  <Text style={styles.sectionTitle}>Payment</Text>
                  <StatusBadge kind="payment" status={payment.status} />
                </View>
                {isSeller && paymentPending ? (
                  <View style={styles.paymentActions}>
                    <Button
                      label="Mark Payment Received"
                      icon={CircleCheck}
                      loading={payingAction}
                      onPress={onMarkPaymentReceived}
                      style={styles.paymentButton}
                    />
                    <Button
                      label="Mark Payment Failed"
                      icon={CircleX}
                      variant="danger"
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
                label="Pay Now"
                icon={CreditCard}
                onPress={() => navigation.navigate(ORDERS_ROUTES.PaymentMethod, { orderId: order.id })}
                style={styles.action}
              />
            ) : null}

            <Card style={styles.itemsCard}>
              <OrderTimeline status={order.status} reachedAt={reachedAt(history)} />
            </Card>

            <Card style={styles.itemsCard}>
              <Text style={styles.sectionTitle}>Items</Text>
              {order.order_items.map(item => (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={styles.itemLabel} numberOfLines={1}>
                    {`${item.quantity} ${item.listing?.unit ?? ''} × ${item.listing?.title ?? 'Listing removed'}`}
                  </Text>
                  <Text style={styles.itemPrice}>
                    {formatRs(item.unit_price * item.quantity)}
                  </Text>
                </View>
              ))}
              <View style={styles.summaryDivider} />
              <PriceBreakdown subtotal={order.product_subtotal} delivery={order.delivery_charge} total={order.total} />
            </Card>

            <Card style={styles.partiesCard}>
              <Text style={styles.sectionTitle}>Buyer</Text>
              <Text style={styles.partyName}>
                {order.buyer?.full_name || 'Unknown'}
              </Text>
              <Text style={[styles.sectionTitle, styles.sellerLabel]}>Seller</Text>
              <Text style={styles.partyName}>
                {order.seller?.full_name || 'Unknown'}
              </Text>
            </Card>

            {isBuyer || isSeller ? (
              <Button
                label={isBuyer ? 'Message Seller' : 'Message Buyer'}
                icon={MessageCircle}
                variant="secondary"
                loading={openConversation.isPending}
                onPress={async () => {
                  if (!userId) return;
                  const otherPartyId = isBuyer ? order.seller_id : order.buyer_id;
                  const otherPartyName =
                    (isBuyer ? order.seller?.full_name : order.buyer?.full_name) ?? '';
                  try {
                    const conversation = await openConversation.mutateAsync({
                      otherUserId: otherPartyId,
                      context: { type: 'order', id: order.id },
                    });
                    // On top of the conversation list (initial: false), so Back and the Messages tab reach it, not a stack whose root is this chat.
                    tabNavigation?.navigate(APP_TABS.Messages, {
                      screen: MESSAGING_ROUTES.Chat,
                      initial: false,
                      params: { conversationId: conversation.id, otherUserName: otherPartyName },
                    });
                  } catch (error) {
                    toast.error(errorMessage(error));
                  }
                }}
                style={styles.action}
              />
            ) : null}

            {canConfirm ? (
              <Button
                label="Confirm Order"
                icon={CheckCheck}
                loading={updating}
                onPress={() => advance('confirmed')}
                style={styles.action}
              />
            ) : null}
            {canProcess ? (
              <Button
                label="Start Processing"
                icon={Play}
                loading={updating}
                onPress={() => advance('processing')}
                style={styles.action}
              />
            ) : null}
            {canMarkReady ? (
              <Button
                label="Mark Ready"
                icon={PackageCheck}
                loading={updating}
                onPress={() => advance('ready')}
                style={styles.action}
              />
            ) : null}
            {canDispatch ? (
              <Button
                label="Mark Dispatched"
                icon={Truck}
                loading={updating}
                onPress={() => setConfirmingDispatch(true)}
                style={styles.action}
              />
            ) : null}
            {canComplete ? (
              <Button
                label="Mark Completed"
                icon={CircleCheck}
                loading={updating}
                onPress={() => advance('completed')}
                style={styles.action}
              />
            ) : null}
            {canReject ? (
              <Button
                label="Reject Order"
                icon={CircleX}
                variant="danger"
                loading={updating}
                onPress={() => advance('rejected')}
                style={styles.action}
              />
            ) : null}
            {canCancel ? (
              <Button
                label="Cancel Order"
                icon={Ban}
                variant="danger"
                loading={updating}
                onPress={() => advance('cancelled')}
                style={styles.action}
              />
            ) : null}
            {canDispute ? (
              <Button
                label="Dispute Order"
                icon={Flag}
                variant="secondary"
                loading={updating}
                onPress={() => advance('disputed')}
                style={styles.action}
              />
            ) : null}
            {canReview ? (
              <Button
                label="Write a Review"
                icon={Star}
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
                <Text style={styles.sectionTitle}>Status History</Text>
                {history.map(entry => (
                  <View key={entry.id} style={styles.historyRow}>
                    <Text style={styles.historyLabel}>
                      {entry.from_status
                        ? `${statusMeta('order', entry.from_status).label} → `
                        : ''}
                      {statusMeta('order', entry.to_status).label}
                    </Text>
                    <Text style={styles.historyDate}>{new Date(entry.created_at).toLocaleString()}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            <Sheet visible={confirmingDispatch} onClose={() => setConfirmingDispatch(false)} title="Dispatch this order?">
              <Text style={styles.sheetText}>
                {"The stock leaves your inventory now, and the buyer sees the order as dispatched. This can't be undone."}
              </Text>
              <Button
                label="Dispatch now"
                icon={Truck}
                loading={updating}
                onPress={() => advance('dispatched', () => setConfirmingDispatch(false))}
                style={styles.action}
              />
              <Button label="Not yet" variant="secondary" onPress={() => setConfirmingDispatch(false)} style={styles.action} />
            </Sheet>
          </ScrollView>
        )}
      </ScreenState>
    </View>
  );
}

function makeStyles({ colors, space, typography, fontWeight, borders }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: space[4],
    },
    total: {
      ...typography.headline,
      color: colors.ink,
    },
    paymentCard: {
      marginBottom: space[3],
    },
    paymentRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    paymentActions: {
      flexDirection: 'row',
      gap: space[2],
      marginTop: space[3],
    },
    paymentButton: {
      flex: 1,
    },
    summaryDivider: {
      borderTopWidth: borders.hairline,
      borderTopColor: colors.line,
      marginVertical: space[1],
    },
    historyCard: {
      marginTop: space[3],
      marginBottom: space[3],
    },
    historyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: space[1],
    },
    historyLabel: {
      flex: 1,
      marginRight: space[2],
      ...typography.caption,
      color: colors.ink,
    },
    historyDate: {
      ...typography.caption,
      color: colors.ink2,
    },
    itemsCard: {
      marginBottom: space[3],
    },
    partiesCard: {
      marginBottom: space[3],
    },
    sectionTitle: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink2,
      marginBottom: space[1],
    },
    sellerLabel: {
      marginTop: space[3],
    },
    partyName: {
      ...typography.body,
      color: colors.ink,
    },
    itemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: space[1],
    },
    itemLabel: {
      ...typography.body,
      flex: 1,
      marginRight: space[2],
      color: colors.ink,
    },
    itemPrice: {
      ...typography.figure,
      color: colors.ink2,
    },
    action: {
      marginTop: space[2],
    },
    sheetText: {
      ...typography.body,
      color: colors.ink2,
    },
  });
}
