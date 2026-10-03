import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Button, EmptyState, ChipRow, TextField, Sheet, Spinner } from '../../common/components';
import {
  useDeleteRefDataRow,
  useRefDataRows,
  useSaveRefDataRow,
  type RefDataTable,
} from '../../common/reference-data';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';

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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const actorId = useAuthStore(state => state.user?.id);
  const [table, setTable] = useState<RefDataTable>('currencies');
  const { data: rowData = [], isPending: loading, refetch } = useRefDataRows(table);
  const rows = rowData as Row[];
  const saveRow = useSaveRefDataRow(table);
  const removeRow = useDeleteRefDataRow(table);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const tableConfig: Record<RefDataTable, TableConfig> = useMemo(
    () => ({
      currencies: {
        title: 'Currencies',
        fields: [
          { key: 'code', label: 'Code' },
          { key: 'symbol', label: 'Symbol' },
          { key: 'name', label: 'Name' },
        ],
        renderLabel: r => `${String(r.code)} — ${String(r.name)}`,
      },
      units: {
        title: 'Units',
        fields: [
          { key: 'code', label: 'Code' },
          { key: 'label', label: 'Label' },
          { key: 'applies_to', label: 'Applies To' },
        ],
        renderLabel: r => String(r.label),
        renderSubtitle: r => String(r.applies_to ?? ''),
      },
    }),
    [],
  );

  const tableOptions: { value: RefDataTable; label: string }[] = useMemo(
    () => [
      { value: 'currencies', label: 'Currencies' },
      { value: 'units', label: 'Units' },
    ],
    [],
  );

  const config = tableConfig[table];

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

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
      await saveRow.mutateAsync({ id: editing?.id, row: payload });
      setSheetOpen(false);
    } catch (error) {
      Alert.alert('Could not save the entry', errorMessage(error));
    } finally {
      setSavingId(null);
    }
  };

  const remove = (row: Row) => {
    if (!actorId) return;
    Alert.alert(
      'Delete row',
      `Delete "${config.renderLabel(row)}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSavingId(row.id);
            try {
              await removeRow.mutateAsync(row.id);
            } catch (error) {
              Alert.alert('Could not delete the entry', errorMessage(error));
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
      <ChipRow options={tableOptions} value={table}
        onChange={next => {
          setTable(next);
          setForm({});
        }}
      />

      {loading ? (
        <Spinner fullscreen />
      ) : (
        <FlashList
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
                  variant="danger"
                  fullWidth={false}
                  loading={savingId === item.id}
                  onPress={() => remove(item)}
                />
              </View>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              title={`No ${config.title.toLowerCase()} yet`}
              description="Add the first one below."
            />
          }
          ListFooterComponent={
            <Button
              label={`+ Add ${config.title.slice(0, -1)}`}
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
            ? `Edit ${config.title.slice(0, -1)}`
            : `New ${config.title.slice(0, -1)}`}
        </Text>
        {config.fields.map(field => (
          <TextField
            key={field.key}
            label={field.label}
            value={form[field.key] ?? ''}
            onChangeText={text => setForm(prev => ({ ...prev, [field.key]: text }))}
          />
        ))}
        <Button
          label={editing ? 'Save Changes' : 'Create'}
          loading={savingId === (editing?.id ?? 'new')}
          onPress={save}
        />
      </Sheet>
    </View>
  );
}

function makeStyles({ colors, space, typography, borders }: Theme) {
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
    row: {
      paddingVertical: space[3],
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    info: {
      marginBottom: space[2],
    },
    name: {
      ...typography.bodyStrong,
      color: colors.ink,
    },
    subtitle: {
      ...typography.caption,
      color: colors.ink2,
      marginTop: space[1] / 2,
    },
    actions: {
      flexDirection: 'row',
      gap: space[2],
    },
    addButton: {
      marginTop: space[4],
    },
    sheetTitle: {
      ...typography.title,
      color: colors.ink,
      marginBottom: space[4],
    },
  });
}
