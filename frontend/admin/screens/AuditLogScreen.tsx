import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ChevronDown, ChevronUp, ScrollText } from 'lucide-react-native';
import { Badge, ScreenState, SelectField } from '../../common/components';
import { useAuditEvents, useAuditLogs } from '../hooks/admin';
import { useTheme, type Theme } from '../../theme';
import type { AuditLogEntryWithActor } from '../types/audit';

const WHEN = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// The SelectField's "every event" option; never an SRDS §51 event name, which are lower_snake_case.
const ALL = 'all';

// The tables the audit trail names as targets, in the words an admin uses. Anything else falls back to its name with the
// schema and underscores taken off (see `targetName`).
const TARGET_NAMES: Record<string, string> = {
  profiles: 'user',
  'auth.users': 'admin account',
  listings: 'listing',
  categories: 'category',
  reports: 'report',
  reviews: 'review',
  orders: 'order',
  order: 'order',
  consultations: 'consultation',
  messages: 'message',
  required_documents: 'required document',
};

function targetName(entity: string): string {
  return TARGET_NAMES[entity] ?? entity.replace(/^.*\./, '').replace(/_/g, ' ');
}

/** One audit entry as a sentence: who, what (the SRDS §51 label), which target, and when. */
function auditSummary(item: AuditLogEntryWithActor): string {
  const who = item.actor?.full_name || 'System';
  const what = item.action_label || item.action;
  const target = `${targetName(item.target_entity)}${item.target_id ? ` ${item.target_id.slice(0, 8)}` : ''}`;
  return `${what} by ${who}, on ${target}, ${WHEN.format(new Date(item.created_at))}`;
}

function readable(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'none';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/** The before and after of an entry, one changed field per line ("status: active to inactive"), never a raw object. */
function auditChanges(item: AuditLogEntryWithActor): string[] {
  const before = item.previous_state ?? {};
  const after = item.new_state ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const lines = keys.map(key => {
    const field = key.replace(/_/g, ' ');
    if (!(key in before)) return `${field}: ${readable(after[key])}`;
    if (!(key in after)) return `${field}: was ${readable(before[key])}`;
    return `${field}: ${readable(before[key])} to ${readable(after[key])}`;
  });
  for (const [key, value] of Object.entries(item.metadata ?? {})) {
    lines.push(`${key.replace(/_/g, ' ')}: ${readable(value)}`);
  }
  return lines;
}

/**
 * Every admin action (BR-15), newest first, under the SRDS §51 event label the API sends with each row. The filter
 * asks the server for one event, from the list of event names the API publishes (/admin/audit-events).
 */
export function AuditLogScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [filter, setFilter] = useState(ALL);
  const logs = useAuditLogs(filter === ALL ? undefined : filter);
  const { refetch } = logs;
  const events = useAuditEvents();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const filterOptions = useMemo(
    () => [
      { id: ALL, label: 'Every event' },
      ...(events.data ?? []).map(event => ({
        id: event.name,
        label: event.label,
      })),
    ],
    [events.data],
  );

  return (
    <View style={styles.container}>
      <SelectField
        label="Event"
        value={filter}
        options={filterOptions}
        onSelect={setFilter}
        loading={events.isPending}
        searchable={filterOptions.length > 8}
      />
      <ScreenState
        query={logs}
        errorTitle="Couldn't load the audit log"
        empty={{
          title: 'No audit log entries yet',
          description: filter === ALL ? undefined : 'Try a different event.',
          icon: ScrollText,
        }}
      >
        {entries => (
          <FlashList
            contentContainerStyle={styles.list}
            data={entries}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <AuditEntry item={item} />}
          />
        )}
      </ScreenState>
    </View>
  );
}

/**
 * One entry, read by TalkBack as one stop: the summary sentence. The details (the before and after) start folded; an
 * entry that has them is a button that unfolds them, with its expanded state announced (A8, A4: each entry used to read
 * as five fragments, raw JSON included).
 */
function AuditEntry({ item }: { item: AuditLogEntryWithActor }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [expanded, setExpanded] = useState(false);
  const changes = auditChanges(item);
  const summary = auditSummary(item);
  const hasDetails = changes.length > 0;
  const Chevron = expanded ? ChevronUp : ChevronDown;

  const body = (
    <>
      <View style={styles.headerRow}>
        <Badge label={item.action_label || item.action} tone="neutral" />
        <Text style={styles.time}>{WHEN.format(new Date(item.created_at))}</Text>
      </View>
      <Text style={styles.summary}>
        <Text style={styles.bold}>{item.actor?.full_name || 'System'}</Text>
        {` · ${targetName(item.target_entity)}${item.target_id ? ` ${item.target_id.slice(0, 8)}` : ''}`}
      </Text>
      {hasDetails ? (
        <View style={styles.toggleRow}>
          <Text style={styles.toggle}>{expanded ? 'Hide details' : 'Show details'}</Text>
          <Chevron color={theme.colors.ink2} size={theme.size.iconSm} />
        </View>
      ) : null}
      {hasDetails && expanded ? (
        <View style={styles.stateBlock}>
          {changes.map(line => (
            <Text key={line} style={styles.change}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );

  if (!hasDetails) {
    return (
      <View style={styles.card} accessible accessibilityLabel={summary}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      style={styles.card}
      onPress={() => setExpanded(open => !open)}
      accessibilityRole="button"
      // Unfolded, the changes join the one stop, so TalkBack reads them as sentences without a second swipe.
      accessibilityLabel={expanded ? `${summary}. ${changes.join('. ')}` : summary}
      accessibilityHint={expanded ? 'Hides the details' : 'Shows what changed'}
      accessibilityState={{ expanded }}
    >
      {body}
    </Pressable>
  );
}

function makeStyles({
  colors,
  space,
  radius,
  typography,
  fontWeight,
  borders,
}: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      paddingTop: space[3],
      paddingHorizontal: space[4],
    },
    list: {
      paddingBottom: space[4],
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      borderRadius: radius.md,
      padding: space[3],
      marginBottom: space[2],
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    time: {
      ...typography.caption,
      color: colors.ink2,
    },
    summary: {
      ...typography.caption,
      color: colors.ink2,
      marginTop: space[2],
    },
    bold: {
      fontWeight: fontWeight.semibold,
      color: colors.ink,
    },
    stateBlock: {
      marginTop: space[2],
      backgroundColor: colors.ground,
      borderRadius: radius.xs,
      padding: space[2],
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[1],
      marginTop: space[2],
    },
    toggle: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink2,
    },
    change: {
      ...typography.caption,
      color: colors.ink2,
    },
  });
}
