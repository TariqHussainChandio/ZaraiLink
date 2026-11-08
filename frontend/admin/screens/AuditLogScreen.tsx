import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, ChipRow, ListGroup, ListRow, QueryState, ScreenScaffold, Sheet, TextField } from '../../common/components';
import { useTheme, type Theme } from '../../theme';
import { formatDay, formatTime, formatWhen } from '../../utils/dates';
import { LoadMore } from '../components/LoadMore';
import { useAuditLogPages } from '../hooks/admin';
import type { AuditLogEntryWithActor } from '../types/audit';
import { AUDIT_AREAS, changeSummary, describeAudit } from '../utils/auditText';

const MIN_SHOWN = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The heading over a day's entries: "Today", "Yesterday", then the date. */
function dayHeading(iso: string, now: Date): string {
  const date = new Date(iso);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === new Date(now.getTime() - DAY_MS).toDateString()) return 'Yesterday';
  return formatDay(date, { now });
}

interface Described {
  entry: AuditLogEntryWithActor;
  sentence: string;
  summary: string | null;
  reason: string | null;
}

/** Every admin action, newest first, in plain words (BR-15, SRDS §51). The API pages it and filters on one table, so an
 * area that spans several tables is matched in the app; the search box looks through the pages already loaded. */
export function AuditLogScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [area, setArea] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AuditLogEntryWithActor | null>(null);

  const config = AUDIT_AREAS.find(a => a.value === area) ?? AUDIT_AREAS[0];
  const needle = search.trim().toLowerCase();
  const query = useAuditLogPages(config?.entity, needle.length > 0);
  const { rows, refetch } = query;

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const described: Described[] = useMemo(() => {
    const matching = config?.match ? rows.filter(config.match) : rows;
    return matching
      .map(entry => {
        const d = describeAudit(entry);
        return { entry, sentence: d.sentence, summary: changeSummary(d), reason: d.reason };
      })
      .filter(item => !needle || `${item.sentence} ${item.reason ?? ''}`.toLowerCase().includes(needle));
  }, [rows, config, needle]);

  // An area matched in the app can find little on a page; it keeps asking for older pages until a screenful turns up.
  const { hasNextPage, isFetching, isError, fetchNextPage } = query;
  const sparse = config?.match !== undefined && described.length < MIN_SHOWN;
  useEffect(() => {
    if (sparse && hasNextPage && !isFetching && !isError) fetchNextPage();
  }, [sparse, hasNextPage, isFetching, isError, fetchNextPage]);

  const now = new Date();
  const days: { heading: string; items: Described[] }[] = [];
  for (const item of described) {
    const heading = dayHeading(item.entry.created_at, now);
    const last = days[days.length - 1];
    if (last?.heading === heading) last.items.push(item);
    else days.push({ heading, items: [item] });
  }

  const detail = selected ? describeAudit(selected) : null;

  return (
    <>
      <ScreenScaffold onRefresh={() => refetch()} refreshing={query.isRefetching && !query.isFetchingNextPage}>
        <TextField label="Person or item" placeholder="Search what you have loaded" value={search} onChangeText={setSearch} autoCorrect={false} />
        <ChipRow options={AUDIT_AREAS.map(a => ({ value: a.value, label: a.label }))} value={area} onChange={setArea} />
        <QueryState
          query={query}
          failureTitle="Couldn't load the audit log"
          isEmpty={described.length === 0 && !query.hasNextPage && !query.isFetching}
          empty={
            area === 'all' && !needle
              ? { title: 'Nothing logged yet', description: 'Every admin action is recorded here.' }
              : { title: 'Nothing matches', description: 'Try another area or a different name.' }
          }
        >
          {days.map(day => (
            <View key={day.heading} style={styles.day}>
              <Text style={styles.heading} accessibilityRole="header">
                {day.heading}
              </Text>
              <ListGroup>
                {day.items.map(item => (
                  <ListRow
                    key={item.entry.id}
                    leading={<Avatar name={item.entry.actor?.full_name} size={theme.size.avatarSm} />}
                    title={item.sentence}
                    meta={[formatTime(item.entry.created_at), item.summary, item.reason ? `"${item.reason}"` : null].filter(Boolean).join(' · ')}
                    onPress={() => setSelected(item.entry)}
                  />
                ))}
              </ListGroup>
            </View>
          ))}
          <LoadMore hasMore={!!query.hasNextPage} loading={query.isFetchingNextPage} onLoadMore={() => query.fetchNextPage()} noun="older entries" />
        </QueryState>
      </ScreenScaffold>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title="What happened">
        {selected && detail ? (
          <View style={styles.sheetBody}>
            <Text style={styles.sentence}>{detail.sentence}</Text>
            <Text style={styles.meta}>{formatWhen(selected.created_at)}</Text>
            {detail.changes.length > 0 ? (
              <View>
                <Text style={styles.heading} accessibilityRole="header">
                  Changed
                </Text>
                {detail.changes.map(change => (
                  <Text key={change.label} style={styles.line}>
                    {`${change.label}: ${change.from !== null ? `${change.from} → ` : ''}${change.to}`}
                  </Text>
                ))}
              </View>
            ) : null}
            {detail.reason ? (
              <View>
                <Text style={styles.heading} accessibilityRole="header">
                  Reason given
                </Text>
                <Text style={styles.line}>{detail.reason}</Text>
              </View>
            ) : null}
            <Text style={styles.meta}>{`${detail.item}${selected.target_id ? ` ${selected.target_id.slice(0, 8)}` : ''}`}</Text>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    day: { marginBottom: space[4] },
    heading: { ...typography.bodyStrong, color: colors.ink2, marginBottom: space[2] },
    sheetBody: { gap: space[4] },
    sentence: { ...typography.title, color: colors.ink },
    line: { ...typography.body, color: colors.ink },
    meta: { ...typography.caption, color: colors.ink2 },
  });
}
