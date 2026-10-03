import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../components';
import { APP_TABS, HOME_ROUTES, MARKETPLACE_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import { useDealerAnalytics, useFarmerAnalytics } from '../hooks/analytics';
import { useOrders } from '../../orders';
import { useAuthStore } from '../../../state/authStore';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import type { HomeStackParamList } from '../../../navigation/stacks/HomeNavigator';
import { useTheme, type Theme } from '../../../theme';
import { ActivityFeed } from '../../components/dashboards/ActivityFeed';
import { QuickActions } from '../../components/dashboards/QuickActions';
import { StatTile } from '../../components/dashboards/StatTile';
import { formatRs } from '../../../utils/money';
import { statusMeta } from '../../constants/status';

export function SellerDashboard() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const role = useAuthStore(state => state.role);
  const tabNavigation = useAppTabNavigation();
  const homeNavigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const sales = useOrders('seller');
  const farmer = useFarmerAnalytics(role === 'farmer');
  const dealer = useDealerAnalytics(role === 'dealer');
  const stats = role === 'farmer' ? farmer : dealer;
  const recentSales = useMemo(() => (sales.data ?? []).slice(0, 5), [sales.data]);

  // The dashboard is a summary of what changed elsewhere, so it refreshes every time it comes back into view.
  const { refetch: refetchSales } = sales;
  const { refetch: refetchStats } = stats;
  useFocusEffect(
    useCallback(() => {
      refetchSales();
      // `refetch` ignores `enabled`, so a role without seller analytics (403) must not be refetched.
      if (role === 'farmer' || role === 'dealer') refetchStats();
    }, [role, refetchSales, refetchStats]),
  );

  if (sales.isLoading || stats.isLoading) return <Spinner fullscreen />;
  const activeListings = stats.data?.activeListings ?? 0;
  const pendingOrders = stats.data?.pendingOrders ?? 0;
  const farmerExtra = role === 'farmer' ? farmer.data : undefined;
  const dealerExtra = role === 'dealer' ? dealer.data : undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <StatTile label="Active Listings" value={activeListings} accent={theme.colors.module.marketplace} />
        <StatTile label="Pending Orders" value={pendingOrders} accent={theme.colors.module.orders} />
      </View>

      {role === 'farmer' && farmerExtra ? (
        <>
          <View style={styles.statsRow}>
            <StatTile label="Farms" value={farmerExtra.farmCount} accent={theme.colors.accent.farmer.mark} />
            <StatTile label="Crops" value={farmerExtra.cropCount} accent={theme.colors.accent.farmer.mark} />
          </View>
          <View style={styles.statsRow}>
            <StatTile label="Open Consultations" value={farmerExtra.openConsultations} accent={theme.colors.module.expert} />
            <StatTile label="Resolved" value={farmerExtra.resolvedConsultations} accent={theme.colors.module.expert} />
          </View>
        </>
      ) : null}

      {role === 'dealer' && dealerExtra ? (
        <>
          <View style={styles.statsRow}>
            <StatTile label="Low Stock" value={dealerExtra.lowStockCount} accent={theme.colors.module.dealer} />
            <StatTile label="Stores" value={dealerExtra.storeCount} accent={theme.colors.module.dealer} />
          </View>
          <View style={styles.statsRow}>
            <StatTile label="Suppliers" value={dealerExtra.supplierCount} accent={theme.colors.module.dealer} />
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <QuickActions
        actions={[
          {
            label: '+ New Listing',
            onPress: () =>
              tabNavigation?.navigate(APP_TABS.Marketplace, {
                screen: MARKETPLACE_ROUTES.CreateListing,
              }),
          },
          {
            label: 'View Orders',
            onPress: () =>
              tabNavigation?.navigate(APP_TABS.Orders, { screen: ORDERS_ROUTES.OrderHistory }),
          },
          {
            label: 'Analytics',
            onPress: () => homeNavigation.navigate(HOME_ROUTES.Analytics),
          },
          ...(role === 'farmer'
            ? [
                { label: 'My Listings', onPress: () => homeNavigation.navigate(HOME_ROUTES.MyListings) },
                {
                  label: 'Farms & Crops',
                  onPress: () => homeNavigation.navigate(HOME_ROUTES.FarmList),
                },
                {
                  label: 'Disease Advisory',
                  onPress: () => homeNavigation.navigate(HOME_ROUTES.DiseaseAdvisory),
                },
              ]
            : []),
          ...(role === 'dealer'
            ? [
                { label: 'Products', onPress: () => homeNavigation.navigate(HOME_ROUTES.Products) },
                { label: 'Inventory', onPress: () => homeNavigation.navigate(HOME_ROUTES.Inventory) },
                { label: 'Stores', onPress: () => homeNavigation.navigate(HOME_ROUTES.Stores) },
                {
                  label: 'Suppliers',
                  onPress: () => homeNavigation.navigate(HOME_ROUTES.Suppliers),
                },
              ]
            : []),
        ]}
      />

      <ActivityFeed
        title="Recent Sales"
        emptyMessage="No sales yet"
        items={recentSales.map(order => ({
          id: order.id,
          title: order.buyer?.full_name || 'Unknown buyer',
          subtitle: `${formatRs(order.total)} · ${statusMeta('order', order.status).label}`,
          onPress: () =>
            tabNavigation?.navigate(APP_TABS.Orders, {
              screen: ORDERS_ROUTES.OrderDetail,
              params: { orderId: order.id },
            }),
        }))}
      />
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
    statsRow: {
      flexDirection: 'row',
      gap: space[3],
      marginBottom: space[6],
    },
    sectionTitle: {
      ...typography.bodyStrong,
      color: colors.ink,
      marginBottom: space[2],
    },
  });
}
