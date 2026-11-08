import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, PriceBreakdown, QueryState, ScreenScaffold, StatusBadge } from '../../components';
import { ORDERS_ROUTES } from '../../constants/routes';
import { useOrderPaymentContext } from '../../orders';
import { usePayment } from '../hooks/payments';
import { paymentMethodName } from '../methods';
import { useTheme, type Theme } from '../../../theme';
import type { Payment } from '../types/payments';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';
import { formatRs } from '../../../utils/money';

const TERMINAL_STATUSES: Payment['status'][] = ['successful', 'failed', 'cancelled', 'refunded'];

/** What happens next, in words, for the method that was chosen. Cash is handed over on delivery and the seller records
 * it then; nothing here waits on money in a ZaraiLink account, because there is none (BR-11). */
function nextStep(method: string): string {
  return method === 'cod'
    ? 'Pay the seller in cash when you receive the goods. The seller marks it paid then, and this screen updates.'
    : 'The seller confirms once they have received your transfer, and this screen updates.';
}

/** Where a started payment waits for the seller to record it. A failed load shows a Banner with "Try again" instead of
 * spinning forever, and "Back to order" is always on screen (this screen has no Back arrow). */
export function PaymentProcessingScreen({ route, navigation }: OrdersScreenProps<'PaymentProcessing'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { paymentId } = route.params;
  const query = usePayment(paymentId);
  const payment = query.data;
  const order = useOrderPaymentContext(payment?.order_id ?? '');
  const { refetch } = query;

  // The seller decides a payment, so leaving the waiting screen is driven by the status the server reports.
  useEffect(() => {
    if (payment && TERMINAL_STATUSES.includes(payment.status)) {
      navigation.replace(ORDERS_ROUTES.PaymentResult, { paymentId });
    }
  }, [payment, paymentId, navigation]);

  // Coming back to this screen re-checks the status.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const backToOrder = () => {
    if (!payment) return;
    navigation.reset({
      index: 1,
      routes: [{ name: ORDERS_ROUTES.OrderHistory }, { name: ORDERS_ROUTES.OrderDetail, params: { orderId: payment.order_id } }],
    });
  };

  return (
    <ScreenScaffold>
      <QueryState query={query} failureTitle="Couldn't load this payment">
        {payment ? (
          <>
            <Card style={styles.card}>
              <View style={styles.head}>
                <Text style={styles.method}>{paymentMethodName(payment.method)}</Text>
                <StatusBadge kind="payment" status={payment.status} />
              </View>
              {order.data ? (
                <PriceBreakdown
                  subtotal={order.data.productSubtotal}
                  delivery={order.data.deliveryCharge}
                  total={payment.amount}
                  payTo={order.data.sellerName ? `You pay ${order.data.sellerName} directly. ZaraiLink does not hold your money.` : undefined}
                />
              ) : (
                <Text style={styles.amount}>{formatRs(payment.amount)}</Text>
              )}
            </Card>
            <Text style={styles.next}>{nextStep(payment.method)}</Text>
            <Button label="Back to order" onPress={backToOrder} />
            <Button label="Check again" variant="secondary" loading={query.isFetching} onPress={() => refetch()} />
          </>
        ) : null}
      </QueryState>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    card: { gap: space[3] },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3] },
    method: { ...typography.title, color: colors.ink },
    amount: { ...typography.figureLg, color: colors.ink },
    next: { ...typography.body, color: colors.ink },
  });
}
