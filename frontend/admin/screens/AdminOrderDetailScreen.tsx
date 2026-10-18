import { Ban, Gavel } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Banner,
  Button,
  Card,
  ChipRow,
  OrderTimeline,
  PriceBreakdown,
  ScreenState,
  Sheet,
  StatusBadge,
  TextField,
  useToast,
} from '../../common/components';
import { statusMeta } from '../../common/constants/status';
import type { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { formatRs } from '../../utils/money';
import {
  useAdminOrder,
  useCancelOrderAsAdmin,
  useResolveDispute,
} from '../hooks/admin';
import type { DisputeOutcome, OrderStatusHistoryEntry } from '../types/orders';

const WHEN = new Intl.DateTimeFormat('en-PK', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

// The database lets an admin cancel only an order that has not left the seller (guard_orders_update; SRDS §14).
const CANCELLABLE = ['pending', 'confirmed', 'processing', 'ready'];
const MAX_REASON = 500;

// From a dispute the status graph allows exactly these two outcomes (guard_orders_update). BR-11: the platform holds no
// money, so "refunded" records the decision; the seller pays any refund to the buyer off the platform.
const DISPUTE_OUTCOMES: {
  value: DisputeOutcome;
  label: string;
  explain: string;
  done: string;
}[] = [
  {
    value: 'refunded',
    label: 'Refund the buyer',
    explain:
      'The buyer is right. The seller refunds the buyer directly; ZaraiLink holds no money.',
    done: 'Dispute settled: the buyer is to be refunded.',
  },
  {
    value: 'completed',
    label: 'Complete the order',
    explain: 'The seller is right. The order stands as delivered.',
    done: 'Dispute settled: the order is complete.',
  },
];

type Status = OrderStatusHistoryEntry['to_status'];

/** When each status was first reached, from the order's status history. */
function reachedAt(
  history: OrderStatusHistoryEntry[],
): Partial<Record<Status, string>> {
  const out: Partial<Record<Status, string>> = {};
  for (const entry of history)
    out[entry.to_status] ??= WHEN.format(new Date(entry.created_at));
  return out;
}

/**
 * One order as the admin sees it (SRDS §14): what was bought, by whom, its timeline and payment, and the admin's
 * cancellation with a reason both parties read, and the settlement of a dispute. Both need two-step verification and are
 * audited by the API as "Order Administrative Action" (BR-15); a refusal (no second factor, or the order moved on) shows
 * in the banner.
 */
export function AdminOrderDetailScreen({
  route,
}: AdminScreenProps<typeof ADMIN_HOME_ROUTES.OrderDetail>) {
  const { orderId } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const query = useAdminOrder(orderId);
  const cancel = useCancelOrderAsAdmin();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const resolve = useResolveDispute();
  const [resolving, setResolving] = useState(false);
  const [outcome, setOutcome] = useState<DisputeOutcome>('refunded');
  // The settlement's own reason, apart from the cancellation's: both parties read it on the order (admin_action_reason).
  const [settleReason, setSettleReason] = useState('');
  const [settleReasonError, setSettleReasonError] = useState<
    string | undefined
  >();
  const toast = useToast();

  if (!query.data) {
    return (
      <ScreenState
        query={query}
        errorTitle="Couldn't load the order"
        empty={{
          title: 'Order not found',
          description: 'Go back and open it again.',
        }}
      />
    );
  }

  const { order, history, payment } = query.data;
  const canCancel = CANCELLABLE.includes(order.status);
  const isDisputed = order.status === 'disputed';
  const chosenOutcome =
    DISPUTE_OUTCOMES.find(option => option.value === outcome) ??
    DISPUTE_OUTCOMES[0];

  const confirmResolve = async () => {
    const trimmed = settleReason.trim();
    if (!trimmed) {
      setSettleReasonError('Say why you settle it this way');
      return;
    }
    if (trimmed.length > MAX_REASON) {
      setSettleReasonError(`Keep the reason under ${MAX_REASON} characters`);
      return;
    }
    setResolving(false);
    setFailure(null);
    try {
      await resolve.mutateAsync({ orderId, outcome, reason: trimmed });
      toast.success(chosenOutcome?.done ?? 'Dispute settled');
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  const confirmCancel = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError('Say why the order is cancelled');
      return;
    }
    if (trimmed.length > MAX_REASON) {
      setReasonError(`Keep the reason under ${MAX_REASON} characters`);
      return;
    }
    setCancelling(false);
    setFailure(null);
    try {
      await cancel.mutateAsync({ orderId, reason: trimmed });
      toast.success(
        'Order cancelled. The buyer and the seller can read your reason.',
      );
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Text style={styles.total}>{formatRs(order.total)}</Text>
        <StatusBadge kind="order" status={order.status} />
      </View>

      {order.admin_action_reason ? (
        <Banner tone="warning" title="Admin's reason">
          {order.admin_action_reason}
        </Banner>
      ) : null}
      {failure ? <Banner tone="danger">{failure}</Banner> : null}

      {payment ? (
        <Card>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <StatusBadge kind="payment" status={payment.status} />
          </View>
        </Card>
      ) : null}

      <Card>
        <OrderTimeline status={order.status} reachedAt={reachedAt(history)} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Items</Text>
        {(order.order_items ?? []).map(item => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemLabel} numberOfLines={1}>
              {`${item.quantity} ${item.listing?.unit ?? ''} × ${item.listing?.title ?? 'Listing removed'}`}
            </Text>
            <Text style={styles.itemPrice}>
              {formatRs(item.unit_price * item.quantity)}
            </Text>
          </View>
        ))}
        <PriceBreakdown
          subtotal={order.product_subtotal}
          delivery={order.delivery_charge}
          total={order.total}
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Buyer</Text>
        <Text style={styles.body}>{order.buyer?.full_name || 'Unknown'}</Text>
        <Text style={[styles.sectionTitle, styles.spaced]}>Seller</Text>
        <Text style={styles.body}>{order.seller?.full_name || 'Unknown'}</Text>
      </Card>

      {history.length > 0 ? (
        <Card>
          <Text style={styles.sectionTitle}>Status history</Text>
          {history.map(entry => (
            <View key={entry.id} style={styles.itemRow}>
              <Text style={styles.historyLabel}>
                {entry.from_status
                  ? `${statusMeta('order', entry.from_status).label} → `
                  : ''}
                {statusMeta('order', entry.to_status).label}
              </Text>
              <Text style={styles.meta}>
                {WHEN.format(new Date(entry.created_at))}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {canCancel ? (
        <Button
          label="Cancel order"
          icon={Ban}
          variant="danger"
          loading={cancel.isPending}
          onPress={() => {
            setReason('');
            setReasonError(undefined);
            setCancelling(true);
          }}
        />
      ) : null}

      {isDisputed ? (
        <Button
          label="Settle dispute"
          icon={Gavel}
          loading={resolve.isPending}
          onPress={() => {
            setOutcome('refunded');
            setSettleReason('');
            setSettleReasonError(undefined);
            setResolving(true);
          }}
        />
      ) : null}

      <Sheet
        visible={resolving}
        onClose={() => setResolving(false)}
        title="Settle this dispute"
      >
        <View style={styles.sheet}>
          <ChipRow
            options={DISPUTE_OUTCOMES}
            value={outcome}
            onChange={setOutcome}
          />
          <Text style={styles.body}>{chosenOutcome?.explain}</Text>
          <TextField
            label="Reason"
            helper="The buyer and the seller read this on the order."
            value={settleReason}
            onChangeText={text => {
              setSettleReason(text);
              setSettleReasonError(undefined);
            }}
            error={settleReasonError}
            maxLength={MAX_REASON}
            multiline
          />
          <Button
            label={chosenOutcome?.label ?? 'Settle'}
            icon={Gavel}
            onPress={confirmResolve}
          />
          <Button
            label="Not now"
            variant="secondary"
            onPress={() => setResolving(false)}
          />
        </View>
      </Sheet>

      <Sheet
        visible={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel this order"
      >
        <View style={styles.sheet}>
          <TextField
            label="Reason"
            helper="The buyer and the seller read this on the order."
            value={reason}
            onChangeText={text => {
              setReason(text);
              setReasonError(undefined);
            }}
            error={reasonError}
            maxLength={MAX_REASON}
            multiline
          />
          <Button
            label="Cancel order"
            icon={Ban}
            variant="danger"
            onPress={confirmCancel}
          />
          <Button
            label="Keep the order"
            variant="secondary"
            onPress={() => setCancelling(false)}
          />
        </View>
      </Sheet>
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography, fontWeight }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    content: { padding: space[4], gap: space[3] },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    total: { ...typography.headline, color: colors.ink },
    sectionTitle: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink2,
      marginBottom: space[1],
    },
    spaced: { marginTop: space[3] },
    body: { ...typography.body, color: colors.ink },
    meta: { ...typography.caption, color: colors.ink2 },
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
    itemPrice: { ...typography.figure, color: colors.ink2 },
    historyLabel: {
      ...typography.caption,
      flex: 1,
      marginRight: space[2],
      color: colors.ink,
    },
    sheet: { gap: space[3] },
  });
}
