import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Badge, EmptyState, ChipRow, Spinner } from '../../common/components';
import { useAuditLogs } from '../hooks/admin';
import { useTheme, type Theme } from '../../theme';

export function AuditLogScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { data: entries = [], isPending: loading, refetch } = useAuditLogs();
  const [filter, setFilter] = useState('all');

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const filterOptions = useMemo(() => {
    const entities = Array.from(new Set(entries.map(e => e.target_entity))).sort();
    return [{ value: 'all', label: 'All' }, ...entities.map(e => ({ value: e, label: e }))];
  }, [entries]);

  const filtered = filter === 'all' ? entries : entries.filter(e => e.target_entity === filter);

  if (loading) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <ChipRow options={filterOptions} value={filter} onChange={setFilter} />
      <FlashList
        contentContainerStyle={styles.list}
        data={filtered}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          <EmptyState
            title="No audit log entries yet"
            description={filter === 'all' ? undefined : 'Try a different entity filter.'}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Badge label={item.action} tone="neutral" />
              <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
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
    </View>
  );
}

function makeStyles({ colors, space, radius, typography, fontWeight, borders }: Theme) {
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
