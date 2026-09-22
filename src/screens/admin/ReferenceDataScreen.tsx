import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, FilterChips, Input, Sheet, Spinner } from '../../components/ui';
import {
  createRefDataRow,
  deleteRefDataRow,
  fetchRefDataRows,
  updateRefDataRow,
  type RefDataTable,
} from '../../services/modules/reference-data/referenceDataService';
import { useReferenceDataStore } from '../../store/referenceDataStore';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';

type Row = Record<string, unknown> & { id: string };

interface FieldConfig {
  key: string;
  label: string;
}

interface TableConfig {
  title: string;
  fields: FieldConfig[];
  renderLabel: (row: Row) => string;
  renderSubtitle?: (row: Row) => string;
}

export function ReferenceDataScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const actorId = useAuthStore(state => state.user?.id);
  const invalidateAll = useReferenceDataStore(state => state.invalidateAll);

  const [table, setTable] = useState<RefDataTable>('currencies');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const tableConfig: Record<RefDataTable, TableConfig> = useMemo(
    () => ({
      currencies: {
        title: t('admin.referenceData.currenciesTitle'),
        fields: [
          { key: 'code', label: t('admin.referenceData.codeLabel') },
          { key: 'symbol', label: t('admin.referenceData.symbolLabel') },
          { key: 'name', label: t('admin.referenceData.nameLabel') },
        ],
        renderLabel: r => `${String(r.code)} — ${String(r.name)}`,
      },
      units: {
        title: t('admin.referenceData.unitsTitle'),
        fields: [
          { key: 'code', label: t('admin.referenceData.codeLabel') },
          { key: 'label', label: t('admin.referenceData.labelLabel') },
          { key: 'applies_to', label: t('admin.referenceData.appliesToLabel') },
        ],
        renderLabel: r => String(r.label),
        renderSubtitle: r => String(r.applies_to ?? ''),
      },
    }),
    [t],
  );

  const tableOptions: { value: RefDataTable; label: string }[] = useMemo(
    () => [
      { value: 'currencies', label: t('admin.referenceData.currenciesTitle') },
      { value: 'units', label: t('admin.referenceData.unitsTitle') },
    ],
    [t],
  );

  const config = tableConfig[table];

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchRefDataRows(table);
    setRows(data as Row[]);
    setLoading(false);
  }, [table]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    setForm({});
  }, [table]);

  const openCreate = () => {
    setEditing(null);
    setForm({});
    setSheetOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    const initial: Record<string, string> = {};
    for (const field of config.fields) initial[field.key] = String(row[field.key] ?? '');
    setForm(initial);
    setSheetOpen(true);
  };

  const save = async () => {
    if (!actorId) return;
    setSavingId(editing?.id ?? 'new');
    try {
      const payload: Record<string, unknown> = { ...form };
      if (editing) {
        await updateRefDataRow(table, editing.id, payload);
      } else {
        await createRefDataRow(table, payload);
      }
      invalidateAll();
      setSheetOpen(false);
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const remove = (row: Row) => {
    if (!actorId) return;
    Alert.alert(
      t('admin.referenceData.deleteConfirmTitle'),
      t('admin.referenceData.deleteConfirmMessage', { label: config.renderLabel(row) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.referenceData.delete'),
          style: 'destructive',
          onPress: async () => {
            setSavingId(row.id);
            try {
              await deleteRefDataRow(table, row.id);
              invalidateAll();
              await load();
            } finally {
              setSavingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <FilterChips options={tableOptions} value={table} onChange={setTable} />

      {loading ? (
        <Spinner fullscreen />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={rows}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.info}>
                <Text style={styles.name}>{config.renderLabel(item)}</Text>
                {config.renderSubtitle ? <Text style={styles.subtitle}>{config.renderSubtitle(item)}</Text> : null}
              </View>
              <View style={styles.actions}>
                <Button
                  label={t('admin.referenceData.edit')}
                  variant="secondary"
                  fullWidth={false}
                  loading={savingId === item.id}
                  onPress={() => openEdit(item)}
                />
                <Button
                  label={t('admin.referenceData.delete')}
                  variant="destructive"
                  fullWidth={false}
                  loading={savingId === item.id}
                  onPress={() => remove(item)}
                />
              </View>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              title={t('admin.referenceData.emptyTitle', { table: config.title.toLowerCase() })}
              description={t('admin.referenceData.emptyDescription')}
            />
          }
          ListFooterComponent={
            <Button
              label={t('admin.referenceData.addButton', { singular: config.title.slice(0, -1) })}
              variant="secondary"
              onPress={openCreate}
              style={styles.addButton}
            />
          }
        />
      )}

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text style={styles.sheetTitle}>
          {editing
            ? t('admin.referenceData.editRowTitle', { singular: config.title.slice(0, -1) })
            : t('admin.referenceData.newRowTitle', { singular: config.title.slice(0, -1) })}
        </Text>
        {config.fields.map(field => (
          <Input
            key={field.key}
            label={field.label}
            value={form[field.key] ?? ''}
            onChangeText={text => setForm(prev => ({ ...prev, [field.key]: text }))}
          />
        ))}
        <Button
          label={editing ? t('admin.referenceData.saveChangesButton') : t('admin.referenceData.createButton')}
          loading={savingId === (editing?.id ?? 'new')}
          onPress={save}
        />
      </Sheet>
    </View>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
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
    row: {
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    info: {
      marginBottom: spacing.sm,
    },
    name: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
      marginTop: spacing.xs / 2,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    addButton: {
      marginTop: spacing.lg,
    },
    sheetTitle: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold as any,
      color: colors.text.primary,
      marginBottom: spacing.lg,
    },
  });
}
