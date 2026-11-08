import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Banknote, Clock, PackageCheck, Store, Tag, TriangleAlert, Warehouse } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDealerAnalytics } from '../../common/analytics';
import { useDealerApplication } from '../../common/auth';
import { Banner, Button, Card, ListGroup, ListRow, ListRowIcon, ScreenScaffold, StatusBadge } from '../../common/components';
import { APP_TABS, HOME_ROUTES, ORDERS_ROUTES } from '../../common/constants/routes';
import { useOrders, type OrderWithItems } from '../../common/orders';
import { navigateInTab } from '../../navigation/navigateInTab';
import type { HomeStackParamList } from '../../navigation/stacks/HomeNavigator';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useRoleAccent, useTheme, type Theme } from '../../theme';
import { formatDay } from '../../utils/dates';
import { errorMessage } from '../../utils/errorMessage';
import { formatRs } from '../../utils/money';

/** How many orders of one kind the "Needs you" group lists; the rest are in the Orders tab. */
const ROWS_PER_KIND = 3;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-PK')} ${n === 1 ? one : many}`;

/** The first item of an order as a sentence part: "20 bags of Sona Urea", "and 2 more" when there are others. */
function describeItems(order: OrderWithItems): string {
  const [first, ...rest] = order.order_items;
  if (!first) return 'an order';
  const unit = first.listing?.unit ? ` ${first.listing.unit}` : '';
  const more = rest.length > 0 ? ` and ${plural(rest.length, 'other item', 'other items')}` : '';
  return `${first.quantity.toLocaleString('en-PK')}${unit} of ${first.listing?.title ?? 'an item'}${more}`;
}

function oldestFirst(orders: OrderWithItems[], by: 'created_at' | 'updated_at') {
  return [...orders].sort((a, b) => a[by].localeCompare(b[by]));
}

/**
 * The dealer's home (audit AD-12, wireframe D1): what needs the dealer first, then the one Inventory system card
 * (SRDS §16), then the shop. A figure that could not be loaded shows "—" with a Banner, never 0 (AD-11). This screen is
 * mounted only for an approved dealer (a pending one sees the application screens instead, decision D10), so the
 * inventory entry needs no check of its own (BR-03/04: the inventory system is dealer-only). Stock figures come from the
 * analytics API, never from the inventory tables.
 */
export function DealerDashboardScreen() {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const tabs = useAppTabNavigation();
  const sales = useOrders('seller');
  const stats = useDealerAnalytics(true);
  // A dealer approved before A3b sent no business details; they add them here (their own row stays editable once
  // approved, 20261012080000_applications.sql).
  const { data: business, isSuccess: applicationLoaded } = useDealerApplication();

  // The dashboard summarises what changed elsewhere, so it refreshes every time it comes back into view.
  const { refetch: refetchSales } = sales;
  const { refetch: refetchStats } = stats;
  useFocusEffect(
    useCallback(() => {
      refetchSales();
      refetchStats();
    }, [refetchSales, refetchStats]),
  );
  const refresh = () => {
    refetchSales();
    refetchStats();
  };

  const orders = sales.data;
  const figures = stats.data;
  const waiting = [sales, stats].some(q => q.isPending && q.fetchStatus === 'paused');

  const ready = useMemo(() => oldestFirst((orders ?? []).filter(o => o.status === 'ready'), 'updated_at'), [orders]);
  const pending = useMemo(() => oldestFirst((orders ?? []).filter(o => o.status === 'pending'), 'created_at'), [orders]);
  const lowStock = figures?.lowStockCount;

  const monthSales = useMemo(() => {
    if (!orders) return undefined;
    const now = new Date();
    const thisMonth = orders.filter(o => {
      const done = new Date(o.updated_at);
      return o.status === 'completed' && done.getFullYear() === now.getFullYear() && done.getMonth() === now.getMonth();
    });
    return { count: thisMonth.length, total: thisMonth.reduce((sum, o) => sum + o.total, 0) };
  }, [orders]);

  const openOrder = (orderId: string) => navigateInTab(tabs, APP_TABS.Orders, ORDERS_ROUTES.OrderDetail, { orderId });

  let situation: string;
  let hint: string | undefined;
  if (orders) {
    if (ready[0]) {
      situation = `${plural(ready.length, 'order', 'orders')} to dispatch`;
      hint = `The oldest has waited since ${formatDay(ready[0].updated_at)}.`;
    } else if (pending[0]) {
      situation = `${plural(pending.length, 'order', 'orders')} to confirm`;
      hint = `The oldest came in on ${formatDay(pending[0].created_at)}.`;
    } else if (lowStock) {
      situation = `${plural(lowStock, 'item is', 'items are')} running low`;
    } else {
      situation = 'Nothing needs you right now';
    }
  } else {
    situation = sales.isError ? 'Orders did not load' : '—';
  }

  const needsYou = [
    ...ready.slice(0, ROWS_PER_KIND).map(order => (
      <ListRow
        key={order.id}
        title={`Dispatch ${describeItems(order)}`}
        meta={`${order.buyer?.full_name ?? 'A buyer'} · ready since ${formatDay(order.updated_at)}`}
        leading={<ListRowIcon icon={PackageCheck} />}
        status={<StatusBadge kind="order" status="ready" />}
        onPress={() => openOrder(order.id)}
      />
    )),
    ...pending.slice(0, ROWS_PER_KIND).map(order => (
      <ListRow
        key={order.id}
        title={`Confirm ${describeItems(order)}`}
        meta={`${order.buyer?.full_name ?? 'A buyer'} · ordered ${formatDay(order.created_at)}`}
        leading={<ListRowIcon icon={Clock} />}
        status={<StatusBadge kind="order" status="pending" />}
        onPress={() => openOrder(order.id)}
      />
    )),
    ...(lowStock
      ? [
          <ListRow
            key="low-stock"
            title={`${plural(lowStock, 'item is', 'items are')} running low`}
            meta="Restock in the inventory system"
            leading={<ListRowIcon icon={TriangleAlert} />}
            status={<StatusBadge kind="stock" status="low_stock" />}
            onPress={() => navigation.navigate(HOME_ROUTES.Inventory)}
          />,
        ]
      : []),
  ];
  const hiddenOrders = Math.max(0, ready.length - ROWS_PER_KIND) + Math.max(0, pending.length - ROWS_PER_KIND);

  return (
    <ScreenScaffold onRefresh={refresh} refreshing={sales.isRefetching || stats.isRefetching}>
      {waiting ? (
        <Banner tone="offline" title="Waiting for connection">
          Your figures load by themselves as soon as you are back online.
        </Banner>
      ) : null}
      {sales.isError ? (
        <Banner tone="danger" title="Couldn't load your orders" actionLabel="Try again" onAction={() => refetchSales()}>
          {errorMessage(sales.error)}
        </Banner>
      ) : null}
      {stats.isError ? (
        <Banner tone="danger" title="Couldn't load your shop figures" actionLabel="Try again" onAction={() => refetchStats()}>
          {errorMessage(stats.error)}
        </Banner>
      ) : null}
      {applicationLoaded && !business ? (
        <Banner tone="info" title="Add your business details" actionLabel="Add details" onAction={() => navigation.navigate(HOME_ROUTES.BusinessDetails)}>
          Your business name, type, registration number and address.
        </Banner>
      ) : null}

      <View style={styles.stack}>
        <Text style={styles.situation} accessibilityRole="header">
          {situation}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>

      {needsYou.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Needs you
          </Text>
          <ListGroup>{needsYou}</ListGroup>
          {hiddenOrders > 0 ? (
            <Button
              label={`See all ${plural(ready.length + pending.length, 'order', 'orders')}`}
              variant="secondary"
              onPress={() => navigateInTab(tabs, APP_TABS.Orders, ORDERS_ROUTES.OrderHistory)}
            />
          ) : null}
        </View>
      ) : null}

      <Card pad="none">
        <View style={[styles.band, { backgroundColor: accent.mark }]} />
        <View style={styles.cardBody}>
          <View style={styles.systemHead}>
            <Warehouse color={accent.ink} size={theme.size.iconMd} />
            <Text style={styles.systemTitle} accessibilityRole="header">
              Inventory system
            </Text>
          </View>
          <Text style={styles.hint}>Stock, stores, suppliers and every stock movement.</Text>
          {lowStock === undefined ? (
            stats.isPending ? null : <Text style={styles.hint}>Stock figures are not available right now.</Text>
          ) : lowStock > 0 ? (
            <View style={styles.inline}>
              <StatusBadge kind="stock" status="low_stock" />
              <Text style={styles.count}>{plural(lowStock, 'item', 'items')}</Text>
            </View>
          ) : (
            <View style={styles.inline}>
              <StatusBadge kind="stock" status="in_stock" />
              <Text style={styles.count}>Nothing is running low</Text>
            </View>
          )}
          <Button label="Open inventory system" onPress={() => navigation.navigate(HOME_ROUTES.Inventory)} />
        </View>
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Your shop
        </Text>
        <ListGroup>
          <ListRow
            title="Listings"
            meta={figures ? `${plural(figures.activeListings, 'active listing', 'active listings')}` : '—'}
            leading={<ListRowIcon icon={Tag} />}
            onPress={() => navigation.navigate(HOME_ROUTES.MyListings)}
          />
          <ListRow
            title="Sales this month"
            meta={monthSales ? `${formatRs(monthSales.total)} from ${plural(monthSales.count, 'order', 'orders')}` : '—'}
            leading={<ListRowIcon icon={Banknote} />}
            onPress={() => navigation.navigate(HOME_ROUTES.Analytics)}
          />
          <ListRow
            title="Business details"
            meta={business?.business_name ?? 'Name, registration number, address'}
            leading={<ListRowIcon icon={Store} />}
            onPress={() => navigation.navigate(HOME_ROUTES.BusinessDetails)}
          />
        </ListGroup>
      </View>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, borders, typography }: Theme) {
  return StyleSheet.create({
    stack: { gap: space[1] },
    situation: { ...typography.display, color: colors.ink },
    hint: { ...typography.caption, color: colors.ink2 },
    section: { gap: space[2] },
    sectionTitle: { ...typography.title, color: colors.ink },
    band: { height: borders.band },
    cardBody: { padding: space[4], gap: space[3] },
    systemHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    systemTitle: { ...typography.title, color: colors.ink },
    inline: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
    count: { ...typography.figure, color: colors.ink },
  });
}
