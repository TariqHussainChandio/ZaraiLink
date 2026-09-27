import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { BarChart } from '../../components/features/dashboards/BarChart';
import { StatCard } from '../../components/features/dashboards/StatCard';
import { useAdminAnalytics } from '../../hooks/api/admin';
import { useTheme, type Theme } from '../../theme';

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

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
        <StatCard label="Total Users" value={Object.values(analytics.usersByRole).reduce((a, b) => a + b, 0)} accent={theme.moduleAccents.admin} />
        <StatCard label="Total Listings" value={analytics.totalListings} accent={theme.moduleAccents.marketplace} />
        <StatCard label="Active Listings" value={analytics.activeListings} accent={theme.moduleAccents.marketplace} />
      </View>

      <Text style={styles.sectionTitle}>User Growth</Text>
      <BarChart
        data={analytics.userGrowth.map(m => ({ label: m.month.slice(5), value: m.value }))}
        color={theme.roleColors.admin}
        emptyMessage="No signups yet"
      />

      <View style={styles.statsRow}>
        <StatCard label="Total Orders" value={analytics.totalOrders} accent={theme.moduleAccents.orders} />
        <StatCard label="Payments Total" value={`${'Rs. '}${analytics.paymentsTotal.toFixed(0)}`} accent={theme.moduleAccents.payments} />
        <StatCard label="Pending Verifications" value={analytics.pendingExpertVerifications} accent={theme.moduleAccents.expert} />
      </View>

      <Text style={styles.sectionTitle}>Order Volume</Text>
      <BarChart
        data={analytics.orderVolume.map(m => ({ label: m.month.slice(5), value: m.value }))}
        color={theme.roleColors.admin}
        emptyMessage="No orders yet"
      />

      <Text style={styles.sectionTitle}>Payments by Status</Text>
      <View style={styles.statsRow}>
        {Object.entries(analytics.paymentsByStatus).map(([status, count]) => (
          <StatCard key={status} label={capitalize(status)} value={count} accent={theme.moduleAccents.payments} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Reports by Status</Text>
      <View style={styles.statsRow}>
        {Object.entries(analytics.reportsByStatus).map(([status, count]) => (
          <StatCard key={status} label={capitalize(status)} value={count} accent={theme.moduleAccents.admin} />
        ))}
      </View>

      <Text style={styles.footnote}>
        {`Consultation resolution rate: ${(analytics.consultationResolutionRate * 100).toFixed(0)}% · Approved experts: ${analytics.approvedExperts}`}
      </Text>
    </ScrollView>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    content: {
      padding: spacing.lg,
    },
    statsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginBottom: spacing.xl,
    },
    sectionTitle: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
    footnote: {
      marginTop: spacing.lg,
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
      textAlign: 'center',
    },
  });
}
