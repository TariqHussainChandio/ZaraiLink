import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Spinner } from '../../components';
import { PaymentStatusBadge } from '../components/PaymentStatusBadge';
import { ORDERS_ROUTES } from '../../constants/routes';
import { usePayment } from '../hooks/payments';
import { useTheme, type Theme } from '../../../theme';
import type { Payment, PaymentMethod } from '../types/payments';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';
import { PAYMENT_METHOD_LABELS } from '../../constants/labels';

// A payment row stores the method as text; one this build does not know is shown as stored.
function isPaymentMethod(method: string): method is PaymentMethod {
  return method in PAYMENT_METHOD_LABELS;
}

const TERMINAL_STATUSES: Payment['status'][] = ['successful', 'failed', 'cancelled', 'refunded'];

export function PaymentProcessingScreen({ route, navigation }: OrdersScreenProps<'PaymentProcessing'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { paymentId } = route.params;
  const { data: payment, refetch } = usePayment(paymentId);

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

  if (!payment) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <PaymentStatusBadge status={payment.status} />
      <Text style={styles.amount}>
        {`Rs. ${payment.amount.toFixed(0)}`}
      </Text>
      <Text style={styles.method}>
        {isPaymentMethod(payment.method) ? PAYMENT_METHOD_LABELS[payment.method] : payment.method}
      </Text>
      <Text style={styles.waiting}>{"Waiting for the seller to confirm payment receipt. You'll be able to track this from your order at any time."}</Text>
      <Button label="Check Status" onPress={() => refetch()} variant="secondary" style={styles.action} />
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
    amount: {
      marginTop: spacing.lg,
      fontSize: typography.sizes['2xl'],
      fontWeight: typography.weights.bold,
      color: colors.text.primary,
    },
    method: {
      marginTop: spacing.xs,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    waiting: {
      marginTop: spacing.lg,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    action: {
      marginTop: spacing.md,
      alignSelf: 'stretch',
    },
  });
}
