import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { ActivityFeed } from '../../components/features/dashboards/ActivityFeed';
import { BarChart } from '../../components/features/dashboards/BarChart';
import { StatCard } from '../../components/features/dashboards/StatCard';
import { useDealerAnalytics } from '../../hooks/api/analytics';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';

export function DealerAnalyticsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const { data: analytics, isPending, error, refetch } = useDealerAnalytics(!!userId);
  const loading = isPending && !!userId;
  const load = () => refetch();

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  if (loading) return <Spinner fullscreen />;
  if (error || !analytics) {
    return (
      <EmptyState
        title="Couldn't load analytics"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <StatCard
          label="Total Sales"
          value={`Rs. ${analytics.totalSales.toFixed(0)}`}
          accent={theme.moduleAccents.payments}
        />
        <StatCard label="Total Orders" value={analytics.totalOrders} accent={theme.moduleAccents.orders} />
        <StatCard label="Low Stock" value={analytics.lowStockCount} accent={theme.moduleAccents.inventory} />
      </View>

      <Text style={styles.sectionTitle}>Inventory Movement</Text>
      <BarChart
        data={analytics.inventoryMovement.map(m => ({ label: m.month.slice(5), value: m.value }))}
        color={theme.roleColors.dealer}
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
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
  });
}
