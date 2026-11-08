import { ShoppingCart } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, EmptyState, ScreenScaffold, StickyActionBar, useSnackbar } from '../../components';
import { CartItemRow } from '../components/CartItemRow';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { useCartListings } from '../hooks/orders';
import { currentPrice, groupBySeller, productsTotal, sellerLabel } from '../utils/cartGroups';
import { useCartStore } from '../../../state/cartStore';
import { useTheme, type Theme } from '../../../theme';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';
import { formatRs } from '../../../utils/money';

/** The cart, one card per seller (checkout makes one order per seller). Prices are today's, line totals are shown, a
 * removed line can be brought back, and the sum is labelled "Products": delivery is agreed per seller at checkout. */
export function CartScreen({ navigation }: MarketplaceScreenProps<'Cart'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const snackbar = useSnackbar();
  const { items, updateQuantity, removeItem, addItem } = useCartStore();
  const listings = useCartListings(items.map(item => item.listingId));
  const groups = groupBySeller(items);
  const total = productsTotal(items, listings);

  if (items.length === 0) {
    return (
      <ScreenScaffold>
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Find seeds, fertiliser and produce in the market."
          actionLabel="Browse the market"
          onAction={() => navigation.navigate(MARKETPLACE_ROUTES.Browse)}
        />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold
      footer={
        <StickyActionBar
          leading={
            <View accessible accessibilityLabel={`Products ${formatRs(total)}`}>
              <Text style={styles.totalLabel}>Products</Text>
              <Text style={styles.total}>{formatRs(total)}</Text>
            </View>
          }
        >
          <Button label="Go to checkout" size="lg" onPress={() => navigation.navigate(MARKETPLACE_ROUTES.Checkout)} />
        </StickyActionBar>
      }
    >
      {groups.map(group => {
        const seller = sellerLabel(group, listings);
        return (
          <Card key={group.sellerId} style={styles.seller}>
            <Text style={styles.sellerName} accessibilityRole="header">
              {seller.city ? `${seller.name} · ${seller.city}` : seller.name}
            </Text>
            {group.items.map(item => (
              <CartItemRow
                key={item.listingId}
                item={item}
                price={currentPrice(item, listings)}
                onQuantityChange={quantity => updateQuantity(item.listingId, quantity)}
                onRemove={() => {
                  removeItem(item.listingId);
                  snackbar.show(`${item.title} removed`, { label: 'Undo', onPress: () => addItem({ ...item }, item.quantity) });
                }}
              />
            ))}
          </Card>
        );
      })}
      <Text style={styles.note}>Delivery is agreed with each seller. You enter the charge at checkout.</Text>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    seller: { gap: space[1] },
    sellerName: { ...typography.title, color: colors.ink },
    note: { ...typography.caption, color: colors.ink2 },
    totalLabel: { ...typography.caption, color: colors.ink2 },
    total: { ...typography.figureLg, color: colors.ink },
  });
}
