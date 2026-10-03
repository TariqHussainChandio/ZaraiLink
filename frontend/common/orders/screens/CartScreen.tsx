import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Button, EmptyState } from '../../components';
import { CartItemRow } from '../components/CartItemRow';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { cartTotal, useCartStore } from '../../../state/cartStore';
import { useTheme, type Theme } from '../../../theme';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';
import { formatRs } from '../../../utils/money';

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
          <Text style={styles.totalValue}>{formatRs(total)}</Text>
        </View>
        <Button
          label="Checkout"
          onPress={() => navigation.navigate(MARKETPLACE_ROUTES.Checkout)}
        />
      </View>
    </View>
  );
}

function makeStyles({ colors, space, typography, borders }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    empty: {
      flex: 1,
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    list: {
      padding: space[4],
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
