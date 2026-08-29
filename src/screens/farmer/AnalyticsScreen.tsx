import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../components/ui';
import { ActivityFeed } from '../../components/features/dashboards/ActivityFeed';
import { BarChart } from '../../components/features/dashboards/BarChart';
import { StatCard } from '../../components/features/dashboards/StatCard';
import { fetchFarmerAnalytics } from '../../services/modules/analytics/analyticsService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { FarmerAnalytics } from '../../types/analytics';

const { colors, spacing, typography, roleColors } = lightTheme;

export function FarmerAnalyticsScreen() {
  const userId = useAuthStore(state => state.user?.id);
  const [analytics, setAnalytics] = useState<FarmerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      fetchFarmerAnalytics().then(data => {
        if (cancelled) return;
        setAnalytics(data);
        setLoading(false);
      }).catch(err => {
        console.warn('[FarmerAnalyticsScreen] failed to load analytics:', err);
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
        <StatCard label="Listing Views" value={analytics.totalListingViews} />
        <StatCard label="Orders" value={analytics.totalOrders} />
        <StatCard label="Sales" value={`Rs. ${analytics.totalSales.toFixed(0)}`} />
      </View>

      <Text style={styles.sectionTitle}>Popular Products</Text>
      <BarChart
        data={analytics.popularProducts.map(p => ({ label: p.title, value: p.unitsSold }))}
        color={roleColors.farmer}
        emptyMessage="No completed sales yet"
      />

      <ActivityFeed
        title="Top Products by Revenue"
        emptyMessage="No completed sales yet"
        items={analytics.popularProducts.map(p => ({
          id: p.listingId,
          title: p.title,
          subtitle: `${p.unitsSold} units sold`,
          value: `Rs. ${p.revenue.toFixed(0)}`,
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
