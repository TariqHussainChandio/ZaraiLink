import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenState } from '../../common/components';
import { BarChart, type BarChartDatum } from '../../common/components/dashboards/BarChart';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { statusMeta } from '../../common/constants/status';
import { useAdminAnalytics } from '../hooks/admin';
import { useTheme, type Theme } from '../../theme';
import { formatRs } from '../../utils/money';

const percent = new Intl.NumberFormat('en-PK', { style: 'percent', maximumFractionDigits: 0 });
const figure = new Intl.NumberFormat('en-PK');
const shortMonth = new Intl.DateTimeFormat('en-PK', { month: 'short' });
const longMonth = new Intl.DateTimeFormat('en-PK', { month: 'long', year: 'numeric' });

interface MonthlyPoint {
  month: string;
  value: number;
}

/** "2026-10" as a local date on the first of that month: built from parts, so no time zone can move it a month back. */
function monthDate(month: string): Date {
  const [year = 1970, index = 1] = month.split('-').map(Number);
  return new Date(year, index - 1, 1);
}

/** Bars labelled "Oct" on screen; the API sends "YYYY-MM". */
function monthBars(points: MonthlyPoint[]): BarChartDatum[] {
  return points.map(point => ({ label: shortMonth.format(monthDate(point.month)), value: point.value }));
}

/**
 * The sentence TalkBack reads for a monthly chart, with the month named in full: "User growth, 6 months. Highest:
 * October 2026, 256 sign-ups." The shared summary would say "Highest: 10, 256" from a bare month number (A8, A5).
 */
function monthSummary(title: string, points: MonthlyPoint[], unit: string): string | undefined {
  const [first, ...rest] = points;
  if (!first) return undefined;
  const top = rest.reduce((best, point) => (point.value > best.value ? point : best), first);
  const count = `${points.length} ${points.length === 1 ? 'month' : 'months'}`;
  return `${title}, ${count}. Highest: ${longMonth.format(monthDate(top.month))}, ${figure.format(top.value)} ${unit}.`;
}

export function AdminAnalyticsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const query = useAdminAnalytics();
  const { refetch } = query;

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <View style={styles.container}>
      <ScreenState query={query} errorTitle="Couldn't load analytics">
        {analytics => (
          <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.statsRow}>
              <StatTile label="Total Users" value={Object.values(analytics.usersByRole).reduce((a, b) => a + b, 0)} accent={theme.colors.accent.admin.mark} />
              <StatTile label="Total Listings" value={analytics.totalListings} accent={theme.colors.module.marketplace} />
              <StatTile label="Active Listings" value={analytics.activeListings} accent={theme.colors.module.marketplace} />
            </View>

            {/* The API has no period parameter: each chart shows the months with activity, up to the latest six
                (_group_by_month), so the screen says that instead of offering a period selector it cannot honour. */}
            <Text style={styles.sectionTitle} accessibilityRole="header">User Growth</Text>
            <Text style={styles.caption}>Sign-ups per month, for up to the last six months with activity.</Text>
            <BarChart
              data={monthBars(analytics.userGrowth)}
              accessibilityLabel={monthSummary('User growth', analytics.userGrowth, 'sign-ups')}
              color={theme.colors.accent.admin.mark}
              emptyMessage="No signups yet"
            />

            <View style={styles.statsRow}>
              <StatTile label="Total Orders" value={analytics.totalOrders} accent={theme.colors.module.orders} />
              <StatTile label="Payments Total" value={formatRs(analytics.paymentsTotal)} accent={theme.colors.module.payments} />
              <StatTile label="Pending Verifications" value={analytics.pendingExpertVerifications} accent={theme.colors.module.expert} />
            </View>

            <Text style={styles.sectionTitle} accessibilityRole="header">Order Volume</Text>
            <Text style={styles.caption}>Orders per month, for up to the last six months with activity.</Text>
            <BarChart
              data={monthBars(analytics.orderVolume)}
              accessibilityLabel={monthSummary('Order volume', analytics.orderVolume, 'orders')}
              color={theme.colors.accent.admin.mark}
              emptyMessage="No orders yet"
            />

            <Text style={styles.sectionTitle} accessibilityRole="header">Payments by Status</Text>
            <View style={styles.statsRow}>
              {Object.entries(analytics.paymentsByStatus).map(([status, count]) => (
                <StatTile key={status} label={statusMeta('payment', status).label} value={count} accent={theme.colors.module.payments} />
              ))}
            </View>

            <Text style={styles.sectionTitle} accessibilityRole="header">Reports by Status</Text>
            <View style={styles.statsRow}>
              {Object.entries(analytics.reportsByStatus).map(([status, count]) => (
                <StatTile key={status} label={statusMeta('report', status).label} value={count} accent={theme.colors.accent.admin.mark} />
              ))}
            </View>

            <Text style={styles.footnote}>
              {`Consultation resolution rate: ${percent.format(analytics.consultationResolutionRate)} · Approved experts: ${figure.format(analytics.approvedExperts)}`}
            </Text>
          </ScrollView>
        )}
      </ScreenState>
    </View>
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
    caption: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[2],
    },
    footnote: {
      marginTop: space[4],
      ...typography.caption,
      color: colors.ink2,
      textAlign: 'center',
    },
  });
}
