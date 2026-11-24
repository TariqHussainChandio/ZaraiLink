// Dealer: analytics screen with monthly units sold from stock and the best sellers.
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
import { formatMonth } from '../../utils/dates';
import { formatRs } from '../../utils/money';

// Number format and chart title used on this screen.
const UNITS = new Intl.NumberFormat('en-PK');
const CHART_TITLE = 'Units sold from stock, by month';

// Shows the dealer's sales analytics, refreshed each time the screen opens.
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
            <StatTile label="Total sales" value={formatRs(data.totalSales)} accent={theme.colors.module.payments} />
            <StatTile label="Total orders" value={data.totalOrders} accent={theme.colors.module.orders} />
            {/* Low stock is a warning, not the dealer's colour: the dealer orange would read as branding (AD-12). */}
            <StatTile label="Low stock" value={data.lowStockCount} tone={data.lowStockCount > 0 ? 'warning' : undefined} />
          </View>

          <Text style={styles.sectionTitle}>{CHART_TITLE}</Text>
          {/* The API adds every sold item in the unit it was sold in (bags, kilograms, litres), so the bars are a count
              of sold units, not of one measure. Per-unit series need the analytics endpoint to group by unit (AD-19). */}
          <Text style={styles.chartNote}>Each bag, kilogram or litre counts as one unit.</Text>
          <BarChart
            data={data.inventoryMovement.map(m => ({ label: formatMonth(m.month), value: m.value }))}
            accessibilityLabel={
              data.inventoryMovement.length === 0
                ? `${CHART_TITLE}: no sales yet`
                : `${CHART_TITLE}: ${data.inventoryMovement.map(m => `${formatMonth(m.month)} ${UNITS.format(m.value)}`).join(', ')}`
            }
            emptyMessage="No recorded stock movement yet"
          />

          <ActivityFeed
            title="Best sellers"
            emptyMessage="No completed sales yet"
            items={data.bestSellers.map(p => ({
              id: p.listingId,
              title: p.title,
              subtitle: `${formatRs(p.revenue)} revenue`,
              value: `${UNITS.format(p.unitsSold)} sold`,
            }))}
          />
        </ScrollView>
      )}
    </ScreenState>
  );
}

// Builds this screen's styles from the theme.
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
