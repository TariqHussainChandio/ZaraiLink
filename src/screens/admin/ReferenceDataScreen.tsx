import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, FilterChips, Input, SelectField, Sheet, Spinner } from '../../components/ui';
import {
  createRefDataRow,
  deleteRefDataRow,
  fetchRefDataRows,
  updateRefDataRow,
  type RefDataTable,
} from '../../services/modules/reference-data/referenceDataService';
import { useReferenceDataStore } from '../../store/referenceDataStore';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';

const { colors, spacing, typography } = lightTheme;

type Row = Record<string, unknown> & { id: string };

interface FieldConfig {
  key: string;
  label: string;
  kind: 'text' | 'parentSelect';
  parentTable?: RefDataTable;
}

interface TableConfig {
  title: string;
  fields: FieldConfig[];
  renderLabel: (row: Row) => string;
  renderSubtitle?: (row: Row) => string;
}

const TABLE_CONFIG: Record<RefDataTable, TableConfig> = {
  countries: {
    title: 'Countries',
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'iso_code', label: 'ISO Code', kind: 'text' },
    ],
    renderLabel: r => String(r.name),
    renderSubtitle: r => String(r.iso_code),
  },
  provinces: {
    title: 'Provinces',
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'country_id', label: 'Country', kind: 'parentSelect', parentTable: 'countries' },
    ],
    renderLabel: r => String(r.name),
  },
  cities: {
    title: 'Cities',
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'province_id', label: 'Province', kind: 'parentSelect', parentTable: 'provinces' },
    ],
    renderLabel: r => String(r.name),
  },
  phone_codes: {
    title: 'Phone Codes',
    fields: [
      { key: 'country_id', label: 'Country', kind: 'parentSelect', parentTable: 'countries' },
      { key: 'calling_code', label: 'Calling Code', kind: 'text' },
    ],
    renderLabel: r => String(r.calling_code),
  },
  currencies: {
    title: 'Currencies',
    fields: [
      { key: 'code', label: 'Code', kind: 'text' },
      { key: 'symbol', label: 'Symbol', kind: 'text' },
      { key: 'name', label: 'Name', kind: 'text' },
    ],
    renderLabel: r => `${String(r.code)} — ${String(r.name)}`,
  },
  units: {
    title: 'Units',
    fields: [
      { key: 'code', label: 'Code', kind: 'text' },
      { key: 'label', label: 'Label', kind: 'text' },
      { key: 'applies_to', label: 'Applies To', kind: 'text' },
    ],
    renderLabel: r => String(r.label),
    renderSubtitle: r => String(r.applies_to ?? ''),
  },
};

const TABLE_OPTIONS: { value: RefDataTable; label: string }[] = [
  { value: 'countries', label: 'Countries' },
  { value: 'provinces', label: 'Provinces' },
  { value: 'cities', label: 'Cities' },
  { value: 'phone_codes', label: 'Phone Codes' },
  { value: 'currencies', label: 'Currencies' },
  { value: 'units', label: 'Units' },
];

export function ReferenceDataScreen() {
  const actorId = useAuthStore(state => state.user?.id);
  const invalidateAll = useReferenceDataStore(state => state.invalidateAll);

  const [table, setTable] = useState<RefDataTable>('countries');
  const [rows, setRows] = useState<Row[]>([]);
  const [parentRows, setParentRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const config = TABLE_CONFIG[table];
  const parentField = config.fields.find(f => f.kind === 'parentSelect');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchRefDataRows(table);
    setRows(data as Row[]);
    if (parentField?.parentTable) {
      setParentRows((await fetchRefDataRows(parentField.parentTable)) as Row[]);
    } else {
      setParentRows([]);
    }
    setLoading(false);
    // parentField is derived from `table` every render, safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    setForm({});
  }, [table]);

  const parentLabel = (id: unknown) => {
    const parent = parentRows.find(p => p.id === id);
    if (!parent) return null;
    return parentField?.parentTable === 'countries'
      ? `${parent.name} (${parent.iso_code ?? ''})`
      : String(parent.name);
  };

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
    Alert.alert('Delete row', `Delete "${config.renderLabel(row)}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
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
    ]);
  };

  return (
    <View style={styles.container}>
      <FilterChips options={TABLE_OPTIONS} value={table} onChange={setTable} />

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
                  label="Edit"
                  variant="secondary"
                  fullWidth={false}
                  loading={savingId === item.id}
                  onPress={() => openEdit(item)}
                />
                <Button
                  label="Delete"
                  variant="destructive"
                  fullWidth={false}
                  loading={savingId === item.id}
                  onPress={() => remove(item)}
                />
              </View>
            </View>
          )}
          ListFooterComponent={
            <Button label={`+ Add ${config.title.slice(0, -1)}`} variant="secondary" onPress={openCreate} style={styles.addButton} />
          }
        />
      )}

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text style={styles.sheetTitle}>{editing ? `Edit ${config.title.slice(0, -1)}` : `New ${config.title.slice(0, -1)}`}</Text>
        {config.fields.map(field =>
          field.kind === 'parentSelect' ? (
            <SelectField
              key={field.key}
              label={field.label}
              value={form[field.key] || null}
              options={parentRows.map(p => ({ id: p.id, label: parentLabel(p.id) ?? String(p.id) }))}
              onSelect={id => setForm(prev => ({ ...prev, [field.key]: id }))}
            />
          ) : (
            <Input
              key={field.key}
              label={field.label}
              value={form[field.key] ?? ''}
              onChangeText={text => setForm(prev => ({ ...prev, [field.key]: text }))}
            />
          ),
        )}
        <Button label={editing ? 'Save Changes' : 'Create'} loading={savingId === (editing?.id ?? 'new')} onPress={save} />
      </Sheet>
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
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.gray100,
  },
  info: {
    marginBottom: spacing.sm,
  },
  name: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray500,
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
    color: colors.neutral.gray900,
    marginBottom: spacing.lg,
  },
});
