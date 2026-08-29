import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState } from '../../components/ui';
import { CartItemRow } from '../../components/features/orders/CartItemRow';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { cartTotal, useCartStore } from '../../store/cartStore';
import { lightTheme } from '../../theme';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

const { colors, spacing, typography } = lightTheme;

export function CartScreen({ navigation }: MarketplaceScreenProps<'Cart'>) {
  const { items, updateQuantity, removeItem } = useCartStore();
  const total = cartTotal(items);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <EmptyState title="Your cart is empty" description="Browse the marketplace to add produce." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={item => item.listingId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <CartItemRow
            item={item}
            onIncrement={() => updateQuantity(item.listingId, item.quantity + 1)}
            onDecrement={() => updateQuantity(item.listingId, item.quantity - 1)}
            onRemove={() => removeItem(item.listingId)}
          />
        )}
      />
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>Rs. {total.toFixed(0)}</Text>
        </View>
        <Button label="Checkout" onPress={() => navigation.navigate(MARKETPLACE_ROUTES.Checkout)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  empty: {
    flex: 1,
    backgroundColor: colors.neutral.white,
    justifyContent: 'center',
  },
  list: {
    padding: spacing.lg,
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
