import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenState, SkeletonList } from '../../common/components';
import { ActivityFeed } from '../../common/components/dashboards/ActivityFeed';
import { BarChart } from '../../common/components/dashboards/BarChart';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { useFarmerAnalytics } from '../../common/analytics';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { formatRs } from '../../utils/money';

const UNITS = new Intl.NumberFormat('en-PK');

export function FarmerAnalyticsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const analytics = useFarmerAnalytics(!!userId);
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
              label="Listing Views"
              value={data.totalListingViews}
              accent={theme.colors.module.marketplace}
            />
            <StatTile
              label="Orders"
              value={data.totalOrders}
              accent={theme.colors.module.orders}
            />
            <StatTile
              label="Sales"
              value={formatRs(data.totalSales)}
              accent={theme.colors.module.payments}
            />
          </View>

          <Text style={styles.sectionTitle}>Popular Products</Text>
          <BarChart
            data={data.popularProducts.map(p => ({ label: p.title, value: p.unitsSold }))}
            color={theme.colors.accent.farmer.mark}
            emptyMessage="No completed sales yet"
          />

          <ActivityFeed
            title="Top Products by Revenue"
            emptyMessage="No completed sales yet"
            items={data.popularProducts.map(p => ({
              id: p.listingId,
              title: p.title,
              subtitle: `${UNITS.format(p.unitsSold)} units sold`,
              value: formatRs(p.revenue),
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
