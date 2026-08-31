import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { BarChart } from '../../components/features/dashboards/BarChart';
import { StatCard } from '../../components/features/dashboards/StatCard';
import { fetchExpertAnalytics } from '../../services/modules/analytics/analyticsService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { ExpertAnalytics } from '../../types/analytics';

export function ExpertAnalyticsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const [analytics, setAnalytics] = useState<ExpertAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!userId) return () => {};
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchExpertAnalytics().then(data => {
      if (cancelled) return;
      setAnalytics(data);
      setLoading(false);
    }).catch(err => {
      console.warn('[ExpertAnalyticsScreen] failed to load analytics:', err);
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useFocusEffect(useCallback(() => load(), [load]));

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
        <StatCard label="Total Consultations" value={analytics.totalConsultations} accent={theme.moduleAccents.consultation} />
        <StatCard label="Completed" value={analytics.completedConsultations} accent={theme.moduleAccents.consultation} />
        <StatCard
          label={`Avg Rating (${analytics.reviewCount})`}
          value={analytics.reviewCount ? analytics.averageRating.toFixed(1) : '—'}
          accent={theme.moduleAccents.expert}
        />
      </View>

      <Text style={styles.sectionTitle}>Consultations by Month</Text>
      <BarChart
        data={analytics.consultationsByMonth.map(m => ({ label: m.month.slice(5), value: m.value }))}
        color={theme.roleColors.expert}
        emptyMessage="No consultations yet"
      />
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
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
  });
}
