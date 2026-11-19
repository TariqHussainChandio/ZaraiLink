import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenState, SkeletonList } from '../../common/components';
import { ActivityFeed } from '../../common/components/dashboards/ActivityFeed';
import { BarChart } from '../../common/components/dashboards/BarChart';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { useDealerAnalytics } from '../../common/analytics';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { formatRs } from '../../utils/money';

const UNITS = new Intl.NumberFormat('en-PK');
const MONTH = new Intl.DateTimeFormat('en-PK', { month: 'short' });

/** "2026-03" as "Mar": a month name reads more plainly than its number. Built from parts, so no time zone shifts it. */
function monthLabel(month: string): string {
  const [year, index] = month.split('-').map(Number);
  return year && index ? MONTH.format(new Date(year, index - 1, 1)) : month;
}

export function DealerAnalyticsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const analytics = useDealerAnalytics(!!userId);
  const { refetch } = analytics;

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  return (
    <ScreenState
      // A disabled query (no signed-in user) stays pending forever; it is not loading, so it must not show a skeleton.
      query={{ ...analytics, isPending: analytics.isPending && !!userId }}
      errorTitle="Couldn't load analytics"
      skeleton={<SkeletonList count={3} />}
      isEmpty={() => false}
    >
      {data => (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <View style={styles.statsRow}>
            <StatTile
              label="Total Sales"
              value={formatRs(data.totalSales)}
              accent={theme.colors.module.payments}
            />
            <StatTile label="Total Orders" value={data.totalOrders} accent={theme.colors.module.orders} />
            <StatTile label="Low Stock" value={data.lowStockCount} accent={theme.colors.module.dealer} />
          </View>

          <Text style={styles.sectionTitle}>Inventory Movement</Text>
          <BarChart
            data={data.inventoryMovement.map(m => ({ label: monthLabel(m.month), value: m.value }))}
            color={theme.colors.accent.dealer.mark}
            emptyMessage="No recorded stock movement yet"
          />

          <ActivityFeed
            title="Best Sellers"
            emptyMessage="No completed sales yet"
            items={data.bestSellers.map(p => ({
              id: p.listingId,
              title: p.title,
              subtitle: `${formatRs(p.revenue)} revenue`,
              value: `${UNITS.format(p.unitsSold)} units`,
            }))}
          />
        </ScrollView>
      )}
    </ScreenState>
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
