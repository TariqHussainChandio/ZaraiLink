import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../components/ui';
import { BarChart } from '../../components/features/dashboards/BarChart';
import { StatCard } from '../../components/features/dashboards/StatCard';
import { fetchAdminAnalytics } from '../../services/modules/analytics/analyticsService';
import { lightTheme } from '../../theme';
import type { AdminAnalytics } from '../../types/analytics';

const { colors, spacing, typography, roleColors } = lightTheme;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function AdminAnalyticsScreen() {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchAdminAnalytics().then(data => {
        if (cancelled) return;
        setAnalytics(data);
        setLoading(false);
      }).catch(err => {
        console.warn('[AdminAnalyticsScreen] failed to load analytics:', err);
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (loading || !analytics) return <Spinner fullscreen />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <StatCard label="Total Users" value={Object.values(analytics.usersByRole).reduce((a, b) => a + b, 0)} />
        <StatCard label="Total Listings" value={analytics.totalListings} />
        <StatCard label="Active Listings" value={analytics.activeListings} />
      </View>

      <Text style={styles.sectionTitle}>User Growth</Text>
      <BarChart
        data={analytics.userGrowth.map(m => ({ label: m.month.slice(5), value: m.value }))}
        color={roleColors.admin}
        emptyMessage="No signups yet"
      />

      <View style={styles.statsRow}>
        <StatCard label="Total Orders" value={analytics.totalOrders} />
        <StatCard label="Payments Total" value={`Rs. ${analytics.paymentsTotal.toFixed(0)}`} />
        <StatCard label="Pending Verifications" value={analytics.pendingExpertVerifications} />
      </View>

      <Text style={styles.sectionTitle}>Order Volume</Text>
      <BarChart
        data={analytics.orderVolume.map(m => ({ label: m.month.slice(5), value: m.value }))}
        color={roleColors.admin}
        emptyMessage="No orders yet"
      />

      <Text style={styles.sectionTitle}>Payments by Status</Text>
      <View style={styles.statsRow}>
        {Object.entries(analytics.paymentsByStatus).map(([status, count]) => (
          <StatCard key={status} label={capitalize(status)} value={count} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Reports by Status</Text>
      <View style={styles.statsRow}>
        {Object.entries(analytics.reportsByStatus).map(([status, count]) => (
          <StatCard key={status} label={capitalize(status)} value={count} />
        ))}
      </View>

      <Text style={styles.footnote}>
        Consultation resolution rate: {(analytics.consultationResolutionRate * 100).toFixed(0)}% ·
        Approved experts: {analytics.approvedExperts}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
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
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
    marginBottom: spacing.sm,
  },
  footnote: {
    marginTop: spacing.lg,
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray500,
    textAlign: 'center',
  },
});
