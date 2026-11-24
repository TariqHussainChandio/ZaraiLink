// Dealer: home dashboard with the shop's sales figures, best sellers and quick links.
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChartColumn, Plus, Store, Tag, TrendingUp } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDealerAnalytics } from '../../common/analytics';
import { useDealerApplication } from '../../common/auth';
import { Banner, Button, ListGroup, ListRow, ListRowIcon, ScreenScaffold } from '../../common/components';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { APP_TABS, HOME_ROUTES, MARKETPLACE_ROUTES, ORDERS_ROUTES } from '../../common/constants/routes';
import { useOrders } from '../../common/orders';
import { navigateInTab } from '../../navigation/navigateInTab';
import type { HomeStackParamList } from '../../navigation/stacks/HomeNavigator';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { formatRs } from '../../utils/money';
import { useNameTitle } from '../../hooks/useNameTitle';

// A count with its word, such as "1 order" or "3 orders".
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-PK')} ${n === 1 ? one : many}`;

/**
 * The dealer's home is their marketplace shop (D20), and only that: the shop's figures and best sellers, and the way to
 * sell. Alerts, from the shop and from the inventory system, are read in Notifications (the bell counts both); the
 * inventory system, where every stock operation happens, opens from the app bar (SRDS §15–§17). A figure that could not
 * be loaded shows "—" with a Banner, never 0 (AD-11).
 */
export function DealerDashboardScreen() {
  // D20: the app bar names whose account this is.
  useNameTitle();
  const theme = useTheme();
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
  // Reloads the sales and analytics figures (pull to refresh).
  const refresh = () => {
    refetchSales();
    refetchStats();
  };

  const orders = sales.data;
  const figures = stats.data;
  const waiting = [sales, stats].some(q => q.isPending && q.fetchStatus === 'paused');

  // Completed orders this calendar month: their count and total.
  const monthSales = useMemo(() => {
    if (!orders) return undefined;
    const now = new Date();
    const thisMonth = orders.filter(o => {
      const done = new Date(o.updated_at);
      return o.status === 'completed' && done.getFullYear() === now.getFullYear() && done.getMonth() === now.getMonth();
    });
    return { count: thisMonth.length, total: thisMonth.reduce((sum, o) => sum + o.total, 0) };
  }, [orders]);

  // Open the full order history, or the analytics screen.
  const allOrders = () => navigateInTab(tabs, APP_TABS.Orders, ORDERS_ROUTES.OrderHistory);
  const analytics = () => navigation.navigate(HOME_ROUTES.Analytics);
  const bestSellers = figures?.bestSellers.slice(0, 3) ?? [];

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

      {/* The shop at a glance: every figure opens what it counts. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Your shop
        </Text>
        <View style={styles.tiles}>
          <StatTile label="Total sales" value={figures ? formatRs(figures.totalSales) : null} note="Completed orders" onPress={analytics} />
          <StatTile label="Orders" value={figures ? figures.totalOrders : null} note="Received, any status" onPress={allOrders} />
        </View>
        <View style={styles.tiles}>
          <StatTile label="To confirm" value={figures ? figures.pendingOrders : null} note="New orders" onPress={allOrders} />
          <StatTile label="To dispatch" value={figures ? figures.readyToDispatch : null} note="Orders ready" onPress={allOrders} />
        </View>
        <View style={styles.tiles}>
          <StatTile
            label="Listings"
            value={figures ? figures.activeListings : null}
            note="For sale now"
            onPress={() => navigation.navigate(HOME_ROUTES.MyListings)}
          />
          <StatTile
            label="This month"
            value={monthSales ? formatRs(monthSales.total) : null}
            note={monthSales ? plural(monthSales.count, 'completed order', 'completed orders') : undefined}
            onPress={analytics}
          />
        </View>
      </View>

      {bestSellers.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Best sellers
          </Text>
          <ListGroup>
            {bestSellers.map(item => (
              <ListRow
                key={item.listingId}
                title={item.title}
                meta={`${plural(item.unitsSold, 'unit', 'units')} sold · ${formatRs(item.revenue)}`}
                leading={<ListRowIcon icon={TrendingUp} />}
                onPress={analytics}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}

      <Button
        label="New listing"
        icon={Plus}
        size="lg"
        onPress={() => navigateInTab(tabs, APP_TABS.Marketplace, MARKETPLACE_ROUTES.CreateListing)}
      />
      <ListGroup>
        <ListRow title="My listings" leading={<ListRowIcon icon={Tag} />} onPress={() => navigation.navigate(HOME_ROUTES.MyListings)} />
        <ListRow title="Shop analytics" leading={<ListRowIcon icon={ChartColumn} />} onPress={analytics} />
        <ListRow title="Business details" leading={<ListRowIcon icon={Store} />} onPress={() => navigation.navigate(HOME_ROUTES.BusinessDetails)} />
      </ListGroup>
    </ScreenScaffold>
  );
}

// Builds this screen's styles from the theme.
function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    section: { gap: space[3] },
    sectionTitle: { ...typography.title, color: colors.ink },
    tiles: { flexDirection: 'row', gap: space[3] },
  });
}
