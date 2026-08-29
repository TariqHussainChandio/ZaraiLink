import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../components/ui';
import { ActivityFeed } from '../../components/features/dashboards/ActivityFeed';
import { BarChart } from '../../components/features/dashboards/BarChart';
import { StatCard } from '../../components/features/dashboards/StatCard';
import { fetchDealerAnalytics } from '../../services/modules/analytics/analyticsService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { DealerAnalytics } from '../../types/analytics';

const { colors, spacing, typography, roleColors } = lightTheme;

export function DealerAnalyticsScreen() {
  const userId = useAuthStore(state => state.user?.id);
  const [analytics, setAnalytics] = useState<DealerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      fetchDealerAnalytics().then(data => {
        if (cancelled) return;
        setAnalytics(data);
        setLoading(false);
      }).catch(err => {
        console.warn('[DealerAnalyticsScreen] failed to load analytics:', err);
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  if (loading || !analytics) return <Spinner fullscreen />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <StatCard label="Total Sales" value={`Rs. ${analytics.totalSales.toFixed(0)}`} />
        <StatCard label="Total Orders" value={analytics.totalOrders} />
        <StatCard label="Low Stock" value={analytics.lowStockCount} />
      </View>

      <Text style={styles.sectionTitle}>Inventory Movement</Text>
      <BarChart
        data={analytics.inventoryMovement.map(m => ({ label: m.month.slice(5), value: m.value }))}
        color={roleColors.dealer}
        emptyMessage="No recorded stock movement yet"
      />

      <ActivityFeed
        title="Best Sellers"
        emptyMessage="No completed sales yet"
        items={analytics.bestSellers.map(p => ({
          id: p.listingId,
          title: p.title,
          subtitle: `Rs. ${p.revenue.toFixed(0)} revenue`,
          value: `${p.unitsSold} units`,
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
    flexWrap: 'wrap',
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
