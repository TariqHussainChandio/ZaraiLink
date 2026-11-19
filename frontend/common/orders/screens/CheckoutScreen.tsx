import { ShoppingCart } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ListGroup,
  ListRow,
  PriceBreakdown,
  RatePlate,
  ScreenScaffold,
  StatusBadge,
  StickyActionBar,
  TextField,
} from '../../components';
import { PAYMENT_METHOD_NAMES, PaymentMethodOptions, useInitiatePayment, type PaymentMethod } from '../../payments';
import { digitsOnly, parseWhole } from '../../marketplace';
import { APP_TABS, MARKETPLACE_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import { useCartListings, useCheckout } from '../hooks/orders';
import { currentPrice, groupBySeller, productsTotal, sellerLabel } from '../utils/cartGroups';
import type { Order } from '../types/orders';
import { useAuthStore } from '../../../state/authStore';
import { useCartStore } from '../../../state/cartStore';
import { navigateInTab } from '../../../navigation/navigateInTab';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../../theme';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';
import { errorMessage } from '../../../utils/errorMessage';
import { formatAmount, formatRs } from '../../../utils/money';

/** One placed order, with the seller's name from the cart (which is cleared once the order exists) and whether its
 * payment could be started. */
interface PlacedOrder {
  order: Order;
  sellerName: string;
  method: PaymentMethod;
  paid: boolean;
}

/** Checkout: one section per seller, each with its own delivery charge, price breakdown and way to pay, and one total on the
 * plate. Placing the order also starts each payment, so there is no separate "Pay now" step afterwards (MK-05). BR-09: the
 * delivery charge is its own line. BR-11: the buyer pays the seller directly; ZaraiLink holds nothing. */
export function CheckoutScreen({ navigation }: MarketplaceScreenProps<'Checkout'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const tabs = useAppTabNavigation();
  const { items, clear } = useCartStore();
  const checkout = useCheckout();
  const initiatePayment = useInitiatePayment();
  const listings = useCartListings(items.map(item => item.listingId));
  const groups = useMemo(() => groupBySeller(items), [items]);

  // BR-09: delivery is a separate, explicit charge the buyer enters per seller (empty means none: the buyer collects).
  // The seller can still reject or cancel the order if they do not agree with it.
  const [deliveryText, setDeliveryText] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<Record<string, PaymentMethod>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder[] | null>(null);

  const deliveryOf = (sellerId: string) => parseWhole(deliveryText[sellerId] ?? '') ?? 0;
  const grandTotal = groups.reduce((sum, group) => sum + productsTotal(group.items, listings) + deliveryOf(group.sellerId), 0);

  const onPlace = async () => {
    if (!userId) return;
    setFailure(null);
    try {
      const deliveryChargeBySeller: Record<string, number> = {};
      for (const group of groups) deliveryChargeBySeller[group.sellerId] = deliveryOf(group.sellerId);
      const names = new Map(groups.map(group => [group.sellerId, sellerLabel(group, listings).name]));
      const orders = await checkout.mutateAsync({ items, deliveryChargeBySeller });
      clear();
      // The payment is started for each order with the method chosen for that seller. If one fails the order still
      // exists; its row says so and the order screen offers "Choose how to pay".
      const results = await Promise.all(
        orders.map(async order => {
          const method = methods[order.seller_id] ?? 'cod';
          const paid = await initiatePayment
            .mutateAsync({ orderId: order.id, method })
            .then(() => true)
            .catch(() => false);
          return { order, sellerName: names.get(order.seller_id) ?? 'Seller', method, paid };
        }),
      );
      setPlaced(results);
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  if (placed) {
    const count = placed.length;
    return (
      <ScreenScaffold
        footer={
          <StickyActionBar>
            <Button label="Continue shopping" size="lg" onPress={() => navigation.popToTop()} />
          </StickyActionBar>
        }
      >
        <Banner tone="success" title={count === 1 ? 'Order placed' : `${count} orders placed`}>
          Each seller is told. Track them in Orders.
        </Banner>
        <ListGroup>
          {placed.map(({ order, sellerName, method, paid }) => (
            <ListRow
              key={order.id}
              title={sellerName}
              meta={paid ? `${formatRs(order.total)} · ${PAYMENT_METHOD_NAMES[method]}` : `${formatRs(order.total)} · Choose how to pay in the order`}
              status={<StatusBadge kind="order" status={order.status} />}
              onPress={() => navigateInTab(tabs, APP_TABS.Orders, ORDERS_ROUTES.OrderDetail, { orderId: order.id })}
            />
          ))}
        </ListGroup>
      </ScreenScaffold>
    );
  }

  if (items.length === 0) {
    return (
      <ScreenScaffold>
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Add something from the market to check out."
          actionLabel="Browse the market"
          onAction={() => navigation.navigate(MARKETPLACE_ROUTES.Browse)}
        />
      </ScreenScaffold>
    );
  }

  const busy = checkout.isPending || initiatePayment.isPending;
  return (
    <ScreenScaffold
      footer={
        <StickyActionBar leading={<RatePlate amount={grandTotal} unit="Total with delivery" size="md" />}>
          <Button
            label={groups.length === 1 ? 'Place order' : `Place ${groups.length} orders`}
            size="lg"
            loading={busy}
            onPress={onPlace}
          />
        </StickyActionBar>
      }
    >
      {failure ? (
        <Banner tone="danger" title="Couldn't place your order">
          {failure}
        </Banner>
      ) : null}
      {groups.map(group => {
        const seller = sellerLabel(group, listings);
        const subtotal = productsTotal(group.items, listings);
        const method = methods[group.sellerId] ?? 'cod';
        return (
          <Card key={group.sellerId} style={styles.seller}>
            <Text style={styles.sellerName} accessibilityRole="header">
              {seller.city ? `${seller.name} · ${seller.city}` : seller.name}
            </Text>
            <View style={styles.lines}>
              {group.items.map(item => (
                <View key={item.listingId} style={styles.line} accessible accessibilityLabel={`${item.quantity} ${item.unit} ${item.title}, ${formatRs(currentPrice(item, listings) * item.quantity)}`}>
                  <Text style={styles.lineLabel}>{`${formatAmount(item.quantity)} ${item.unit} × ${item.title}`}</Text>
                  <Text style={styles.lineAmount}>{formatRs(currentPrice(item, listings) * item.quantity)}</Text>
                </View>
              ))}
            </View>
            <TextField
              label="Delivery charge"
              optional
              prefix="Rs"
              numeric
              keyboardType="number-pad"
              placeholder="0"
              helper={`What you agreed with ${seller.name}. Leave empty if you collect.`}
              value={deliveryText[group.sellerId] ?? ''}
              // Digits only, so a pasted "1,500" is 1500 and never 0 (MK-04).
              onChangeText={text => setDeliveryText(current => ({ ...current, [group.sellerId]: digitsOnly(text) }))}
            />
            <PriceBreakdown
              subtotal={subtotal}
              delivery={deliveryOf(group.sellerId)}
              payTo={`You pay ${seller.name} directly. ZaraiLink does not hold your money.`}
            />
            <PaymentMethodOptions
              value={method}
              onChange={next => setMethods(current => ({ ...current, [group.sellerId]: next }))}
              sellerName={seller.name}
              label={`How will you pay ${seller.name}?`}
            />
          </Card>
        );
      })}
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    seller: { gap: space[4] },
    sellerName: { ...typography.title, color: colors.ink },
    lines: { gap: space[2] },
    line: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
    lineLabel: { ...typography.body, flex: 1, color: colors.ink },
    lineAmount: { ...typography.figure, color: colors.ink },
  });
}
