import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  Banner,
  Button,
  type ChipOption,
  ChipRow,
  ListGroup,
  ListRow,
  QueryState,
  ScreenScaffold,
  Sheet,
  StickyActionBar,
  TextField,
} from '../../common/components';
import type { RequiredDocument } from '../../common/auth';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { AdminActionSheet, type AdminAction } from '../components/AdminActionSheet';
import { useAllRequiredDocuments, useSaveRequiredDocument } from '../hooks/admin';

type Role = 'dealer' | 'expert';
const ROLES: ChipOption<Role>[] = [
  { value: 'dealer', label: 'Dealers' },
  { value: 'expert', label: 'Experts' },
];
const NEED: ChipOption<'required' | 'optional'>[] = [
  { value: 'required', label: 'Required' },
  { value: 'optional', label: 'Optional' },
];

// The stable machine name of a new entry, from its label: "Tax certificate" becomes "tax_certificate".
function codeFrom(label: string): string {
  const code = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  return /^[a-z]/.test(code) ? code : `doc_${code}`.slice(0, 50);
}

/**
 * The documents dealers and experts are asked for (SRDS §7: "the exact required documents should be configurable").
 * An entry is never deleted, only retired, because sent documents point at it; every change is audited by the database
 * (BR-15) and needs the second factor. The API stores no reason for a change, so none is asked.
 */
export function RequiredDocumentsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const query = useAllRequiredDocuments();
  const { data = [], refetch } = query;
  const save = useSaveRequiredDocument();
  const [role, setRole] = useState<Role>('dealer');
  const [selected, setSelected] = useState<RequiredDocument | null>(null);
  const [editing, setEditing] = useState<RequiredDocument | 'new' | null>(null);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [need, setNeed] = useState<'required' | 'optional'>('required');
  const [labelError, setLabelError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<AdminAction | null>(null);

  // Active entries first, in the order applicants see them; retired ones after, kept for the documents that use them.
  const shown = data
    .filter(d => d.role === role)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.sort_order - b.sort_order);

  const openEditor = (document: RequiredDocument | 'new') => {
    setSelected(null);
    setLabel(document === 'new' ? '' : document.label);
    setDescription(document === 'new' ? '' : document.description ?? '');
    setNeed(document === 'new' || document.is_required ? 'required' : 'optional');
    setLabelError(undefined);
    setFailure(null);
    setEditing(document);
  };

  const submitEditor = async () => {
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setLabelError('Name the document');
      return;
    }
    const target = editing;
    const common = { label: trimmed, description: description.trim() || null, is_required: need === 'required' };
    setSaving(true);
    setFailure(null);
    try {
      await (target === 'new'
        ? save.mutateAsync({
            input: { ...common, role, code: codeFrom(trimmed), sort_order: Math.max(0, ...shown.map(d => d.sort_order)) + 10 },
          })
        : save.mutateAsync({ id: target?.id, changes: common }));
      setEditing(null);
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const askRetire = (document: RequiredDocument) => {
    const retiring = document.active;
    setSelected(null);
    setAction(
      retiring
        ? {
            title: `Retire ${document.label}?`,
            message: `Applicants are no longer asked for "${document.label}". Documents already sent stay on their applications.`,
            confirmLabel: `Retire ${document.label}`,
            destructive: true,
            run: () => save.mutateAsync({ id: document.id, changes: { active: false } }),
            done: `${document.label} retired`,
            undo: () => save.mutateAsync({ id: document.id, changes: { active: true } }),
          }
        : {
            title: `Ask for ${document.label} again?`,
            message: `Applicants are asked for "${document.label}" again, from the next application.`,
            confirmLabel: `Ask for ${document.label} again`,
            run: () => save.mutateAsync({ id: document.id, changes: { active: true } }),
            done: `${document.label} is asked for again`,
            undo: () => save.mutateAsync({ id: document.id, changes: { active: false } }),
          },
    );
  };

  return (
    <>
      <ScreenScaffold
        onRefresh={() => refetch()}
        refreshing={query.isRefetching}
        footer={
          <StickyActionBar>
            <Button label="Add a document" size="lg" onPress={() => openEditor('new')} />
          </StickyActionBar>
        }
      >
        <ChipRow options={ROLES} value={role} onChange={setRole} />
        <Text style={styles.intro}>
          Applicants must attach every active required document before they can submit. Changes apply to applications sent
          from now on.
        </Text>
        <QueryState
          query={query}
          failureTitle="Couldn't load the document list"
          isEmpty={shown.length === 0}
          empty={{ title: 'No documents yet', description: 'Add the first document applicants should send.' }}
        >
          <ListGroup>
            {shown.map(document => (
              <ListRow
                key={document.id}
                title={document.label}
                meta={document.description ?? undefined}
                status={
                  <Badge
                    label={!document.active ? 'Retired' : document.is_required ? 'Required' : 'Optional'}
                    tone={!document.active ? 'neutral' : document.is_required ? 'info' : 'neutral'}
                    size="sm"
                  />
                }
                onPress={() => setSelected(document)}
              />
            ))}
          </ListGroup>
        </QueryState>
      </ScreenScaffold>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.label ?? 'Document'}>
        <ListGroup>
          <ListRow title="Edit document" onPress={() => selected && openEditor(selected)} />
          <ListRow
            title={selected?.active ? `Retire ${selected.label}` : `Ask for ${selected?.label ?? 'it'} again`}
            onPress={() => selected && askRetire(selected)}
          />
        </ListGroup>
      </Sheet>

      <Sheet
        visible={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing === 'new' ? 'Add a document' : 'Edit document'}
        footer={<Button label="Save document" size="lg" loading={saving} onPress={submitEditor} />}
      >
        <View style={styles.sheet}>
          <TextField label="Name" value={label} onChangeText={setLabel} error={labelError} editable={!saving} />
          <TextField label="What to send" optional value={description} onChangeText={setDescription} multiline editable={!saving} />
          <ChipRow options={NEED} value={need} onChange={setNeed} />
          {failure ? (
            <Banner tone="danger" title="Couldn't save the document">
              {failure}
            </Banner>
          ) : null}
        </View>
      </Sheet>

      <AdminActionSheet action={action} onClose={() => setAction(null)} />
    </>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    intro: { ...typography.body, color: colors.ink2, marginBottom: space[3] },
    sheet: { gap: space[3] },
  });
}
