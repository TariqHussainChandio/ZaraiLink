import { CircleCheck } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, TextField, useToast } from '../../components';
import { useCheckout } from '../hooks/orders';
import { useAuthStore } from '../../../state/authStore';
import { useCartStore, type CartItem } from '../../../state/cartStore';
import { useTheme, type Theme } from '../../../theme';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';
import { errorMessage } from '../../../utils/errorMessage';
import { formatRs } from '../../../utils/money';

function groupBySeller(items: CartItem[]): Map<string, CartItem[]> {
  const groups = new Map<string, CartItem[]>();
  for (const item of items) {
    const group = groups.get(item.sellerId) ?? [];
    group.push(item);
    groups.set(item.sellerId, group);
  }
  return groups;
}

export function CheckoutScreen({ navigation }: MarketplaceScreenProps<'Checkout'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const { items, clear } = useCartStore();
  const checkout = useCheckout();
  const toast = useToast();
  const grouped = useMemo(() => groupBySeller(items), [items]);

  // BR-09: delivery is always a separate, explicit charge the buyer proposes per seller here
  // (Option A leaves it at 0 — product only; Option B is any non-zero amount) — never merged
  // into the product price. The seller can still reject/cancel from OrderDetailScreen if they
  // don't agree with the proposed amount; real-time negotiation before order creation is out
  // of scope for this module.
  const [deliveryCharges, setDeliveryCharges] = useState<Record<string, string>>({});

  const grandTotal = useMemo(() => {
    return Array.from(grouped.entries()).reduce((sum, [sellerId, sellerItems]) => {
      const subtotal = sellerItems.reduce((s, item) => s + item.price * item.quantity, 0);
      const delivery = Number(deliveryCharges[sellerId] ?? 0) || 0;
      return sum + subtotal + delivery;
    }, 0);
  }, [grouped, deliveryCharges]);

  const onConfirm = async () => {
    if (!userId) return;
    try {
      const deliveryChargeBySeller: Record<string, number> = {};
      for (const sellerId of grouped.keys()) {
        deliveryChargeBySeller[sellerId] = Number(deliveryCharges[sellerId] ?? 0) || 0;
      }
      const orders = await checkout.mutateAsync({ items, deliveryChargeBySeller });
      clear();
      toast.success(orders.length === 1 ? 'Order placed' : `${orders.length} orders placed`);
      navigation.popToTop();
    } catch (error) {
      // Nothing was placed and the cart is kept, so the person can press Place order again.
      toast.error(errorMessage(error));
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {Array.from(grouped.entries()).map(([sellerId, sellerItems]) => {
          const subtotal = sellerItems.reduce((s, item) => s + item.price * item.quantity, 0);
          const delivery = Number(deliveryCharges[sellerId] ?? 0) || 0;
          return (
            <Card key={sellerId} style={styles.sellerCard}>
              <Text style={styles.sellerTitle}>
                {`Order ${sellerItems.length} ${sellerItems.length === 1 ? 'item' : 'items'}`}
              </Text>
              {sellerItems.map(item => (
                <View key={item.listingId} style={styles.itemRow}>
                  <Text style={styles.itemLabel} numberOfLines={1}>
                    {`${item.quantity} × ${item.title}`}
                  </Text>
                  <Text style={styles.itemPrice}>
                    {formatRs(item.price * item.quantity)}
                  </Text>
                </View>
              ))}
              <TextField
                label="Delivery charge (optional)"
                keyboardType="numeric"
                placeholder="0"
                value={deliveryCharges[sellerId] ?? ''}
                onChangeText={text =>
                  setDeliveryCharges(current => ({ ...current, [sellerId]: text }))
                }
              />
              <View style={styles.sellerSummary}>
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabel}>Subtotal</Text>
                  <Text style={styles.itemPrice}>
                    {formatRs(subtotal)}
                  </Text>
                </View>
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabel}>Delivery</Text>
                  <Text style={styles.itemPrice}>
                    {formatRs(delivery)}
                  </Text>
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {formatRs(grandTotal)}
          </Text>
        </View>
        <Button label="Place Order" icon={CircleCheck} loading={checkout.isPending} onPress={onConfirm} />
      </View>
    </View>
  );
}

function makeStyles({ colors, space, typography, fontWeight, borders }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
    sellerCard: {
      marginBottom: space[3],
    },
    sellerTitle: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink2,
      marginBottom: space[2],
    },
    sellerSummary: {
      marginTop: space[2],
      paddingTop: space[2],
      borderTopWidth: borders.hairline,
      borderTopColor: colors.line,
    },
    itemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: space[1],
    },
    itemLabel: {
      ...typography.body,
      flex: 1,
      marginRight: space[2],
      color: colors.ink,
    },
    itemPrice: {
      ...typography.figure,
      color: colors.ink2,
    },
    footer: {
      padding: space[4],
      borderTopWidth: borders.hairline,
      borderTopColor: colors.line,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: space[3],
    },
    totalLabel: {
      ...typography.body,
      color: colors.ink2,
    },
    totalValue: {
      ...typography.title,
      color: colors.ink,
    },
  });
}
