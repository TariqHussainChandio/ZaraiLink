import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Input } from '../../components';
import { useCheckout } from '../hooks/orders';
import { useAuthStore } from '../../../state/authStore';
import { useCartStore, type CartItem } from '../../../state/cartStore';
import { useTheme, type Theme } from '../../../theme';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';
import { errorMessage } from '../../../utils/errorMessage';

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
      Alert.alert(
        'Order placed',
        `${orders.length} ${orders.length === 1 ? 'order' : 'orders'} created. Track them from the Orders tab.`,
      );
      navigation.popToTop();
    } catch (error) {
      Alert.alert('Checkout failed', errorMessage(error));
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
                    {`Rs. ${(item.price * item.quantity).toFixed(0)}`}
                  </Text>
                </View>
              ))}
              <Input
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
                    {`Rs. ${subtotal.toFixed(0)}`}
                  </Text>
                </View>
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabel}>Delivery</Text>
                  <Text style={styles.itemPrice}>
                    {`Rs. ${delivery.toFixed(0)}`}
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
            {`Rs. ${grandTotal.toFixed(0)}`}
          </Text>
        </View>
        <Button label="Place Order" loading={checkout.isPending} onPress={onConfirm} />
      </View>
    </View>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    content: {
      padding: spacing.lg,
    },
    sellerCard: {
      marginBottom: spacing.md,
    },
    sellerTitle: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: colors.text.secondary,
      marginBottom: spacing.sm,
    },
    sellerSummary: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    itemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    itemLabel: {
      flex: 1,
      marginRight: spacing.sm,
      color: colors.text.primary,
    },
    itemPrice: {
      color: colors.text.secondary,
      fontWeight: typography.weights.medium,
    },
    footer: {
      padding: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    totalLabel: {
      fontSize: typography.sizes.base,
      color: colors.text.secondary,
    },
    totalValue: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold,
      color: colors.text.primary,
    },
  });
}
