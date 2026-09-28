import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Badge, EmptyState, FilterChips, Spinner } from '../../common/components';
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
      <FilterChips options={filterOptions} value={filter} onChange={setFilter} />
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
              <Text style={styles.bold}>{item.actor?.full_name ?? 'System'}</Text> · {item.target_entity}
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

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
      paddingTop: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    list: {
      paddingBottom: spacing.lg,
    },
    card: {
      backgroundColor: colors.background.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    time: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
    summary: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
      marginTop: spacing.sm,
    },
    bold: {
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
    },
    stateBlock: {
      marginTop: spacing.sm,
      backgroundColor: colors.background.default,
      borderRadius: radii.sm,
      padding: spacing.sm,
    },
    mono: {
      fontFamily: 'monospace',
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
  });
}
