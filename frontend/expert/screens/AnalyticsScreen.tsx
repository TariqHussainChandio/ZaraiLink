import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Spinner } from '../../common/components';
import { BarChart } from '../../common/components/dashboards/BarChart';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { useExpertAnalytics } from '../../common/analytics';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';

export function ExpertAnalyticsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const { data: analytics, isPending, error, refetch } = useExpertAnalytics(!!userId);
  const loading = isPending && !!userId;
  const load = () => refetch();

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
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
        <StatTile
          label="Total Consultations"
          value={analytics.totalConsultations}
          accent={theme.colors.module.expert}
        />
        <StatTile
          label="Completed"
          value={analytics.completedConsultations}
          accent={theme.colors.module.expert}
        />
        <StatTile
          label={`Avg Rating (${analytics.reviewCount})`}
          value={analytics.reviewCount ? analytics.averageRating.toFixed(1) : '—'}
          accent={theme.colors.module.expert}
        />
      </View>

      <Text style={styles.sectionTitle}>Consultations by Month</Text>
      <BarChart
        data={analytics.consultationsByMonth.map(m => ({ label: m.month.slice(5), value: m.value }))}
        color={theme.colors.accent.expert.mark}
        emptyMessage="No consultations yet"
      />
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
  });
}
