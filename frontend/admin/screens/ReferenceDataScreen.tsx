import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Banner, Button, ChipRow, ListGroup, ListRow, QueryState, ScreenScaffold, Sheet, StickyActionBar, TextField } from '../../common/components';
import { useDeleteRefDataRow, useRefDataRows, useSaveRefDataRow, type RefDataTable } from '../../common/reference-data';
import { errorMessage } from '../../utils/errorMessage';
import { AdminActionSheet, type AdminAction } from '../components/AdminActionSheet';

type Row = Record<string, unknown> & { id: string };

interface FieldConfig {
  key: string;
  label: string;
  placeholder: string;
}

interface TableConfig {
  /** The list's name, plural: "Currencies". */
  plural: string;
  /** One entry, lower case, for sentences: "currency". */
  singular: string;
  fields: FieldConfig[];
  renderLabel: (row: Row) => string;
  renderSubtitle?: (row: Row) => string;
}

// Written out in full: "Currencies".slice(0, -1) read "Currencie" (AD-15).
const TABLES: Record<RefDataTable, TableConfig> = {
  currencies: {
    plural: 'Currencies',
    singular: 'currency',
    fields: [
      { key: 'code', label: 'Code', placeholder: 'PKR' },
      { key: 'symbol', label: 'Symbol', placeholder: 'Rs' },
      { key: 'name', label: 'Name', placeholder: 'Pakistani rupee' },
    ],
    renderLabel: r => `${String(r.code)} — ${String(r.name)}`,
  },
  units: {
    plural: 'Units',
    singular: 'unit',
    fields: [
      { key: 'code', label: 'Code', placeholder: 'kg' },
      { key: 'label', label: 'Name', placeholder: 'Kilogram' },
      { key: 'applies_to', label: 'Used for', placeholder: 'weight' },
    ],
    renderLabel: r => String(r.label),
    renderSubtitle: r => String(r.applies_to ?? ''),
  },
};

const TABLE_OPTIONS: { value: RefDataTable; label: string }[] = [
  { value: 'currencies', label: TABLES.currencies.plural },
  { value: 'units', label: TABLES.units.plural },
];

/** The lists the app offers as choices: currencies and units (SRDS §8). Every change is audited by the API (BR-15). */
export function ReferenceDataScreen() {
  const [table, setTable] = useState<RefDataTable>('currencies');
  const query = useRefDataRows(table);
  const { refetch } = query;
  const rows = useMemo(() => (query.data ?? []) as Row[], [query.data]);
  const saveRow = useSaveRefDataRow(table);
  const removeRow = useDeleteRefDataRow(table);
  const config = TABLES[table];
  const [selected, setSelected] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<AdminAction | null>(null);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const openEditor = (row: Row | 'new') => {
    const initial: Record<string, string> = {};
    for (const field of config.fields) initial[field.key] = row === 'new' ? '' : String(row[field.key] ?? '');
    setSelected(null);
    setForm(initial);
    setErrors({});
    setFailure(null);
    setEditing(row);
  };

  const save = async () => {
    const missing: Record<string, string> = {};
    for (const field of config.fields) {
      if (!form[field.key]?.trim()) missing[field.key] = `Enter the ${field.label.toLowerCase()}`;
    }
    setErrors(missing);
    if (Object.keys(missing).length > 0) return;
    setFailure(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]));
      await saveRow.mutateAsync({ id: editing && editing !== 'new' ? editing.id : undefined, row: payload });
      setEditing(null);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (row: Row) => {
    const label = config.renderLabel(row);
    setSelected(null);
    setAction({
      title: `Delete ${label}?`,
      message: `"${label}" is removed from the ${config.singular} list. This cannot be undone.`,
      confirmLabel: `Delete ${config.singular}`,
      destructive: true,
      run: () => removeRow.mutateAsync(row.id),
      done: `${label} deleted`,
    });
  };

  return (
    <>
      <ScreenScaffold
        onRefresh={() => refetch()}
        refreshing={query.isRefetching}
        footer={
          <StickyActionBar>
            <Button label={`Add a ${config.singular}`} size="lg" onPress={() => openEditor('new')} />
          </StickyActionBar>
        }
      >
        <ChipRow options={TABLE_OPTIONS} value={table} onChange={setTable} />
        <QueryState
          query={query}
          failureTitle={`Couldn't load ${config.plural.toLowerCase()}`}
          isEmpty={rows.length === 0}
          empty={{ title: `No ${config.plural.toLowerCase()} yet`, description: `Add the first ${config.singular}.` }}
        >
          <ListGroup>
            {rows.map(row => (
              <ListRow key={row.id} title={config.renderLabel(row)} meta={config.renderSubtitle?.(row) || undefined} onPress={() => setSelected(row)} />
            ))}
          </ListGroup>
        </QueryState>
      </ScreenScaffold>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected ? config.renderLabel(selected) : config.plural}>
        <ListGroup>
          <ListRow title={`Edit ${config.singular}`} onPress={() => selected && openEditor(selected)} />
          <ListRow title={`Delete ${config.singular}`} onPress={() => selected && askDelete(selected)} />
        </ListGroup>
      </Sheet>

      <Sheet
        visible={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing === 'new' ? `New ${config.singular}` : `Edit ${config.singular}`}
        footer={<Button label={editing === 'new' ? `Add ${config.singular}` : `Save ${config.singular}`} size="lg" loading={saving} onPress={save} />}
      >
        {config.fields.map(field => (
          <TextField
            key={field.key}
            label={field.label}
            placeholder={field.placeholder}
            value={form[field.key] ?? ''}
            onChangeText={text => setForm(prev => ({ ...prev, [field.key]: text }))}
            error={errors[field.key]}
            editable={!saving}
            autoCapitalize="none"
          />
        ))}
        {failure ? (
          <Banner tone="danger" title={`Couldn't save the ${config.singular}`}>
            {failure}
          </Banner>
        ) : null}
      </Sheet>

      <AdminActionSheet action={action} onClose={() => setAction(null)} />
    </>
  );
}
