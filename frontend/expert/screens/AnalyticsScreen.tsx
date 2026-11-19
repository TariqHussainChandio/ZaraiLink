import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { QueryState, ScreenScaffold } from '../../common/components';
import { BarChart } from '../../common/components/dashboards/BarChart';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { useExpertAnalytics } from '../../common/analytics';
import { withEmptyMonths } from '../utils/months';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { formatMonth } from '../../utils/dates';

export function ExpertAnalyticsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const query = useExpertAnalytics(!!userId);
  const { data: analytics, refetch } = query;

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  // Month names, with the months that had nothing drawn as 0: "Sep 4, Oct 0, Nov 2" reads as a run of months.
  const months = useMemo(
    () =>
      withEmptyMonths(analytics?.consultationsByMonth ?? []).map(m => ({
        label: formatMonth(m.month),
        value: m.value,
      })),
    [analytics],
  );
  const spoken = `Consultations by month: ${months.map(m => `${m.label} ${m.value}`).join(', ')}`;

  return (
    <ScreenScaffold onRefresh={refetch} refreshing={query.isRefetching && !query.isPending} testID="expert-analytics">
      <QueryState query={query} failureTitle="Couldn't load analytics">
        {analytics ? (
          <>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <StatTile label="Total consultations" value={analytics.totalConsultations} />
              </View>
              <View style={styles.stat}>
                <StatTile label="Completed" value={analytics.completedConsultations} />
              </View>
              <View style={styles.stat}>
                <StatTile
                  label="Average rating"
                  value={analytics.reviewCount ? analytics.averageRating.toFixed(1) : null}
                  unit={analytics.reviewCount ? 'out of 5' : undefined}
                  note={
                    analytics.reviewCount
                      ? `from ${analytics.reviewCount} ${analytics.reviewCount === 1 ? 'review' : 'reviews'}`
                      : 'No reviews yet'
                  }
                />
              </View>
            </View>

            <Text style={styles.sectionTitle} accessibilityRole="header">
              Consultations by month
            </Text>
            <BarChart data={months} accessibilityLabel={spoken} emptyMessage="No consultations yet" />
          </>
        ) : null}
      </QueryState>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
    stat: { flexGrow: 1, flexBasis: '45%' },
    sectionTitle: { ...typography.title, color: colors.ink },
  });
}
