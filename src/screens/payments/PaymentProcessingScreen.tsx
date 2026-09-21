import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Spinner } from '../../components/ui';
import { PaymentStatusBadge } from '../../components/features/payments/PaymentStatusBadge';
import { ORDERS_ROUTES } from '../../constants/routes';
import { fetchPaymentById } from '../../services/modules/payments/paymentsService';
import { useTheme, type Theme } from '../../theme';
import type { Payment } from '../../types/payments';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';

const TERMINAL_STATUSES: Payment['status'][] = ['successful', 'failed', 'cancelled', 'refunded'];

// Method display labels live under payments.paymentProcessing.methodLabels.<method> in the
// translation resources; falls back to the raw method value for one that isn't recognized.
const KNOWN_METHODS = ['cod', 'bank_transfer'];

export function PaymentProcessingScreen({ route, navigation }: OrdersScreenProps<'PaymentProcessing'>) {
  const theme = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
      <Text style={styles.amount}>
        {t('payments.paymentProcessing.amountLine', { amount: payment.amount.toFixed(0) })}
      </Text>
      <Text style={styles.method}>
        {KNOWN_METHODS.includes(payment.method)
          ? t(`payments.paymentProcessing.methodLabels.${payment.method}`)
          : payment.method}
      </Text>
      <Text style={styles.waiting}>{t('payments.paymentProcessing.waitingMessage')}</Text>
      <Button label={t('payments.paymentProcessing.checkStatusLabel')} onPress={load} variant="secondary" style={styles.action} />
      <Button
        label={t('payments.paymentProcessing.backToOrderLabel')}
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
      fontWeight: typography.weights.bold as any,
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
