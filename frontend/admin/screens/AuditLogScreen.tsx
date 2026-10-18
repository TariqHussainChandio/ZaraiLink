import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ScrollText } from 'lucide-react-native';
import { Badge, ScreenState, SelectField } from '../../common/components';
import { useAuditEvents, useAuditLogs } from '../hooks/admin';
import { useTheme, type Theme } from '../../theme';

const WHEN = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// The SelectField's "every event" option; never an SRDS §51 event name, which are lower_snake_case.
const ALL = 'all';

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
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.headerRow}>
                  <Badge label={item.action_label || item.action} tone="neutral" />
                  <Text style={styles.time}>{WHEN.format(new Date(item.created_at))}</Text>
                </View>
                <Text style={styles.summary}>
                  <Text style={styles.bold}>{item.actor?.full_name || 'System'}</Text> · {item.target_entity}
                  {item.target_id ? ` #${item.target_id.slice(0, 8)}` : ''}
                </Text>
                {item.previous_state || item.new_state ? (
                  <View style={styles.stateBlock}>
                    {item.previous_state ? (
                      <Text style={styles.mono}>{`previous: ${JSON.stringify(item.previous_state)}`}</Text>
                    ) : null}
                    {item.new_state ? <Text style={styles.mono}>{`new: ${JSON.stringify(item.new_state)}`}</Text> : null}
                  </View>
                ) : null}
              </View>
            )}
          />
        )}
      </ScreenState>
    </View>
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
    // Before and after states are JSON: the theme's mono face keeps keys and values in columns.
    mono: {
      ...typography.code,
      color: colors.ink2,
    },
  });
}
