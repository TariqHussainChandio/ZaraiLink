import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Input } from '../../components/ui';
import { checkout } from '../../services/modules/orders/ordersService';
import { useAuthStore } from '../../store/authStore';
import { useCartStore, type CartItem } from '../../store/cartStore';
import { lightTheme } from '../../theme';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

const { colors, spacing, typography } = lightTheme;

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
  const userId = useAuthStore(state => state.user?.id);
  const { items, clear } = useCartStore();
  const [submitting, setSubmitting] = useState(false);
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
    setSubmitting(true);
    try {
      const deliveryChargeBySeller: Record<string, number> = {};
      for (const sellerId of grouped.keys()) {
        deliveryChargeBySeller[sellerId] = Number(deliveryCharges[sellerId] ?? 0) || 0;
      }
      const orders = await checkout(items, deliveryChargeBySeller);
      clear();
      Alert.alert(
        'Order placed',
        `${orders.length} order${orders.length === 1 ? '' : 's'} created. Track them from the Orders tab.`,
      );
      navigation.popToTop();
    } catch (error) {
      Alert.alert('Checkout failed', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
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
                Order {sellerItems.length} item{sellerItems.length === 1 ? '' : 's'}
              </Text>
              {sellerItems.map(item => (
                <View key={item.listingId} style={styles.itemRow}>
                  <Text style={styles.itemLabel} numberOfLines={1}>
                    {item.quantity} × {item.title}
                  </Text>
                  <Text style={styles.itemPrice}>Rs. {(item.price * item.quantity).toFixed(0)}</Text>
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
                  <Text style={styles.itemPrice}>Rs. {subtotal.toFixed(0)}</Text>
                </View>
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabel}>Delivery</Text>
                  <Text style={styles.itemPrice}>Rs. {delivery.toFixed(0)}</Text>
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>Rs. {grandTotal.toFixed(0)}</Text>
        </View>
        <Button label="Place Order" loading={submitting} onPress={onConfirm} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  content: {
    padding: spacing.lg,
  },
  sellerCard: {
    marginBottom: spacing.md,
  },
  sellerTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray600,
    marginBottom: spacing.sm,
  },
  sellerSummary: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.neutral.gray100,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  itemLabel: {
    flex: 1,
    marginRight: spacing.sm,
    color: colors.neutral.gray900,
  },
  itemPrice: {
    color: colors.neutral.gray700,
    fontWeight: typography.weights.medium as any,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.neutral.gray200,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  totalLabel: {
    fontSize: typography.sizes.base,
    color: colors.neutral.gray600,
  },
  totalValue: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold as any,
    color: colors.neutral.gray900,
  },
});
