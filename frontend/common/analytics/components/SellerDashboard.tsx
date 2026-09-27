import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../../components/ui';
import { APP_TABS, HOME_ROUTES, MARKETPLACE_ROUTES, ORDERS_ROUTES } from '../../../constants/routes';
import { useDealerAnalytics, useFarmerAnalytics } from '../../../hooks/api/analytics';
import { useOrders } from '../../../hooks/api/orders';
import { useAuthStore } from '../../../store/authStore';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import type { HomeStackParamList } from '../../../navigation/stacks/HomeNavigator';
import { useTheme, type Theme } from '../../../theme';
import { ActivityFeed } from './ActivityFeed';
import { QuickActions } from './QuickActions';
import { StatCard } from './StatCard';

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
        <StatCard label="Active Listings" value={activeListings} accent={theme.moduleAccents.marketplace} />
        <StatCard label="Pending Orders" value={pendingOrders} accent={theme.moduleAccents.orders} />
      </View>

      {role === 'farmer' && farmerExtra ? (
        <>
          <View style={styles.statsRow}>
            <StatCard label="Farms" value={farmerExtra.farmCount} accent={theme.moduleAccents.farmer} />
            <StatCard label="Crops" value={farmerExtra.cropCount} accent={theme.moduleAccents.farmer} />
          </View>
          <View style={styles.statsRow}>
            <StatCard label="Open Consultations" value={farmerExtra.openConsultations} accent={theme.moduleAccents.consultation} />
            <StatCard label="Resolved" value={farmerExtra.resolvedConsultations} accent={theme.moduleAccents.consultation} />
          </View>
        </>
      ) : null}

      {role === 'dealer' && dealerExtra ? (
        <>
          <View style={styles.statsRow}>
            <StatCard label="Low Stock" value={dealerExtra.lowStockCount} accent={theme.moduleAccents.inventory} />
            <StatCard label="Stores" value={dealerExtra.storeCount} accent={theme.moduleAccents.dealer} />
          </View>
          <View style={styles.statsRow}>
            <StatCard label="Suppliers" value={dealerExtra.supplierCount} accent={theme.moduleAccents.dealer} />
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
          title: order.buyer?.full_name ?? 'Unknown buyer',
          subtitle: `Rs. ${order.total.toFixed(0)} · ${order.status}`,
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

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    content: {
      padding: spacing.lg,
    },
    statsRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.xl,
    },
    sectionTitle: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
  });
}
