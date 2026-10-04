import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Spinner } from '../../common/components';
import { ActivityFeed } from '../../common/components/dashboards/ActivityFeed';
import { BarChart } from '../../common/components/dashboards/BarChart';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { useDealerAnalytics } from '../../common/analytics';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { formatRs } from '../../utils/money';

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
        <StatTile
          label="Total Sales"
          value={formatRs(analytics.totalSales)}
          accent={theme.colors.module.payments}
        />
        <StatTile label="Total Orders" value={analytics.totalOrders} accent={theme.colors.module.orders} />
        <StatTile label="Low Stock" value={analytics.lowStockCount} accent={theme.colors.module.dealer} />
      </View>

      <Text style={styles.sectionTitle}>Inventory Movement</Text>
      <BarChart
        data={analytics.inventoryMovement.map(m => ({ label: m.month.slice(5), value: m.value }))}
        color={theme.colors.accent.dealer.mark}
        emptyMessage="No recorded stock movement yet"
      />

      <ActivityFeed
        title="Best Sellers"
        emptyMessage="No completed sales yet"
        items={analytics.bestSellers.map(p => ({
          id: p.listingId,
          title: p.title,
          subtitle: `${formatRs(p.revenue)} revenue`,
          value: `${p.unitsSold} units`,
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
      flexWrap: 'wrap',
      gap: space[3],
      marginBottom: space[6],
    },
    sectionTitle: {
      ...typography.bodyStrong,
      color: colors.ink,
      marginBottom: space[2],
    },
  });
}
