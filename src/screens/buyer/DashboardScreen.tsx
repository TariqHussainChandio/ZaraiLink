import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../components/ui';
import { ActivityFeed } from '../../components/features/dashboards/ActivityFeed';
import { QuickActions } from '../../components/features/dashboards/QuickActions';
import { StatCard } from '../../components/features/dashboards/StatCard';
import {
  APP_TABS,
  CONSULTATIONS_ROUTES,
  MARKETPLACE_ROUTES,
  ORDERS_ROUTES,
} from '../../constants/routes';
import { fetchOrdersForUser } from '../../services/modules/orders/ordersService';
import { useAuthStore } from '../../store/authStore';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { lightTheme } from '../../theme';
import type { OrderWithItems } from '../../types/orders';

const { colors, spacing, typography } = lightTheme;

// Disease Advisory is farmer-only (like Inventory is dealer-only) — buyers get marketplace,
// orders, and expert consultation only, no entry point into `HOME_ROUTES.DiseaseAdvisory` here.
export function BuyerDashboardScreen() {
  const userId = useAuthStore(state => state.user?.id);
  const tabNavigation = useAppTabNavigation();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      fetchOrdersForUser('buyer').then(data => {
        if (!cancelled) {
          setOrders(data);
          setLoading(false);
        }
      }).catch(err => {
        console.warn('[BuyerDashboardScreen] failed to load orders:', err);
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  if (loading) return <Spinner fullscreen />;

  const pendingCount = orders.filter(order => order.status !== 'completed' && order.status !== 'cancelled').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <StatCard label="Total Purchases" value={orders.length} />
        <StatCard label="In Progress" value={pendingCount} />
      </View>

      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <QuickActions
        actions={[
          {
            label: 'Browse Marketplace',
            onPress: () =>
              tabNavigation?.navigate(APP_TABS.Marketplace, { screen: MARKETPLACE_ROUTES.Browse }),
          },
          {
            label: 'Consult an Expert',
            onPress: () =>
              tabNavigation?.navigate(APP_TABS.Consultations, {
                screen: CONSULTATIONS_ROUTES.ConsultationList,
              }),
          },
        ]}
      />

      <ActivityFeed
        title="Recent Purchases"
        emptyMessage="No purchases yet"
        items={orders.slice(0, 5).map(order => ({
          id: order.id,
          title: order.seller?.full_name ?? 'Unknown seller',
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
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
    color: colors.neutral.gray900,
    marginBottom: spacing.sm,
  },
});
