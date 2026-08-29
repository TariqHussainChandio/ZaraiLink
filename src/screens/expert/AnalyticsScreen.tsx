import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../components/ui';
import { BarChart } from '../../components/features/dashboards/BarChart';
import { StatCard } from '../../components/features/dashboards/StatCard';
import { fetchExpertAnalytics } from '../../services/modules/analytics/analyticsService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { ExpertAnalytics } from '../../types/analytics';

const { colors, spacing, typography, roleColors } = lightTheme;

export function ExpertAnalyticsScreen() {
  const userId = useAuthStore(state => state.user?.id);
  const [analytics, setAnalytics] = useState<ExpertAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      fetchExpertAnalytics().then(data => {
        if (cancelled) return;
        setAnalytics(data);
        setLoading(false);
      }).catch(err => {
        console.warn('[ExpertAnalyticsScreen] failed to load analytics:', err);
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  if (loading || !analytics) return <Spinner fullscreen />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <StatCard label="Total Consultations" value={analytics.totalConsultations} />
        <StatCard label="Completed" value={analytics.completedConsultations} />
        <StatCard
          label={`Avg Rating (${analytics.reviewCount})`}
          value={analytics.reviewCount ? analytics.averageRating.toFixed(1) : '—'}
        />
      </View>

      <Text style={styles.sectionTitle}>Consultations by Month</Text>
      <BarChart
        data={analytics.consultationsByMonth.map(m => ({ label: m.month.slice(5), value: m.value }))}
        color={roleColors.expert}
        emptyMessage="No consultations yet"
      />
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
});
