import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Boxes } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Banner,
  Card,
  ListGroup,
  ListRow,
  ListRowIcon,
  Skeleton,
  SkeletonList,
} from '../../components';
import { APP_TABS, HOME_ROUTES, MARKETPLACE_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import { useDealerAnalytics, useFarmerAnalytics } from '../hooks/analytics';
import { useOrders } from '../../orders';
import { selectAccount, useAuthStore } from '../../../state/authStore';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import { useOpenInventorySystem } from '../../../navigation/stacks/useOpenInventorySystem';
import type { HomeStackParamList } from '../../../navigation/stacks/HomeNavigator';
import { useTheme, type Theme } from '../../../theme';
import { ActivityFeed } from '../../components/dashboards/ActivityFeed';
import { QuickActions } from '../../components/dashboards/QuickActions';
import { StatTile } from '../../components/dashboards/StatTile';
import { errorMessage } from '../../../utils/errorMessage';
import { formatRs } from '../../../utils/money';
import { statusMeta } from '../../constants/status';

export function SellerDashboard() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const role = useAuthStore(state => state.role);
  // The server profile, or offline the account remembered on the device (an approved dealer keeps the Inventory tile).
  const accountStatus = useAuthStore(state => selectAccount(state)?.account_status);
  const openInventorySystem = useOpenInventorySystem();
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

  // Contract "Inventory entry" (B4): one tile opens the IMS root navigator. Only an approved dealer sees it
  // (BR-03/04). The root route exists only for dealers and an unapproved account never reaches the shell; this check is
  // the second guard, so the tile cannot appear if either of those changes.
  const inventoryEntry =
    role === 'dealer' && accountStatus === 'approved' ? (
      <View style={styles.inventoryEntry}>
        <ListGroup>
          <ListRow
            title="Inventory Management"
            meta="Open Inventory System"
            leading={<ListRowIcon icon={Boxes} />}
            onPress={openInventorySystem}
          />
        </ListGroup>
      </View>
    ) : null;

  // Only the numbers wait for the analytics; the quick actions and the inventory tile are there from the start. Offline
  // the analytics wait for the connection (they are not kept on the device) while the inventory system opens from what
  // is (B4 verification, F1).
  const statsSkeleton = (
    <>
      {[0, 1].map(row => (
        <View key={row} style={styles.statsRow}>
          <Card style={styles.statSkeletonCard}>
            <Skeleton style={styles.statSkeletonValue} />
            <Skeleton style={styles.statSkeletonLabel} />
          </Card>
          <Card style={styles.statSkeletonCard}>
            <Skeleton style={styles.statSkeletonValue} />
            <Skeleton style={styles.statSkeletonLabel} />
          </Card>
        </View>
      ))}
    </>
  );

  // The numbers come from the role's analytics; recent sales load on their own below, so one failing does not hide the
  // other. A role without seller analytics leaves the query disabled (pending forever), which must not read as loading.
  const statsLoading = stats.data === undefined && stats.isPending && (role === 'farmer' || role === 'dealer');
  const statsFailed = stats.data === undefined && stats.isError && !stats.isFetching;

  const activeListings = stats.data?.activeListings ?? 0;
  const pendingOrders = stats.data?.pendingOrders ?? 0;
  const readyToDispatch = stats.data?.readyToDispatch ?? 0;
  const totalOrders = stats.data?.totalOrders ?? 0;
  const farmerExtra = role === 'farmer' ? farmer.data : undefined;
  const dealerExtra = role === 'dealer' ? dealer.data : undefined;

  const statTiles = (
    <>
      <View style={styles.statsRow}>
        <StatTile label="Active Listings" value={activeListings} accent={theme.colors.module.marketplace} />
        <StatTile label="Pending Orders" value={pendingOrders} accent={theme.colors.module.orders} />
      </View>
      <View style={styles.statsRow}>
        {/* D5 (A4): a ready order waits for its seller to dispatch it from the order, under View Orders. */}
        <StatTile label="Ready to Dispatch" value={readyToDispatch} accent={theme.colors.module.orders} />
        <StatTile label="Total Orders" value={totalOrders} accent={theme.colors.module.orders} />
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
    </>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {statsLoading ? (
        statsSkeleton
      ) : statsFailed ? (
        <View style={styles.statsBanner}>
          <Banner tone="danger" title="Couldn't load your dashboard" actionLabel="Retry" onAction={() => refetchStats()}>
            {errorMessage(stats.error)}
          </Banner>
        </View>
      ) : (
        statTiles
      )}

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
                  label: 'Scan Disease',
                  onPress: () => homeNavigation.navigate(HOME_ROUTES.DiseaseAdvisory),
                },
              ]
            : []),
          ...(role === 'dealer'
            ? [
                { label: 'My Listings', onPress: () => homeNavigation.navigate(HOME_ROUTES.Products) },
              ]
            : []),
        ]}
      />

      {inventoryEntry}

      {sales.data === undefined && sales.isError ? (
        <View style={styles.salesState}>
          <Banner tone="danger" title="Couldn't load recent sales" actionLabel="Retry" onAction={() => refetchSales()}>
            {errorMessage(sales.error)}
          </Banner>
        </View>
      ) : sales.data === undefined && sales.isPending ? (
        <View style={styles.salesState}>
          <SkeletonList count={2} />
        </View>
      ) : (
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
      )}
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
    inventoryEntry: {
      marginTop: space[4],
    },
    statsBanner: {
      marginBottom: space[6],
    },
    sectionTitle: {
      ...typography.bodyStrong,
      color: colors.ink,
      marginBottom: space[2],
    },
    salesState: {
      marginTop: space[6],
    },
    statSkeletonCard: {
      flex: 1,
      alignItems: 'flex-start',
    },
    statSkeletonValue: {
      width: '40%',
      height: typography.figureLg.fontSize,
    },
    statSkeletonLabel: {
      marginTop: space[1],
      width: '70%',
      height: typography.caption.fontSize,
    },
  });
}
