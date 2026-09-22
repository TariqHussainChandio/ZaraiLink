import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { ActivityFeed } from '../../components/features/dashboards/ActivityFeed';
import { BarChart } from '../../components/features/dashboards/BarChart';
import { StatCard } from '../../components/features/dashboards/StatCard';
import { fetchFarmerAnalytics } from '../../services/modules/analytics/analyticsService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { FarmerAnalytics } from '../../types/analytics';

export function FarmerAnalyticsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const [analytics, setAnalytics] = useState<FarmerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!userId) return () => {};
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchFarmerAnalytics().then(data => {
      if (cancelled) return;
      setAnalytics(data);
      setLoading(false);
    }).catch(err => {
      console.warn('[FarmerAnalyticsScreen] failed to load analytics:', err);
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
        title={t('farmer.analytics.loadErrorTitle', "Couldn't load analytics")}
        description={t('farmer.analytics.loadErrorDescription', 'Check your connection and try again.')}
        actionLabel={t('common.retry')}
        onAction={load}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <StatCard
          label={t('farmer.analytics.listingViewsLabel', 'Listing Views')}
          value={analytics.totalListingViews}
          accent={theme.moduleAccents.marketplace}
        />
        <StatCard
          label={t('farmer.analytics.ordersLabel', 'Orders')}
          value={analytics.totalOrders}
          accent={theme.moduleAccents.orders}
        />
        <StatCard
          label={t('farmer.analytics.salesLabel', 'Sales')}
          value={`Rs. ${analytics.totalSales.toFixed(0)}`}
          accent={theme.moduleAccents.payments}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('farmer.analytics.popularProductsTitle', 'Popular Products')}</Text>
      <BarChart
        data={analytics.popularProducts.map(p => ({ label: p.title, value: p.unitsSold }))}
        color={theme.roleColors.farmer}
        emptyMessage={t('farmer.analytics.noSalesMessage', 'No completed sales yet')}
      />

      <ActivityFeed
        title={t('farmer.analytics.topProductsByRevenueTitle', 'Top Products by Revenue')}
        emptyMessage={t('farmer.analytics.noSalesMessage', 'No completed sales yet')}
        items={analytics.popularProducts.map(p => ({
          id: p.listingId,
          title: p.title,
          subtitle: t('farmer.analytics.unitsSoldSuffix', '{{count}} units sold', { count: p.unitsSold }),
          value: `Rs. ${p.revenue.toFixed(0)}`,
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
