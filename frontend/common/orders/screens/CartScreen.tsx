import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Button, EmptyState } from '../../components';
import { CartItemRow } from '../components/CartItemRow';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { cartTotal, useCartStore } from '../../../state/cartStore';
import { useTheme, type Theme } from '../../../theme';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

export function CartScreen({ navigation }: MarketplaceScreenProps<'Cart'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { items, updateQuantity, removeItem } = useCartStore();
  const total = cartTotal(items);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <EmptyState
          title="Your cart is empty"
          description="Browse the marketplace to add produce."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
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
          <Text style={styles.totalValue}>{`Rs. ${total.toFixed(0)}`}</Text>
        </View>
        <Button
          label="Checkout"
          onPress={() => navigation.navigate(MARKETPLACE_ROUTES.Checkout)}
        />
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
    empty: {
      flex: 1,
      backgroundColor: colors.background.surface,
      justifyContent: 'center',
    },
    list: {
      padding: spacing.lg,
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
