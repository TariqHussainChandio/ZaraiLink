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

const RESULT_COPY: Record<Payment['status'], { title: string; description: string }> = {
  successful: { title: 'Payment Confirmed', description: 'The seller has confirmed they received your payment.' },
  failed: { title: 'Payment Failed', description: 'This payment could not be completed.' },
  cancelled: { title: 'Payment Cancelled', description: 'This payment was cancelled.' },
  refunded: { title: 'Payment Refunded', description: 'This payment has been refunded.' },
  pending: { title: 'Payment Pending', description: 'Still waiting for confirmation.' },
  processing: { title: 'Payment Processing', description: 'Still waiting for confirmation.' },
};

export function PaymentResultScreen({ route, navigation }: OrdersScreenProps<'PaymentResult'>) {
  const { paymentId } = route.params;
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchPaymentById(paymentId).then(data => {
        setPayment(data);
        setLoading(false);
      }).catch(err => {
        console.warn('[PaymentResultScreen] failed to load payment:', err);
        setLoading(false);
      });
    }, [paymentId]),
  );

  if (loading || !payment) return <Spinner fullscreen />;

  const copy = RESULT_COPY[payment.status];

  return (
    <View style={styles.container}>
      <PaymentStatusBadge status={payment.status} />
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.description}>{copy.description}</Text>
      <Text style={styles.amount}>Rs. {payment.amount.toFixed(0)}</Text>
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
  title: {
    marginTop: spacing.lg,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold as any,
    color: colors.neutral.gray900,
  },
  description: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray500,
    textAlign: 'center',
  },
  amount: {
    marginTop: spacing.lg,
    fontSize: typography.sizes['2xl'],
    fontWeight: typography.weights.bold as any,
    color: colors.neutral.gray900,
  },
  action: {
    marginTop: spacing.xl,
    alignSelf: 'stretch',
  },
});
