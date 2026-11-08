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
import { formatMonth } from '../../utils/dates';
import { formatRs } from '../../utils/money';

const CHART_TITLE = 'Units sold from stock, by month';

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
          label="Total sales"
          value={formatRs(analytics.totalSales)}
          accent={theme.colors.module.payments}
        />
        <StatTile label="Total orders" value={analytics.totalOrders} accent={theme.colors.module.orders} />
        {/* Low stock is a warning, not the dealer's colour: the dealer orange would read as branding (AD-12). */}
        <StatTile label="Low stock" value={analytics.lowStockCount} tone={analytics.lowStockCount > 0 ? 'warning' : undefined} />
      </View>

      <Text style={styles.sectionTitle}>{CHART_TITLE}</Text>
      {/* The API adds every sold item in the unit it was sold in (bags, kilograms, litres), so the bars are a count of
          sold units, not of one measure. Per-unit series need the analytics endpoint to group by unit (AD-19). */}
      <Text style={styles.chartNote}>Each bag, kilogram or litre counts as one unit.</Text>
      <BarChart
        data={analytics.inventoryMovement.map(m => ({ label: formatMonth(m.month), value: m.value }))}
        accessibilityLabel={
          analytics.inventoryMovement.length === 0
            ? `${CHART_TITLE}: no sales yet`
            : `${CHART_TITLE}: ${analytics.inventoryMovement.map(m => `${formatMonth(m.month)} ${m.value.toLocaleString('en-PK')}`).join(', ')}`
        }
        emptyMessage="No recorded stock movement yet"
      />

      <ActivityFeed
        title="Best sellers"
        emptyMessage="No completed sales yet"
        items={analytics.bestSellers.map(p => ({
          id: p.listingId,
          title: p.title,
          subtitle: `${formatRs(p.revenue)} revenue`,
          value: `${p.unitsSold.toLocaleString('en-PK')} sold`,
        }))}
      />
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    chartNote: { ...typography.caption, color: colors.ink2, marginBottom: space[2] },
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
