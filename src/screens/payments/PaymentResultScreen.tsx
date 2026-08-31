import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, Spinner } from '../../components/ui';
import { PaymentStatusBadge } from '../../components/features/payments/PaymentStatusBadge';
import { ORDERS_ROUTES } from '../../constants/routes';
import { fetchPaymentById } from '../../services/modules/payments/paymentsService';
import { useTheme, type Theme } from '../../theme';
import type { Payment } from '../../types/payments';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';

const RESULT_COPY: Record<Payment['status'], { title: string; description: string }> = {
  successful: { title: 'Payment Confirmed', description: 'The seller has confirmed they received your payment.' },
  failed: { title: 'Payment Failed', description: 'This payment could not be completed.' },
  cancelled: { title: 'Payment Cancelled', description: 'This payment was cancelled.' },
  refunded: { title: 'Payment Refunded', description: 'This payment has been refunded.' },
  pending: { title: 'Payment Pending', description: 'Still waiting for confirmation.' },
  processing: { title: 'Payment Processing', description: 'Still waiting for confirmation.' },
};

export function PaymentResultScreen({ route, navigation }: OrdersScreenProps<'PaymentResult'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { paymentId } = route.params;
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetchPaymentById(paymentId).then(data => {
      setPayment(data);
      setLoading(false);
    }).catch(err => {
      console.warn('[PaymentResultScreen] failed to load payment:', err);
      setError(true);
      setLoading(false);
    });
  }, [paymentId]);

  useFocusEffect(useCallback(() => load(), [load]));

  if (loading) return <Spinner fullscreen />;
  if (error || !payment) {
    return (
      <EmptyState
        title="Couldn't load payment result"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

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

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
      padding: spacing.lg,
      alignItems: 'center',
    },
    title: {
      marginTop: spacing.lg,
      fontSize: typography.sizes.xl,
      fontWeight: typography.weights.bold as any,
      color: colors.text.primary,
    },
    description: {
      marginTop: spacing.xs,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    amount: {
      marginTop: spacing.lg,
      fontSize: typography.sizes['2xl'],
      fontWeight: typography.weights.bold as any,
      color: colors.text.primary,
    },
    action: {
      marginTop: spacing.xl,
      alignSelf: 'stretch',
    },
  });
}
