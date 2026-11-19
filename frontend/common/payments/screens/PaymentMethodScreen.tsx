import { ArrowRight } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, ScreenState, SkeletonList, useToast } from '../../components';
import { ORDERS_ROUTES } from '../../constants/routes';
import { useOrderPaymentContext } from '../../orders';
import { useInitiatePayment } from '../hooks/payments';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import type { PaymentMethod } from '../types/payments';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';
import { errorMessage } from '../../../utils/errorMessage';
import { PAYMENT_METHOD_LABELS } from '../../constants/labels';
import { formatRs } from '../../../utils/money';

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
  const contextQuery = useOrderPaymentContext(orderId);
  const context = contextQuery.data;
  const initiate = useInitiatePayment();
  const toast = useToast();
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
      toast.error(errorMessage(error));
    }
  };

  // ScreenState shows the skeleton while the order loads and an error Banner with Retry if it fails, so this screen
  // never spins forever. With a payment already on record the effect above is replacing the screen; the skeleton holds.
  const skeleton = <SkeletonList count={2} />;
  return (
    <View style={styles.container}>
      <ScreenState query={contextQuery} skeleton={skeleton} errorTitle="Couldn't load this order">
        {loaded =>
          loaded.existingPayment ? (
            skeleton
          ) : (
            <>
              <Text style={styles.total}>{formatRs(loaded.orderTotal)}</Text>
              <Text style={styles.subtitle}>{"Choose how you'll pay for this order"}</Text>

              {METHOD_IDS.map(id => (
                <Card key={id} style={styles.option} selected={method === id} onPress={() => setMethod(id)}>
                  <Text style={styles.optionLabel}>{PAYMENT_METHOD_LABELS[id]}</Text>
                  <Text style={styles.optionDescription}>{METHOD_DESCRIPTIONS[id]}</Text>
                </Card>
              ))}

              <Button
                label="Continue"
                icon={ArrowRight}
                loading={initiate.isPending}
                onPress={onSubmit}
                style={styles.submit}
              />
            </>
          )
        }
      </ScreenState>
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      padding: space[4],
    },
    total: {
      ...typography.headline,
      color: colors.ink,
    },
    subtitle: {
      marginTop: space[1],
      marginBottom: space[4],
      ...typography.caption,
      color: colors.ink2,
    },
    // The Card draws the chosen method in the role's accent (selected) and reports it to TalkBack.
    option: {
      marginBottom: space[3],
    },
    optionLabel: {
      ...typography.bodyStrong,
      color: colors.ink,
    },
    optionDescription: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
    submit: {
      marginTop: space[3],
    },
  });
}
