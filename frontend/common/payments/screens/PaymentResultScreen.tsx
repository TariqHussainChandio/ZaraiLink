import { ArrowLeft } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, ScreenState, SkeletonList, StatusBadge } from '../../components';
import { ORDERS_ROUTES } from '../../constants/routes';
import { usePayment } from '../hooks/payments';
import { useTheme, type Theme } from '../../../theme';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';
import type { PaymentStatus } from '../types/payments';
import { formatRs } from '../../../utils/money';
import { statusMeta } from '../../constants/status';

const RESULT_COPY: Record<PaymentStatus, { title: string; description: string }> = {
  successful: { title: 'Payment Confirmed', description: 'The seller has confirmed they received your payment.' },
  failed: { title: 'Payment Failed', description: 'This payment could not be completed.' },
  cancelled: { title: 'Payment Cancelled', description: 'This payment was cancelled.' },
  // BR-11: the seller paid the money back directly; ZaraiLink never held it, so it never refunds anything itself.
  refunded: { title: 'Payment Returned', description: 'The seller returned this payment to you directly.' },
  pending: { title: 'Payment Pending', description: 'Still waiting for confirmation.' },
  processing: { title: 'Payment Processing', description: 'Still waiting for confirmation.' },
};

export function PaymentResultScreen({ route, navigation }: OrdersScreenProps<'PaymentResult'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { paymentId } = route.params;
  const paymentQuery = usePayment(paymentId);
  const { data: payment } = paymentQuery;

  if (!payment) {
    return (
      <View style={styles.stateContainer}>
        <ScreenState
          query={paymentQuery}
          skeleton={<SkeletonList count={2} />}
          empty={{ title: 'Payment not found' }}
          errorTitle="Couldn't load payment result"
        />
      </View>
    );
  }

  // A status this build does not know yet reads as its own word instead of crashing (statusMeta).
  const copy = Object.prototype.hasOwnProperty.call(RESULT_COPY, payment.status)
    ? RESULT_COPY[payment.status]
    : { title: statusMeta('payment', payment.status).label, description: 'This payment has been updated.' };

  return (
    <View style={styles.container}>
      <StatusBadge kind="payment" status={payment.status} />
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.description}>{copy.description}</Text>
      <Text style={styles.amount}>
        {formatRs(payment.amount)}
      </Text>
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
    title: {
      marginTop: space[4],
      ...typography.titleLg,
      color: colors.ink,
    },
    description: {
      marginTop: space[1],
      ...typography.caption,
      color: colors.ink2,
      textAlign: 'center',
    },
    amount: {
      marginTop: space[4],
      ...typography.headline,
      color: colors.ink,
    },
    action: {
      marginTop: space[6],
      alignSelf: 'stretch',
    },
  });
}
