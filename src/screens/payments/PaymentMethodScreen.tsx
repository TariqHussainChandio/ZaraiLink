import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, Card, Spinner } from '../../components/ui';
import { ORDERS_ROUTES } from '../../constants/routes';
import { useOrderPaymentContext } from '../../hooks/api/orders';
import { useInitiatePayment } from '../../hooks/api/payments';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { PaymentMethod } from '../../types/payments';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';
import { errorMessage } from '../../utils/errorMessage';
import { PAYMENT_METHOD_LABELS } from '../../constants/labels';

const METHOD_IDS: PaymentMethod[] = ['cod', 'bank_transfer'];
const METHOD_DESCRIPTIONS: Record<PaymentMethod, string> = {
  cod: 'Pay in cash when your order arrives.',
  bank_transfer: 'Transfer the amount and the seller will confirm receipt.',
};

export function PaymentMethodScreen({ route, navigation }: OrdersScreenProps<'PaymentMethod'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { orderId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const [method, setMethod] = useState<PaymentMethod>('cod');
  const { data: context } = useOrderPaymentContext(orderId);
  const initiate = useInitiatePayment();
  const orderTotal = context?.orderTotal ?? null;
  const existingPayment = context?.existingPayment;

  useEffect(() => {
    // Already has a payment on record — don't let the buyer create a second one, just show
    // the existing one's status instead.
    if (existingPayment) navigation.replace(ORDERS_ROUTES.PaymentProcessing, { paymentId: existingPayment.id });
  }, [existingPayment, navigation]);

  const onSubmit = async () => {
    if (!userId || orderTotal === null) return;
    try {
      const payment = await initiate.mutateAsync({ orderId, method });
      navigation.replace(ORDERS_ROUTES.PaymentProcessing, { paymentId: payment.id });
    } catch (error) {
      Alert.alert('Could not start payment', errorMessage(error));
    }
  };

  if (orderTotal === null || existingPayment) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <Text style={styles.total}>{`Rs. ${orderTotal.toFixed(0)}`}</Text>
      <Text style={styles.subtitle}>{"Choose how you'll pay for this order"}</Text>

      {METHOD_IDS.map(id => (
        <TouchableOpacity key={id} onPress={() => setMethod(id)}>
          <Card style={[styles.option, method === id && styles.optionSelected]}>
            <Text style={styles.optionLabel}>{PAYMENT_METHOD_LABELS[id]}</Text>
            <Text style={styles.optionDescription}>{METHOD_DESCRIPTIONS[id]}</Text>
          </Card>
        </TouchableOpacity>
      ))}

      <Button label="Continue" loading={initiate.isPending} onPress={onSubmit} style={styles.submit} />
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
      fontWeight: typography.weights.bold,
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
      fontWeight: typography.weights.semibold,
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
