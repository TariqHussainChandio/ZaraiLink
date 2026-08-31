import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../../components/ui';
import { APP_TABS, HOME_ROUTES, MARKETPLACE_ROUTES, ORDERS_ROUTES } from '../../../constants/routes';
import { fetchConsultationsForUser } from '../../../services/modules/expert/consultationService';
import { fetchFarmCrops, fetchFarms } from '../../../services/modules/farmer/farmService';
import { fetchInventory } from '../../../services/modules/dealer/inventoryService';
import { fetchStores } from '../../../services/modules/dealer/storeService';
import { fetchSuppliers } from '../../../services/modules/dealer/supplierService';
import { fetchOrdersForUser } from '../../../services/modules/orders/ordersService';
import { supabase } from '../../../services/supabase/client';
import { useAuthStore } from '../../../store/authStore';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import type { HomeStackParamList } from '../../../navigation/stacks/HomeNavigator';
import { useTheme, type Theme } from '../../../theme';
import type { OrderWithItems } from '../../../types/orders';
import { ActivityFeed } from './ActivityFeed';
import { QuickActions } from './QuickActions';
import { StatCard } from './StatCard';

interface FarmerExtra {
  farmCount: number;
  cropCount: number;
  openConsultations: number;
  resolvedConsultations: number;
}

interface DealerExtra {
  lowStockCount: number;
  storeCount: number;
  supplierCount: number;
}

export function SellerDashboard() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const role = useAuthStore(state => state.role);
  const tabNavigation = useAppTabNavigation();
  const homeNavigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [activeListings, setActiveListings] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [recentSales, setRecentSales] = useState<OrderWithItems[]>([]);
  const [farmerExtra, setFarmerExtra] = useState<FarmerExtra | null>(null);
  const [dealerExtra, setDealerExtra] = useState<DealerExtra | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;

      (async () => {
        setLoading(true);
        const [{ count: listingsCount }, { count: pendingCount }, sales] = await Promise.all([
          supabase
            .from('listings')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', userId)
            .eq('status', 'active'),
          supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('seller_id', userId)
            .eq('status', 'pending'),
          fetchOrdersForUser('seller'),
        ]);

        if (role === 'farmer') {
          const [farms, consultations] = await Promise.all([
            fetchFarms(),
            fetchConsultationsForUser(),
          ]);
          const cropCounts = await Promise.all(farms.map(f => fetchFarmCrops(f.id)));
          if (!cancelled) {
            setFarmerExtra({
              farmCount: farms.length,
              cropCount: cropCounts.reduce((sum, crops) => sum + crops.length, 0),
              openConsultations: consultations.filter(c =>
                ['requested', 'accepted', 'in_progress'].includes(c.status),
              ).length,
              resolvedConsultations: consultations.filter(c =>
                ['resolved', 'closed'].includes(c.status),
              ).length,
            });
          }
        } else if (role === 'dealer') {
          const [inventory, stores, suppliers] = await Promise.all([
            fetchInventory(),
            fetchStores(),
            fetchSuppliers(),
          ]);
          if (!cancelled) {
            setDealerExtra({
              lowStockCount: inventory.filter(i => i.stock_quantity <= i.min_stock_threshold).length,
              storeCount: stores.length,
              supplierCount: suppliers.length,
            });
          }
        }

        if (cancelled) return;
        setActiveListings(listingsCount ?? 0);
        setPendingOrders(pendingCount ?? 0);
        setRecentSales(sales.slice(0, 5));
        setLoading(false);
      })();

      return () => {
        cancelled = true;
      };
    }, [userId, role]),
  );

  if (loading) return <Spinner fullscreen />;

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
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
  });
}
