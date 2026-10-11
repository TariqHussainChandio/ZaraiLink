import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, Skeleton, SkeletonList } from '../../common/components';
import { ActivityFeed } from '../../common/components/dashboards/ActivityFeed';
import { QuickActions } from '../../common/components/dashboards/QuickActions';
import { StatTile } from '../../common/components/dashboards/StatTile';
import {
  APP_TABS,
  CONSULTATIONS_ROUTES,
  MARKETPLACE_ROUTES,
  ORDERS_ROUTES,
} from '../../common/constants/routes';
import { useOrders, type OrderStatus } from '../../common/orders';
import { useAuthStore } from '../../state/authStore';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../theme';
import { formatRs } from '../../utils/money';
import { statusMeta } from '../../common/constants/status';

const IN_PROGRESS: OrderStatus[] = ['pending', 'confirmed', 'processing', 'ready', 'dispatched'];

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

  // Orders still moving towards the buyer; a rejected, expired or refunded order is over, not in progress.
  const pendingCount = orders.filter(order => IN_PROGRESS.includes(order.status)).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <StatTile label="Total Purchases" value={orders.length} accent={theme.colors.module.orders} />
        <StatTile label="In Progress" value={pendingCount} accent={theme.colors.module.orders} />
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
          title: order.seller?.full_name || 'Unknown seller',
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
