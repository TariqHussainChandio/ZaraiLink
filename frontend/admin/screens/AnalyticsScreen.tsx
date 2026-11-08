import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { QueryState, ScreenScaffold } from '../../common/components';
import { BarChart } from '../../common/components/dashboards/BarChart';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { statusMeta } from '../../common/constants/status';
import { useAdminAnalytics } from '../hooks/admin';
import { useTheme, type Theme } from '../../theme';
import { formatMonth } from '../../utils/dates';
import { formatRs } from '../../utils/money';

interface Month {
  month: string;
  value: number;
}

/** A chart's bars from the API's "2026-05" months: "May", with the spoken summary "New users each month: May 12, Jun 18". */
function monthly(title: string, months: Month[]) {
  const data = months.map(m => ({ label: formatMonth(m.month), value: m.value }));
  return { data, summary: `${title}: ${data.map(d => `${d.label} ${d.value}`).join(', ')}` };
}

export function AdminAnalyticsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const query = useAdminAnalytics();
  const { data: analytics, refetch } = query;

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const growth = analytics ? monthly('New users each month', analytics.userGrowth) : null;
  const volume = analytics ? monthly('Orders each month', analytics.orderVolume) : null;

  return (
    <ScreenScaffold onRefresh={() => refetch()} refreshing={query.isRefetching}>
      <QueryState query={query} failureTitle="Couldn't load analytics">
        {analytics && growth && volume ? (
          <>
            <View style={styles.tiles}>
              <StatTile label="Users" value={Object.values(analytics.usersByRole).reduce((a, b) => a + b, 0)} />
              <StatTile label="Listings" value={analytics.totalListings} accent={theme.colors.module.marketplace} />
              <StatTile label="Listed now" value={analytics.activeListings} accent={theme.colors.module.marketplace} />
            </View>

            <View>
              <Text style={styles.heading} accessibilityRole="header">
                New users each month
              </Text>
              <BarChart data={growth.data} accessibilityLabel={growth.summary} emptyMessage="No signups yet" />
            </View>

            <View style={styles.tiles}>
              <StatTile label="Orders" value={analytics.totalOrders} accent={theme.colors.module.orders} />
              <StatTile label="Payments" value={formatRs(analytics.paymentsTotal)} accent={theme.colors.module.payments} />
              {/* Experts only: dealers waiting are counted in Approvals. */}
              <StatTile label="Experts waiting for approval" value={analytics.pendingExpertVerifications} accent={theme.colors.module.expert} />
            </View>

            <View>
              <Text style={styles.heading} accessibilityRole="header">
                Orders each month
              </Text>
              <BarChart data={volume.data} accessibilityLabel={volume.summary} emptyMessage="No orders yet" />
            </View>

            <View>
              <Text style={styles.heading} accessibilityRole="header">
                Payments by status
              </Text>
              <View style={styles.tiles}>
                {Object.entries(analytics.paymentsByStatus).map(([status, count]) => (
                  <StatTile key={status} label={statusMeta('payment', status).label} value={count} accent={theme.colors.module.payments} />
                ))}
              </View>
            </View>

            <View>
              <Text style={styles.heading} accessibilityRole="header">
                Reports by status
              </Text>
              <View style={styles.tiles}>
                {Object.entries(analytics.reportsByStatus).map(([status, count]) => (
                  <StatTile key={status} label={statusMeta('report', status).label} value={count} />
                ))}
              </View>
            </View>

            <Text style={styles.footnote}>
              {`${(analytics.consultationResolutionRate * 100).toFixed(0)}% of consultations resolved · ${analytics.approvedExperts} approved experts`}
            </Text>
          </>
        ) : null}
      </QueryState>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
    heading: { ...typography.bodyStrong, color: colors.ink, marginBottom: space[2] },
    footnote: { ...typography.body, color: colors.ink2 },
  });
}
