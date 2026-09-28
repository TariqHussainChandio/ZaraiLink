import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, Skeleton, SkeletonList } from '../../common/components';
import { ActivityFeed } from '../../common/components/dashboards/ActivityFeed';
import { QuickActions } from '../../common/components/dashboards/QuickActions';
import { StatCard } from '../../common/components/dashboards/StatCard';
import {
  APP_TABS,
  CONSULTATIONS_ROUTES,
  MARKETPLACE_ROUTES,
  ORDERS_ROUTES,
} from '../../common/constants/routes';
import { useOrders } from '../../common/orders';
import { useAuthStore } from '../../state/authStore';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../theme';

// Disease Advisory is farmer-only (like Inventory is dealer-only) — buyers get marketplace,
// orders, and expert consultation only, no entry point into `HOME_ROUTES.DiseaseAdvisory` here.
export function BuyerDashboardScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const tabNavigation = useAppTabNavigation();
  const { data: orders = [], isPending: loading, error, refetch } = useOrders('buyer', !!userId);
  const load = () => refetch();

  // Coming back to the dashboard shows orders placed or updated elsewhere.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  if (error) {
    return (
      <EmptyState
        title="Couldn't load your dashboard"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  if (loading) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.statsRow}>
          <Card style={styles.statSkeletonCard}>
            <Skeleton style={styles.statSkeletonValue} />
            <Skeleton style={styles.statSkeletonLabel} />
          </Card>
          <Card style={styles.statSkeletonCard}>
            <Skeleton style={styles.statSkeletonValue} />
            <Skeleton style={styles.statSkeletonLabel} />
          </Card>
        </View>
        <SkeletonList count={3} />
      </ScrollView>
    );
  }

  const pendingCount = orders.filter(order => order.status !== 'completed' && order.status !== 'cancelled').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <StatCard label="Total Purchases" value={orders.length} accent={theme.moduleAccents.orders} />
        <StatCard label="In Progress" value={pendingCount} accent={theme.moduleAccents.orders} />
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
    statSkeletonCard: {
      flex: 1,
      alignItems: 'flex-start',
    },
    statSkeletonValue: {
      width: 40,
      height: 22,
    },
    statSkeletonLabel: {
      marginTop: spacing.xs,
      width: 70,
      height: 12,
    },
  });
}
