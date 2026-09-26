import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, Spinner } from '../../components/ui';
import { PaymentStatusBadge } from '../../components/features/payments/PaymentStatusBadge';
import { ORDERS_ROUTES } from '../../constants/routes';
import { usePayment } from '../../hooks/api/payments';
import { useTheme, type Theme } from '../../theme';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';
import type { PaymentStatus } from '../../types/payments';

const RESULT_COPY: Record<PaymentStatus, { title: string; description: string }> = {
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
  const { data: payment, isPending, error, refetch } = usePayment(paymentId);

  if (isPending) return <Spinner fullscreen />;
  if (error || !payment) {
    return (
      <EmptyState
        title="Couldn't load payment result"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    );
  }

  return (
    <View style={styles.container}>
      <PaymentStatusBadge status={payment.status} />
      <Text style={styles.title}>{RESULT_COPY[payment.status].title}</Text>
      <Text style={styles.description}>
        {RESULT_COPY[payment.status].description}
      </Text>
      <Text style={styles.amount}>
        {`Rs. ${payment.amount.toFixed(0)}`}
      </Text>
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
      fontWeight: typography.weights.bold,
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
      fontWeight: typography.weights.bold,
      color: colors.text.primary,
    },
    action: {
      marginTop: spacing.xl,
      alignSelf: 'stretch',
    },
  });
}
