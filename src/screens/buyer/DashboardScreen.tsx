import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, Skeleton, SkeletonList } from '../../components/ui';
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
import { useTheme, type Theme } from '../../theme';
import type { OrderWithItems } from '../../types/orders';

// Disease Advisory is farmer-only (like Inventory is dealer-only) — buyers get marketplace,
// orders, and expert consultation only, no entry point into `HOME_ROUTES.DiseaseAdvisory` here.
export function BuyerDashboardScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
  const userId = useAuthStore(state => state.user?.id);
  const tabNavigation = useAppTabNavigation();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!userId) return () => {};
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchOrdersForUser('buyer').then(data => {
      if (!cancelled) {
        setOrders(data);
        setLoading(false);
      }
    }).catch(err => {
      console.warn('[BuyerDashboardScreen] failed to load orders:', err);
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useFocusEffect(useCallback(() => load(), [load]));

  if (error) {
    return (
      <EmptyState
        title={t('buyer.dashboard.loadErrorTitle')}
        description={t('common.checkConnectionRetry')}
        actionLabel={t('common.retry')}
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
        <StatCard label={t('buyer.dashboard.totalPurchases')} value={orders.length} accent={theme.moduleAccents.orders} />
        <StatCard label={t('buyer.dashboard.inProgress')} value={pendingCount} accent={theme.moduleAccents.orders} />
      </View>

      <Text style={styles.sectionTitle}>{t('buyer.dashboard.quickActionsTitle')}</Text>
      <QuickActions
        actions={[
          {
            label: t('buyer.dashboard.browseMarketplace'),
            onPress: () =>
              tabNavigation?.navigate(APP_TABS.Marketplace, { screen: MARKETPLACE_ROUTES.Browse }),
          },
          {
            label: t('buyer.dashboard.consultExpert'),
            onPress: () =>
              tabNavigation?.navigate(APP_TABS.Consultations, {
                screen: CONSULTATIONS_ROUTES.ConsultationList,
              }),
          },
        ]}
      />

      <ActivityFeed
        title={t('buyer.dashboard.recentPurchasesTitle')}
        emptyMessage={t('buyer.dashboard.noPurchasesYet')}
        items={orders.slice(0, 5).map(order => ({
          id: order.id,
          title: order.seller?.full_name ?? t('buyer.dashboard.unknownSeller'),
          subtitle: t('buyer.dashboard.purchaseSubtitle', { amount: order.total.toFixed(0), status: order.status }),
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
