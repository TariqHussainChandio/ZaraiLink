import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, Card, Spinner } from '../../components/ui';
import { ORDERS_ROUTES } from '../../constants/routes';
import { fetchOrderById } from '../../services/modules/orders/ordersService';
import { fetchPaymentByOrderId, initiatePayment } from '../../services/modules/payments/paymentsService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { PaymentMethod } from '../../types/payments';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';

// Labels/descriptions for each payment method live under payments.paymentMethod.methods.<id> in
// the translation resources, keyed by the same PaymentMethod ids used throughout the app.
const METHOD_IDS: PaymentMethod[] = ['cod', 'bank_transfer'];

export function PaymentMethodScreen({ route, navigation }: OrdersScreenProps<'PaymentMethod'>) {
  const theme = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { orderId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('cod');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [order, existingPayment] = await Promise.all([
        fetchOrderById(orderId),
        fetchPaymentByOrderId(orderId),
      ]);
      setOrderTotal(order.total);

      // Already has a payment on record — don't let the buyer create a second one, just show
      // the existing one's status instead.
      if (existingPayment) {
        navigation.replace(ORDERS_ROUTES.PaymentProcessing, { paymentId: existingPayment.id });
        return;
      }
      setLoading(false);
    })();
  }, [orderId, navigation]);

  const onSubmit = async () => {
    if (!userId || orderTotal === null) return;
    setSubmitting(true);
    try {
      const payment = await initiatePayment(orderId, method);
      navigation.replace(ORDERS_ROUTES.PaymentProcessing, { paymentId: payment.id });
    } catch (error) {
      Alert.alert(
        t('payments.paymentMethod.couldNotStartPaymentTitle'),
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || orderTotal === null) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <Text style={styles.total}>{t('payments.paymentMethod.amountLine', { amount: orderTotal.toFixed(0) })}</Text>
      <Text style={styles.subtitle}>{t('payments.paymentMethod.subtitle')}</Text>

      {METHOD_IDS.map(id => (
        <TouchableOpacity key={id} onPress={() => setMethod(id)}>
          <Card style={[styles.option, method === id && styles.optionSelected]}>
            <Text style={styles.optionLabel}>{t(`payments.paymentMethod.methods.${id}.label`)}</Text>
            <Text style={styles.optionDescription}>{t(`payments.paymentMethod.methods.${id}.description`)}</Text>
          </Card>
        </TouchableOpacity>
      ))}

      <Button label={t('payments.paymentMethod.continueLabel')} loading={submitting} onPress={onSubmit} style={styles.submit} />
    </View>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
      padding: spacing.lg,
    },
    total: {
      fontSize: typography.sizes['2xl'],
      fontWeight: typography.weights.bold as any,
      color: colors.text.primary,
    },
    subtitle: {
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    option: {
      marginBottom: spacing.md,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    optionSelected: {
      borderColor: colors.brand.primary,
    },
    optionLabel: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
    },
    optionDescription: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    submit: {
      marginTop: spacing.md,
    },
  });
}
