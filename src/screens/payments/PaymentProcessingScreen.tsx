import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Spinner } from '../../components/ui';
import { PaymentStatusBadge } from '../../components/features/payments/PaymentStatusBadge';
import { ORDERS_ROUTES } from '../../constants/routes';
import { fetchPaymentById } from '../../services/modules/payments/paymentsService';
import { lightTheme } from '../../theme';
import type { Payment } from '../../types/payments';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';

const { colors, spacing, typography } = lightTheme;

const TERMINAL_STATUSES: Payment['status'][] = ['successful', 'failed', 'cancelled', 'refunded'];

const METHOD_LABEL: Record<string, string> = {
  cod: 'Cash on Delivery',
  bank_transfer: 'Bank Transfer',
};

export function PaymentProcessingScreen({ route, navigation }: OrdersScreenProps<'PaymentProcessing'>) {
  const { paymentId } = route.params;
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await fetchPaymentById(paymentId);
    setPayment(data);
    setLoading(false);
    if (TERMINAL_STATUSES.includes(data.status)) {
      navigation.replace(ORDERS_ROUTES.PaymentResult, { paymentId });
    }
  }, [paymentId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading || !payment) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <PaymentStatusBadge status={payment.status} />
      <Text style={styles.amount}>Rs. {payment.amount.toFixed(0)}</Text>
      <Text style={styles.method}>{METHOD_LABEL[payment.method] ?? payment.method}</Text>
      <Text style={styles.waiting}>
        Waiting for the seller to confirm payment receipt. You'll be able to track this from your
        order at any time.
      </Text>
      <Button label="Check Status" onPress={load} variant="secondary" style={styles.action} />
      <Button
        label="Back to Order"
        onPress={() =>
          navigation.reset({
            index: 1,
            routes: [
              { name: ORDERS_ROUTES.OrderHistory },
              { name: ORDERS_ROUTES.OrderDetail, params: { orderId: payment.order_id } },
            ],
          })
        }
        style={styles.action}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
    padding: spacing.lg,
    alignItems: 'center',
  },
  amount: {
    marginTop: spacing.lg,
    fontSize: typography.sizes['2xl'],
    fontWeight: typography.weights.bold as any,
    color: colors.neutral.gray900,
  },
  method: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray600,
  },
  waiting: {
    marginTop: spacing.lg,
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray500,
    textAlign: 'center',
  },
  action: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
});
