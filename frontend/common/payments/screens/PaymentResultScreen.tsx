import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, Card, PriceBreakdown, QueryState, ScreenScaffold, StatusBadge } from '../../components';
import { ORDERS_ROUTES } from '../../constants/routes';
import { useOrderPaymentContext } from '../../orders';
import { usePayment } from '../hooks/payments';
import { useTheme, type Theme } from '../../../theme';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';
import type { PaymentStatus } from '../types/payments';
import { formatRs } from '../../../utils/money';
import { statusMeta } from '../../constants/status';

// Each outcome says what it means and what to do next. ZaraiLink never holds the money (BR-11), so a refund is the seller
// returning it, not the platform.
const RESULT_COPY: Record<PaymentStatus, { title: string; description: string }> = {
  successful: { title: 'Payment confirmed', description: 'The seller confirmed they received your payment.' },
  failed: { title: 'Payment not received', description: 'The seller marked this payment as not received. Message the seller from the order to sort it out.' },
  cancelled: { title: 'Payment cancelled', description: 'This payment was cancelled with the order. Nothing is owed.' },
  refunded: { title: 'Payment refunded', description: 'The seller returned this money to you directly. ZaraiLink never held it.' },
  pending: { title: 'Waiting for the seller', description: 'The seller has not recorded this payment yet.' },
  processing: { title: 'Waiting for the seller', description: 'The seller has not recorded this payment yet.' },
};

export function PaymentResultScreen({ route, navigation }: OrdersScreenProps<'PaymentResult'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { paymentId } = route.params;
  const query = usePayment(paymentId);
  const payment = query.data;
  const order = useOrderPaymentContext(payment?.order_id ?? '');

  // A status this build does not know yet reads as its own word instead of crashing (statusMeta).
  const copy = !payment
    ? null
    : Object.prototype.hasOwnProperty.call(RESULT_COPY, payment.status)
      ? RESULT_COPY[payment.status]
      : { title: statusMeta('payment', payment.status).label, description: 'This payment has been updated.' };

  return (
    <ScreenScaffold>
      <QueryState query={query} failureTitle="Couldn't load the payment">
        {payment && copy ? (
          <>
            <Card style={styles.card}>
              <StatusBadge kind="payment" status={payment.status} />
              <Text style={styles.title} accessibilityRole="header">
                {copy.title}
              </Text>
              <Text style={styles.description}>{copy.description}</Text>
              {order.data ? (
                <PriceBreakdown subtotal={order.data.productSubtotal} delivery={order.data.deliveryCharge} total={payment.amount} />
              ) : (
                <Text style={styles.amount}>{formatRs(payment.amount)}</Text>
              )}
            </Card>
            <Button
              label="Back to order"
              onPress={() =>
                navigation.reset({
                  index: 1,
                  routes: [{ name: ORDERS_ROUTES.OrderHistory }, { name: ORDERS_ROUTES.OrderDetail, params: { orderId: payment.order_id } }],
                })
              }
            />
          </>
        ) : null}
      </QueryState>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    card: { gap: space[3] },
    title: { ...typography.titleLg, color: colors.ink },
    description: { ...typography.body, color: colors.ink },
    amount: { ...typography.figureLg, color: colors.ink },
  });
}
