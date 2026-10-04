import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Spinner } from '../../common/components';
import { ActivityFeed } from '../../common/components/dashboards/ActivityFeed';
import { BarChart } from '../../common/components/dashboards/BarChart';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { useFarmerAnalytics } from '../../common/analytics';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { formatRs } from '../../utils/money';

export function FarmerAnalyticsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const { data: analytics, isPending, error, refetch } = useFarmerAnalytics(!!userId);
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
          label="Listing Views"
          value={analytics.totalListingViews}
          accent={theme.colors.module.marketplace}
        />
        <StatTile
          label="Orders"
          value={analytics.totalOrders}
          accent={theme.colors.module.orders}
        />
        <StatTile
          label="Sales"
          value={formatRs(analytics.totalSales)}
          accent={theme.colors.module.payments}
        />
      </View>

      <Text style={styles.sectionTitle}>Popular Products</Text>
      <BarChart
        data={analytics.popularProducts.map(p => ({ label: p.title, value: p.unitsSold }))}
        color={theme.colors.accent.farmer.mark}
        emptyMessage="No completed sales yet"
      />

      <ActivityFeed
        title="Top Products by Revenue"
        emptyMessage="No completed sales yet"
        items={analytics.popularProducts.map(p => ({
          id: p.listingId,
          title: p.title,
          subtitle: `${p.unitsSold} units sold`,
          value: formatRs(p.revenue),
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
