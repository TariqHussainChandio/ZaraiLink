import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState } from '../../components/ui';
import { CartItemRow } from '../../components/features/orders/CartItemRow';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { cartTotal, useCartStore } from '../../store/cartStore';
import { useTheme, type Theme } from '../../theme';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

export function CartScreen({ navigation }: MarketplaceScreenProps<'Cart'>) {
  const theme = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { items, updateQuantity, removeItem } = useCartStore();
  const total = cartTotal(items);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <EmptyState
          title={t('orders.cart.emptyTitle')}
          description={t('orders.cart.emptyDescription')}
        />
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
          <Text style={styles.totalLabel}>{t('orders.cart.totalLabel')}</Text>
          <Text style={styles.totalValue}>{t('orders.cart.totalValue', { amount: total.toFixed(0) })}</Text>
        </View>
        <Button
          label={t('orders.cart.checkoutLabel')}
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
      fontWeight: typography.weights.bold as any,
      color: colors.text.primary,
    },
  });
}
