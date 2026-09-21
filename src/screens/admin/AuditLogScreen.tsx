import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Badge, EmptyState, FilterChips, Spinner } from '../../components/ui';
import { fetchAuditLogs } from '../../services/modules/admin/adminService';
import { useTheme, type Theme } from '../../theme';
import type { AuditLogEntryWithActor } from '../../types/audit';

export function AuditLogScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
    return [{ value: 'all', label: t('admin.auditLog.all') }, ...entities.map(e => ({ value: e, label: e }))];
  }, [entries, t]);

  const filtered = filter === 'all' ? entries : entries.filter(e => e.target_entity === filter);

  if (loading) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <FilterChips options={filterOptions} value={filter} onChange={setFilter} />
      <FlatList
        contentContainerStyle={styles.list}
        data={filtered}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          <EmptyState
            title={t('admin.auditLog.emptyTitle')}
            description={filter === 'all' ? undefined : t('admin.auditLog.emptyFilteredDescription')}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Badge label={item.action} tone="neutral" />
              <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
            <Text style={styles.summary}>
              <Text style={styles.bold}>{item.actor?.full_name ?? t('admin.auditLog.systemActor')}</Text> · {item.target_entity}
              {item.target_id ? ` #${item.target_id.slice(0, 8)}` : ''}
            </Text>
            {item.previous_state || item.new_state ? (
              <View style={styles.stateBlock}>
                {item.previous_state ? (
                  <Text style={styles.mono}>{t('admin.auditLog.previousState', { state: JSON.stringify(item.previous_state) })}</Text>
                ) : null}
                {item.new_state ? <Text style={styles.mono}>{t('admin.auditLog.newState', { state: JSON.stringify(item.new_state) })}</Text> : null}
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
      fontWeight: typography.weights.semibold as any,
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
