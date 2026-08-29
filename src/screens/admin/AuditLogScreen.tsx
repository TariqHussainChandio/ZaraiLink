import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Badge, FilterChips, Spinner } from '../../components/ui';
import { fetchAuditLogs } from '../../services/modules/admin/adminService';
import { lightTheme } from '../../theme';
import type { AuditLogEntryWithActor } from '../../types/audit';

const { colors, spacing, typography } = lightTheme;

export function AuditLogScreen() {
  const [entries, setEntries] = useState<AuditLogEntryWithActor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setEntries(await fetchAuditLogs());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
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
      <FlatList
        contentContainerStyle={styles.list}
        data={filtered}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No audit log entries yet.</Text>}
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
                  <Text style={styles.mono}>previous: {JSON.stringify(item.previous_state)}</Text>
                ) : null}
                {item.new_state ? <Text style={styles.mono}>new: {JSON.stringify(item.new_state)}</Text> : null}
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  list: {
    paddingBottom: spacing.lg,
  },
  empty: {
    textAlign: 'center',
    color: colors.neutral.gray500,
    marginTop: spacing.xl,
  },
  card: {
    backgroundColor: colors.neutral.white,
    borderWidth: 1,
    borderColor: colors.neutral.gray200,
    borderRadius: lightTheme.radii.lg,
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
    color: colors.neutral.gray500,
  },
  summary: {
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray700,
    marginTop: spacing.sm,
  },
  bold: {
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  stateBlock: {
    marginTop: spacing.sm,
    backgroundColor: colors.neutral.gray50,
    borderRadius: lightTheme.radii.sm,
    padding: spacing.sm,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray700,
  },
});
