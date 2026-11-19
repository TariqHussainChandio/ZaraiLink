import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, ScreenState, SkeletonList, StatusBadge } from '../../components';
import { ORDERS_ROUTES } from '../../constants/routes';
import { usePayment } from '../hooks/payments';
import { useTheme, type Theme } from '../../../theme';
import type { Payment, PaymentMethod } from '../types/payments';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';
import { PAYMENT_METHOD_LABELS } from '../../constants/labels';
import { formatRs } from '../../../utils/money';

// A payment row stores the method as text; one this build does not know is shown as stored.
function isPaymentMethod(method: string): method is PaymentMethod {
  return method in PAYMENT_METHOD_LABELS;
}

const TERMINAL_STATUSES: Payment['status'][] = ['successful', 'failed', 'cancelled', 'refunded'];

export function PaymentProcessingScreen({ route, navigation }: OrdersScreenProps<'PaymentProcessing'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { paymentId } = route.params;
  const paymentQuery = usePayment(paymentId);
  const { data: payment, refetch } = paymentQuery;

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

  // A skeleton while loading and an error Banner with Retry on failure, never a spinner that cannot end.
  if (!payment) {
    return (
      <View style={styles.stateContainer}>
        <ScreenState
          query={paymentQuery}
          skeleton={<SkeletonList count={2} />}
          empty={{ title: 'Payment not found' }}
          errorTitle="Couldn't load this payment"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBadge kind="payment" status={payment.status} />
      <Text style={styles.amount}>
        {formatRs(payment.amount)}
      </Text>
      <Text style={styles.method}>
        {isPaymentMethod(payment.method) ? PAYMENT_METHOD_LABELS[payment.method] : payment.method}
      </Text>
      <Text style={styles.waiting}>{"Waiting for the seller to confirm payment receipt. You'll be able to track this from your order at any time."}</Text>
      <Button
        label="Check Status"
        icon={RefreshCw}
        loading={paymentQuery.isFetching}
        onPress={() => refetch()}
        variant="secondary"
        style={styles.action}
      />
      <Button
        label="Back to Order"
        icon={ArrowLeft}
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

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    // The loading and error states fill the width; the centred column below would shrink them.
    stateContainer: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      padding: space[4],
      alignItems: 'center',
    },
    amount: {
      marginTop: space[4],
      ...typography.headline,
      color: colors.ink,
    },
    method: {
      marginTop: space[1],
      ...typography.caption,
      color: colors.ink2,
    },
    waiting: {
      marginTop: space[4],
      ...typography.caption,
      color: colors.ink2,
      textAlign: 'center',
    },
    action: {
      marginTop: space[3],
      alignSelf: 'stretch',
    },
  });
}
