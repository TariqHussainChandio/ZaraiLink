import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScanSearch } from 'lucide-react-native';
import { Card, EmptyState, ListRow, ScreenState } from '../../common/components';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { useTheme, type Theme } from '../../theme';
import { useAiActivity } from '../hooks/admin';
import type { AiActivity } from '../types/ai';

const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
const count = new Intl.NumberFormat(undefined);
// The server counts by UTC day, so the date is shown in UTC too; local time could put a day's counts under the next.
const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const sinceLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The AI module at a glance (SRDS §37): scans, failures, low-confidence results and expert referrals over the recent
 * window, then the same per day. Counts only: the admin sees no image and no farmer here.
 */
export function AiActivityScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const query = useAiActivity();
  const { refetch } = query;

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <View style={styles.screen}>
      <ScreenState query={query} errorTitle="Couldn't load AI activity">
        {data => <AiActivityBody data={data} />}
      </ScreenState>
    </View>
  );
}

function AiActivityBody({ data }: { data: AiActivity }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Most recent day first.
  const days = [...data.days].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Last {data.window_days} days, since {sinceLabel.format(new Date(data.since))}.
      </Text>
      <View style={styles.tiles}>
        <StatTile label="Scans" value={data.scans} accent={theme.colors.module.ai} />
        <StatTile label="Failed" value={data.failed} accent={theme.colors.module.ai} />
        <StatTile
          label="Low confidence"
          value={percent.format(data.low_confidence_share)}
          note={`${count.format(data.low_confidence)} of ${count.format(data.predicted)} predictions`}
          accent={theme.colors.module.ai}
        />
        <StatTile label="Expert referrals" value={data.referrals} accent={theme.colors.module.expert} />
      </View>

      <Text style={styles.sectionTitle}>By day</Text>
      {days.length === 0 ? (
        <EmptyState title="No scans in this window" icon={ScanSearch} />
      ) : (
        <Card>
          {days.map(day => (
            <ListRow
              key={day.date}
              title={dayLabel.format(new Date(`${day.date}T00:00:00Z`))}
              meta={[
                `${count.format(day.scans)} scans`,
                `${count.format(day.failed)} failed`,
                `${count.format(day.low_confidence)} low confidence`,
                `${count.format(day.referrals)} referrals`,
              ].join(' · ')}
            />
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    content: { padding: space[4], gap: space[3] },
    intro: { ...typography.caption, color: colors.ink2 },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
    sectionTitle: { ...typography.bodyStrong, color: colors.ink, marginTop: space[3] },
  });
}
