import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Spinner } from '../../common/components';
import { BarChart } from '../../common/components/dashboards/BarChart';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { statusMeta } from '../../common/constants/status';
import { useAdminAnalytics } from '../hooks/admin';
import { useTheme, type Theme } from '../../theme';
import { formatRs } from '../../utils/money';

export function AdminAnalyticsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { data: analytics, isPending: loading, error, refetch } = useAdminAnalytics();
  const load = () => refetch();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
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
        <StatTile label="Total Users" value={Object.values(analytics.usersByRole).reduce((a, b) => a + b, 0)} accent={theme.colors.accent.admin.mark} />
        <StatTile label="Total Listings" value={analytics.totalListings} accent={theme.colors.module.marketplace} />
        <StatTile label="Active Listings" value={analytics.activeListings} accent={theme.colors.module.marketplace} />
      </View>

      <Text style={styles.sectionTitle}>User Growth</Text>
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

      <Text style={styles.sectionTitle}>Order Volume</Text>
      <BarChart
        data={analytics.orderVolume.map(m => ({ label: m.month.slice(5), value: m.value }))}
        color={theme.colors.accent.admin.mark}
        emptyMessage="No orders yet"
      />

      <Text style={styles.sectionTitle}>Payments by Status</Text>
      <View style={styles.statsRow}>
        {Object.entries(analytics.paymentsByStatus).map(([status, count]) => (
          <StatTile key={status} label={statusMeta('payment', status).label} value={count} accent={theme.colors.module.payments} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Reports by Status</Text>
      <View style={styles.statsRow}>
        {Object.entries(analytics.reportsByStatus).map(([status, count]) => (
          <StatTile key={status} label={statusMeta('report', status).label} value={count} accent={theme.colors.accent.admin.mark} />
        ))}
      </View>

      <Text style={styles.footnote}>
        {`Consultation resolution rate: ${(analytics.consultationResolutionRate * 100).toFixed(0)}% · Approved experts: ${analytics.approvedExperts}`}
      </Text>
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
    footnote: {
      marginTop: space[4],
      ...typography.caption,
      color: colors.ink2,
      textAlign: 'center',
    },
  });
}
