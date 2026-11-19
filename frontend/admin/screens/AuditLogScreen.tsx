import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, ListGroup, ListRow, QueryState, ScreenScaffold, SelectField, Sheet, TextField } from '../../common/components';
import { useTheme, type Theme } from '../../theme';
import { formatDay, formatTime, formatWhen } from '../../utils/dates';
import { LoadMore } from '../components/LoadMore';
import { useAuditEvents, useAuditLogPages } from '../hooks/admin';
import type { AuditLogEntryWithActor } from '../types/audit';
import { changeSummary, describeAudit } from '../utils/auditText';

// The event filter's "every event" option; never an SRDS §51 event name, which are lower_snake_case.
const ALL = 'all';
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

/**
 * Every admin action, newest first, in plain words (BR-15, SRDS §51). The event filter asks the server for one §51 event,
 * from the list of event names the API publishes (/admin/audit-events), so no matching entry is missed past the first
 * page; the search box looks through the pages already loaded.
 */
export function AuditLogScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [event, setEvent] = useState(ALL);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AuditLogEntryWithActor | null>(null);
  const events = useAuditEvents();

  const needle = search.trim().toLowerCase();
  const query = useAuditLogPages({ action: event === ALL ? undefined : event }, needle.length > 0);
  const { rows, refetch } = query;

  const eventOptions = useMemo(
    () => [{ id: ALL, label: 'Every event' }, ...(events.data ?? []).map(e => ({ id: e.name, label: e.label }))],
    [events.data],
  );

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const described: Described[] = useMemo(() => {
    return rows
      .map(entry => {
        const d = describeAudit(entry);
        return { entry, sentence: d.sentence, summary: changeSummary(d), reason: d.reason };
      })
      .filter(item => !needle || `${item.sentence} ${item.reason ?? ''}`.toLowerCase().includes(needle));
  }, [rows, needle]);

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
        <SelectField
          label="Event"
          value={event}
          options={eventOptions}
          onSelect={setEvent}
          loading={events.isPending}
          searchable={eventOptions.length > 8}
        />
        <QueryState
          query={query}
          failureTitle="Couldn't load the audit log"
          isEmpty={described.length === 0 && !query.hasNextPage && !query.isFetching}
          empty={
            event === ALL && !needle
              ? { title: 'Nothing logged yet', description: 'Every admin action is recorded here.' }
              : { title: 'Nothing matches', description: 'Try another event or a different name.' }
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
