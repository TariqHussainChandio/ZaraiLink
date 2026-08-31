import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, Card, Spinner } from '../../components/ui';
import { ORDERS_ROUTES } from '../../constants/routes';
import { fetchOrderById } from '../../services/modules/orders/ordersService';
import { fetchPaymentByOrderId, initiatePayment } from '../../services/modules/payments/paymentsService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { PaymentMethod } from '../../types/payments';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';

const METHODS: { id: PaymentMethod; label: string; description: string }[] = [
  { id: 'cod', label: 'Cash on Delivery', description: 'Pay in cash when your order arrives.' },
  { id: 'bank_transfer', label: 'Bank Transfer', description: 'Transfer the amount and the seller will confirm receipt.' },
];

export function PaymentMethodScreen({ route, navigation }: OrdersScreenProps<'PaymentMethod'>) {
  const theme = useTheme();
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
      Alert.alert('Could not start payment', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || orderTotal === null) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <Text style={styles.total}>Rs. {orderTotal.toFixed(0)}</Text>
      <Text style={styles.subtitle}>Choose how you'll pay for this order</Text>

      {METHODS.map(option => (
        <TouchableOpacity key={option.id} onPress={() => setMethod(option.id)}>
          <Card style={[styles.option, method === option.id && styles.optionSelected]}>
            <Text style={styles.optionLabel}>{option.label}</Text>
            <Text style={styles.optionDescription}>{option.description}</Text>
          </Card>
        </TouchableOpacity>
      ))}

      <Button label="Continue" loading={submitting} onPress={onSubmit} style={styles.submit} />
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
