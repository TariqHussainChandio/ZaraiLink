import {
  Archive,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Save,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  Banner,
  Button,
  Card,
  type ChipOption,
  ChipRow,
  EmptyState,
  ScreenState,
  Sheet,
  TextField,
  useToast,
} from '../../common/components';
import type { RequiredDocument } from '../../common/auth';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import {
  useAllRequiredDocuments,
  useSaveRequiredDocument,
} from '../hooks/admin';

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
 * (BR-15) and needs the second factor.
 */
export function RequiredDocumentsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const query = useAllRequiredDocuments();
  const data = query.data ?? [];
  const toast = useToast();
  const save = useSaveRequiredDocument();
  const [role, setRole] = useState<Role>('dealer');
  const [editing, setEditing] = useState<RequiredDocument | 'new' | null>(null);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [need, setNeed] = useState<'required' | 'optional'>('required');
  const [labelError, setLabelError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);

  // Active entries first, in the order applicants see them; retired ones after, kept for the documents that use them.
  const shown = data
    .filter(d => d.role === role)
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) || a.sort_order - b.sort_order,
    );

  const openEditor = (document: RequiredDocument | 'new') => {
    setLabel(document === 'new' ? '' : document.label);
    setDescription(document === 'new' ? '' : (document.description ?? ''));
    setNeed(
      document === 'new' || document.is_required ? 'required' : 'optional',
    );
    setLabelError(undefined);
    setEditing(document);
  };

  const run = async (action: () => Promise<unknown>, done: string) => {
    setFailure(null);
    try {
      await action();
      toast.success(done);
    } catch (err) {
      setFailure(errorMessage(err));
    }
  };

  const submitEditor = async () => {
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setLabelError('Name the document');
      return;
    }
    const target = editing;
    setEditing(null);
    const common = {
      label: trimmed,
      description: description.trim() || null,
      is_required: need === 'required',
    };
    await run(
      () =>
        target === 'new'
          ? save.mutateAsync({
              input: {
                ...common,
                role,
                code: codeFrom(trimmed),
                sort_order: Math.max(0, ...shown.map(d => d.sort_order)) + 10,
              },
            })
          : save.mutateAsync({ id: target?.id, changes: common }),
      target === 'new' ? 'Document added' : 'Document saved',
    );
  };

  if (!query.data)
    return <ScreenState query={query} errorTitle="Couldn't load the list" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* A failed refresh keeps the saved list on screen under a Retry banner. */}
      <ScreenState query={query} errorTitle="Couldn't refresh the list" />
      <ChipRow options={ROLES} value={role} onChange={setRole} />
      <Text style={styles.intro}>
        Applicants must attach every active required document before they can
        submit. Changes apply to applications sent from now on.
      </Text>
      {shown.map(document => (
        <Card key={document.id}>
          <View style={styles.header}>
            <Text style={[styles.title, !document.active && styles.retired]}>
              {document.label}
            </Text>
            <Badge
              label={
                !document.active
                  ? 'Retired'
                  : document.is_required
                    ? 'Required'
                    : 'Optional'
              }
              tone={
                !document.active
                  ? 'neutral'
                  : document.is_required
                    ? 'info'
                    : 'neutral'
              }
              size="sm"
            />
          </View>
          {document.description ? (
            <Text style={styles.description}>{document.description}</Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              label="Edit"
              icon={Pencil}
              variant="secondary"
              size="sm"
              fullWidth={false}
              onPress={() => openEditor(document)}
            />
            <Button
              label={document.active ? 'Retire' : 'Use again'}
              icon={document.active ? Archive : RotateCcw}
              variant="quiet"
              size="sm"
              fullWidth={false}
              onPress={() =>
                run(
                  () =>
                    save.mutateAsync({
                      id: document.id,
                      changes: { active: !document.active },
                    }),
                  document.active
                    ? 'Document retired'
                    : 'Document in use again',
                )
              }
            />
          </View>
        </Card>
      ))}
      {shown.length === 0 ? (
        <EmptyState title="No documents asked for yet" icon={FileText} />
      ) : null}
      {failure ? <Banner tone="danger">{failure}</Banner> : null}
      <Button
        label="Add a document"
        icon={Plus}
        variant="secondary"
        onPress={() => openEditor('new')}
        loading={save.isPending}
      />

      <Sheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add a document' : 'Edit document'}
      >
        <View style={styles.sheet}>
          <TextField
            label="Name"
            value={label}
            onChangeText={setLabel}
            error={labelError}
          />
          <TextField
            label="What to send"
            optional
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <ChipRow options={NEED} value={need} onChange={setNeed} />
          <Button label="Save" icon={Save} onPress={submitEditor} />
        </View>
      </Sheet>
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    content: { padding: space[4], gap: space[3] },
    intro: { ...typography.caption, color: colors.ink2 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space[2],
    },
    title: { ...typography.bodyStrong, color: colors.ink, flexShrink: 1 },
    retired: { color: colors.ink3 },
    description: {
      ...typography.caption,
      color: colors.ink2,
      marginTop: space[1],
    },
    actions: { flexDirection: 'row', gap: space[2], marginTop: space[2] },
    sheet: { gap: space[3] },
  });
}
