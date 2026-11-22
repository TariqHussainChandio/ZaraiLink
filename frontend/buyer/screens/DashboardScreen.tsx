import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, ListGroup, ListRow, ScreenScaffold, Skeleton, StatusBadge } from '../../common/components';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { APP_TABS, HOME_ROUTES, ORDERS_ROUTES } from '../../common/constants/routes';
import { useOrders, type OrderWithItems } from '../../common/orders';
import { navigateInTab } from '../../navigation/navigateInTab';
import type { HomeStackParamList } from '../../navigation/stacks/HomeNavigator';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useAuthStore } from '../../state/authStore';
import { useWishlist } from '../../state/wishlistStore';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { formatRs } from '../../utils/money';
import { useNameTitle } from '../../hooks/useNameTitle';

// Orders still moving towards the buyer; a rejected, expired or refunded order is over, not in progress.
const IN_PROGRESS = ['pending', 'confirmed', 'processing', 'ready', 'dispatched'];
// The order list carries no payment record, so "waiting for payment" is the stage where the buyer can still pay
// (the same rule as `canPay` on the order screen). Disease Advisory is farmer-only: buyers get no entry into it here.
const AWAITING_PAYMENT = ['pending', 'confirmed'];

/** The buyer's home: their figures, what needs them (orders to pay, goods to confirm), then recent purchases. The market
 * is a tab of its own, so the home carries no "find products" card (D20). */
export function BuyerDashboardScreen() {
  // D20: the app bar names whose account this is.
  useNameTitle();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const tabs = useAppTabNavigation();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const saved = useWishlist(userId).length;
  const ordersQuery = useOrders('buyer', !!userId);
  const { data: orders, isPending, isError, error, refetch, isRefetching } = ordersQuery;

  // Coming back to the dashboard shows orders placed or updated elsewhere.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  const openOrder = (orderId: string) => navigateInTab(tabs, APP_TABS.Orders, ORDERS_ROUTES.OrderDetail, { orderId });
  const allOrders = () => navigateInTab(tabs, APP_TABS.Orders, ORDERS_ROUTES.OrderHistory);

  // `orders` is undefined while loading or when the first load failed: figures are then unknown ("—"), never 0.
  const known = orders !== undefined;
  const toPay = orders?.filter(o => AWAITING_PAYMENT.includes(o.status)) ?? [];
  const toConfirm = orders?.filter(o => o.status === 'dispatched') ?? [];
  const needsYou = [...toPay, ...toConfirm];
  const open = orders?.filter(o => IN_PROGRESS.includes(o.status)).length;

  const purchaseRow = (order: OrderWithItems) => (
    <ListRow
      key={order.id}
      title={order.seller?.full_name || 'Unknown seller'}
      meta={order.order_items.map(item => item.listing?.title).filter(Boolean).slice(0, 2).join(', ') || undefined}
      trailing={<Text style={styles.price}>{formatRs(order.total)}</Text>}
      status={<StatusBadge kind="order" status={order.status} />}
      onPress={() => openOrder(order.id)}
    />
  );

  return (
    <ScreenScaffold onRefresh={refetch} refreshing={isRefetching && !isPending} testID="buyer-dashboard">
      {isError ? (
        <Banner tone="danger" title="Couldn't load your orders" actionLabel="Try again" onAction={refetch}>
          {errorMessage(error)}
        </Banner>
      ) : null}

      {/* Every figure opens what it counts (D20). The wishlist is kept on the phone, so its count is always known. */}
      <View style={styles.tiles}>
        <StatTile label="Open orders" value={known ? open : null} onPress={allOrders} />
        <StatTile label="Purchases" value={known ? orders.length : null} onPress={allOrders} />
        <StatTile label="Saved" value={saved} onPress={() => navigation.navigate(HOME_ROUTES.Wishlist)} />
      </View>

      {isPending ? (
        <Skeleton style={styles.skeleton} />
      ) : needsYou.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Needs you</Text>
          <ListGroup>
            {needsYou.map(order => (
              <ListRow
                key={order.id}
                title={order.seller?.full_name || 'Unknown seller'}
                meta={order.status === 'dispatched' ? 'Confirm when the goods arrive' : 'Open the order to pay'}
                trailing={<Text style={styles.price}>{formatRs(order.total)}</Text>}
                status={<StatusBadge kind="order" status={order.status} />}
                onPress={() => openOrder(order.id)}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent purchases</Text>
        {isPending ? (
          <Skeleton style={styles.skeleton} />
        ) : !known ? null : orders.length === 0 ? (
          <Text style={styles.empty}>No purchases yet. Your orders will show here.</Text>
        ) : (
          <ListGroup>{orders.slice(0, 5).map(order => purchaseRow(order))}</ListGroup>
        )}
      </View>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    // Two tiles across, as on every dashboard (StatTile): Saved takes the next line instead of running off the screen.
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
    section: { gap: space[2] },
    sectionTitle: { ...typography.title, color: colors.ink },
    price: { ...typography.price, color: colors.ink },
    empty: { ...typography.body, color: colors.ink2 },
    skeleton: { width: '100%', height: space[12] },
  });
}
