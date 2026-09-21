import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { ActivityFeed } from '../../components/features/dashboards/ActivityFeed';
import { BarChart } from '../../components/features/dashboards/BarChart';
import { StatCard } from '../../components/features/dashboards/StatCard';
import { fetchDealerAnalytics } from '../../services/modules/analytics/analyticsService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { DealerAnalytics } from '../../types/analytics';

export function DealerAnalyticsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const [analytics, setAnalytics] = useState<DealerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!userId) return () => {};
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchDealerAnalytics().then(data => {
      if (cancelled) return;
      setAnalytics(data);
      setLoading(false);
    }).catch(err => {
      console.warn('[DealerAnalyticsScreen] failed to load analytics:', err);
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

  if (loading) return <Spinner fullscreen />;
  if (error || !analytics) {
    return (
      <EmptyState
        title={t('dealer.analytics.couldntLoadTitle')}
        description={t('dealer.shared.checkConnectionDescription')}
        actionLabel={t('common.retry')}
        onAction={load}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <StatCard
          label={t('dealer.analytics.totalSalesLabel')}
          value={t('dealer.analytics.totalSalesValue', { amount: analytics.totalSales.toFixed(0) })}
          accent={theme.moduleAccents.payments}
        />
        <StatCard label={t('dealer.analytics.totalOrdersLabel')} value={analytics.totalOrders} accent={theme.moduleAccents.orders} />
        <StatCard label={t('dealer.analytics.lowStockLabel')} value={analytics.lowStockCount} accent={theme.moduleAccents.inventory} />
      </View>

      <Text style={styles.sectionTitle}>{t('dealer.analytics.inventoryMovementTitle')}</Text>
      <BarChart
        data={analytics.inventoryMovement.map(m => ({ label: m.month.slice(5), value: m.value }))}
        color={theme.roleColors.dealer}
        emptyMessage={t('dealer.analytics.noStockMovement')}
      />

      <ActivityFeed
        title={t('dealer.analytics.bestSellersTitle')}
        emptyMessage={t('dealer.analytics.noCompletedSales')}
        items={analytics.bestSellers.map(p => ({
          id: p.listingId,
          title: p.title,
          subtitle: t('dealer.analytics.revenueSubtitle', { amount: p.revenue.toFixed(0) }),
          value: t('dealer.analytics.unitsSoldValue', { count: p.unitsSold }),
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
      flexWrap: 'wrap',
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
