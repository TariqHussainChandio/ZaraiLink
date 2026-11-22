import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ListGroup, ListRow, QueryState, ScreenScaffold } from '../../common/components';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { useFarmerAnalytics } from '../../common/analytics';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { formatRs } from '../../utils/money';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The farmer's sales picture (FA-24): the totals as tiles, then the products ranked by what they earned. One list, not a
 * chart and a list saying the same thing. The API sends totals and a product ranking, not a month-by-month series, so
 * there is no month axis to name. */
export function FarmerAnalyticsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const query = useFarmerAnalytics(!!userId);
  const { data: analytics, refetch } = query;

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  const reload = () => {
    refetch();
  };

  // Highest earner first; the API ranks by units sold, which is not what "top" means to someone selling produce.
  const ranked = useMemo(() => [...(analytics?.popularProducts ?? [])].sort((a, b) => b.revenue - a.revenue), [analytics]);

  return (
    <ScreenScaffold onRefresh={reload} refreshing={query.isRefetching && !query.isPending}>
      <QueryState query={query} failureTitle="Couldn't load your analytics">
        {analytics ? (
          <>
            {/* Said in words first: the figures below are tiles, and the ranking is a list, so this is the one-line summary. */}
            <Text style={styles.summary} accessibilityRole="header">
              {`${formatRs(analytics.totalSales)} in completed sales`}
            </Text>

            <View style={styles.tiles}>
              <StatTile label="Sales" value={formatRs(analytics.totalSales)} note="From completed orders" />
              <StatTile label="Orders" value={analytics.totalOrders} note="Received, any status" />
              <StatTile label="Listing views" value={analytics.totalListingViews} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top products by sales</Text>
              {ranked.length === 0 ? (
                <Text style={styles.empty}>No completed sales yet. Your best sellers will be ranked here.</Text>
              ) : (
                <ListGroup>
                  {ranked.map((product, index) => (
                    <ListRow
                      key={product.listingId}
                      title={`${index + 1}. ${product.title}`}
                      meta={plural(product.unitsSold, 'unit sold', 'units sold')}
                      trailing={<Text style={styles.revenue}>{formatRs(product.revenue)}</Text>}
                    />
                  ))}
                </ListGroup>
              )}
            </View>
          </>
        ) : null}
      </QueryState>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    summary: { ...typography.titleLg, color: colors.ink },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
    section: { gap: space[2] },
    sectionTitle: { ...typography.title, color: colors.ink },
    empty: { ...typography.body, color: colors.ink2 },
    revenue: { ...typography.price, color: colors.ink },
  });
}
