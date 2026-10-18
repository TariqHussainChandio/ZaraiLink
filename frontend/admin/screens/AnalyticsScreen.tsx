import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenState } from '../../common/components';
import { BarChart } from '../../common/components/dashboards/BarChart';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { statusMeta } from '../../common/constants/status';
import { useAdminAnalytics } from '../hooks/admin';
import { useTheme, type Theme } from '../../theme';
import { formatRs } from '../../utils/money';

const percent = new Intl.NumberFormat('en-PK', { style: 'percent', maximumFractionDigits: 0 });
const figure = new Intl.NumberFormat('en-PK');

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

            <Text style={styles.sectionTitle} accessibilityRole="header">User Growth</Text>
            <BarChart
              data={analytics.userGrowth.map(m => ({ label: m.month.slice(5), value: m.value }))}
              color={theme.colors.accent.admin.mark}
              emptyMessage="No signups yet"
            />

            <View style={styles.statsRow}>
              <StatTile label="Total Orders" value={analytics.totalOrders} accent={theme.colors.module.orders} />
              <StatTile label="Payments Total" value={formatRs(analytics.paymentsTotal)} accent={theme.colors.module.payments} />
              <StatTile label="Pending Verifications" value={analytics.pendingExpertVerifications} accent={theme.colors.module.expert} />
            </View>

            <Text style={styles.sectionTitle} accessibilityRole="header">Order Volume</Text>
            <BarChart
              data={analytics.orderVolume.map(m => ({ label: m.month.slice(5), value: m.value }))}
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
    footnote: {
      marginTop: space[4],
      ...typography.caption,
      color: colors.ink2,
      textAlign: 'center',
    },
  });
}
