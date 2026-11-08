import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, PriceBreakdown, QueryState, ScreenScaffold, StickyActionBar } from '../../components';
import { ORDERS_ROUTES } from '../../constants/routes';
import { useOrderPaymentContext } from '../../orders';
import { PaymentMethodOptions } from '../components/PaymentMethodOptions';
import { useInitiatePayment } from '../hooks/payments';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import type { PaymentMethod } from '../types/payments';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';
import { errorMessage } from '../../../utils/errorMessage';

/** Choose how to pay for an order that has no payment yet (checkout normally starts it; this is for an order whose payment
 * could not be started then). Shows the products and delivery lines (BR-09) and says who is paid (BR-11). */
export function PaymentMethodScreen({ route, navigation }: OrdersScreenProps<'PaymentMethod'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { orderId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const [method, setMethod] = useState<PaymentMethod>('cod');
  const [failure, setFailure] = useState<string | null>(null);
  const query = useOrderPaymentContext(orderId);
  const initiate = useInitiatePayment();
  const context = query.data;
  const existingPayment = context?.existingPayment;

  useEffect(() => {
    // Already has a payment on record: do not let the buyer create a second one, show the existing one's status instead.
    if (existingPayment) navigation.replace(ORDERS_ROUTES.PaymentProcessing, { paymentId: existingPayment.id });
  }, [existingPayment, navigation]);

  const onSubmit = async () => {
    if (!userId || !context) return;
    setFailure(null);
    try {
      const payment = await initiate.mutateAsync({ orderId, method });
      navigation.replace(ORDERS_ROUTES.PaymentProcessing, { paymentId: payment.id });
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  const seller = context?.sellerName ?? 'the seller';
  return (
    <ScreenScaffold
      footer={
        context && !existingPayment ? (
          <StickyActionBar>
            <Button label="Confirm cash on delivery" size="lg" loading={initiate.isPending} onPress={onSubmit} />
          </StickyActionBar>
        ) : undefined
      }
    >
      <QueryState query={query} failureTitle="Couldn't load this order">
        {context && !existingPayment ? (
          <>
            {failure ? (
              <Banner tone="danger" title="Couldn't start the payment">
                {failure}
              </Banner>
            ) : null}
            <Card style={styles.card}>
              <Text style={styles.heading} accessibilityRole="header">
                Pay for this order
              </Text>
              <PriceBreakdown
                subtotal={context.productSubtotal}
                delivery={context.deliveryCharge}
                total={context.orderTotal}
                payTo={`You pay ${seller} directly. ZaraiLink does not hold your money.`}
              />
            </Card>
            <View>
              <PaymentMethodOptions value={method} onChange={setMethod} sellerName={context.sellerName ?? undefined} />
            </View>
          </>
        ) : null}
      </QueryState>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    card: { gap: space[3] },
    heading: { ...typography.title, color: colors.ink },
  });
}
