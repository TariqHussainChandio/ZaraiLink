import { CircleCheck, Save } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, ScreenState, Sheet, Skeleton, StatusBadge, TextField, useToast } from '../../common/components';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { useDiseaseKnowledgeEntry, useReviewDiseaseKnowledge, useUpdateDiseaseKnowledge } from '../hooks/admin';
import type { DiseaseKnowledgeEntry, DiseaseKnowledgeUpdate } from '../types/ai';

// The API's limits (backend/app/admin/schemas.py DiseaseKnowledgeUpdate), checked here so the admin reads the fix.
const MAX_LINES = 30;
const MAX_LINE_LENGTH = 1000;
const MAX_ADVISORY = 4000;

type ListField = 'symptoms' | 'treatment' | 'precautions';
type TextFieldName = 'crop' | 'disease' | 'advisory';
type Draft = Record<TextFieldName | ListField, string>;
type Errors = Partial<Record<keyof Draft, string>>;

const LIST_FIELDS: { name: ListField; label: string }[] = [
  { name: 'symptoms', label: 'Symptoms' },
  { name: 'treatment', label: 'Treatment' },
  { name: 'precautions', label: 'Precautions' },
];

const reviewedAt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// A list is edited as one item per line; blank lines are dropped.
const toLines = (text: string) =>
  text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

const draftOf = (entry: DiseaseKnowledgeEntry): Draft => ({
  crop: entry.crop,
  disease: entry.disease,
  advisory: entry.advisory,
  symptoms: entry.symptoms.join('\n'),
  treatment: entry.treatment.join('\n'),
  precautions: entry.precautions.join('\n'),
});

function validate(draft: Draft): Errors {
  const errors: Errors = {};
  if (!draft.crop.trim()) errors.crop = 'Name the crop';
  else if (draft.crop.trim().length > 120) errors.crop = 'Keep the crop under 120 characters';
  if (!draft.disease.trim()) errors.disease = 'Name the disease';
  else if (draft.disease.trim().length > 200) errors.disease = 'Keep the disease under 200 characters';
  if (!draft.advisory.trim()) errors.advisory = 'Write the advice farmers read';
  else if (draft.advisory.trim().length > MAX_ADVISORY) errors.advisory = `Keep the advice under ${MAX_ADVISORY} characters`;
  for (const { name } of LIST_FIELDS) {
    const lines = toLines(draft[name]);
    if (lines.length > MAX_LINES) errors[name] = `Use at most ${MAX_LINES} lines`;
    else if (lines.some(line => line.length > MAX_LINE_LENGTH)) errors[name] = `Keep each line under ${MAX_LINE_LENGTH} characters`;
  }
  return errors;
}

/** Only what the admin changed goes to the server, so an untouched field is never rewritten. */
function changesOf(entry: DiseaseKnowledgeEntry, draft: Draft): DiseaseKnowledgeUpdate {
  const changes: DiseaseKnowledgeUpdate = {};
  for (const name of ['crop', 'disease', 'advisory'] as const) {
    const value = draft[name].trim();
    if (value !== entry[name]) changes[name] = value;
  }
  for (const { name } of LIST_FIELDS) {
    const lines = toLines(draft[name]);
    if (lines.join('\n') !== entry[name].join('\n')) changes[name] = lines;
  }
  return changes;
}

/**
 * One disease knowledge entry (SRDS §37). Saving a reviewed entry sends it back to pending review, so a changed text
 * is never shown to farmers as reviewed; "Mark reviewed" records that a qualified agronomist checked it. Both writes
 * are audited by the API as "AI Configuration Changed" (BR-15) and may ask for two-step verification.
 */
export function DiseaseKnowledgeEditScreen({ route }: AdminScreenProps<typeof ADMIN_HOME_ROUTES.DiseaseKnowledgeEdit>) {
  const { classLabel } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const query = useDiseaseKnowledgeEntry(classLabel);
  const update = useUpdateDiseaseKnowledge();
  const review = useReviewDiseaseKnowledge();
  const toast = useToast();
  const entry = query.data;
  const [source, setSource] = useState<DiseaseKnowledgeEntry | undefined>(entry);
  const [draft, setDraft] = useState<Draft | null>(() => (entry ? draftOf(entry) : null));
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The form starts from the server's copy, and again after each save or review returns the new one. Adjusted during
  // render, not in an effect, so the form never draws once with the old copy.
  if (entry && entry !== source) {
    setSource(entry);
    setDraft(draftOf(entry));
  }

  if (!entry || !draft) {
    return (
      <ScreenState
        query={query}
        errorTitle="Couldn't load the entry"
        skeleton={
          <View style={styles.content}>
            <Skeleton style={styles.skeletonCard} />
            <Skeleton style={styles.skeletonField} />
            <Skeleton style={styles.skeletonField} />
            <Skeleton style={styles.skeletonField} />
          </View>
        }
        empty={{ title: 'Entry not found', description: 'Go back and open it again.' }}
      />
    );
  }

  const changes = changesOf(entry, draft);
  const dirty = Object.keys(changes).length > 0;
  const set = (name: keyof Draft) => (value: string) => {
    setDraft(current => (current ? { ...current, [name]: value } : current));
    setErrors(current => ({ ...current, [name]: undefined }));
  };

  const save = async () => {
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setFailure(null);
    const wasReviewed = entry.review_status === 'reviewed';
    try {
      await update.mutateAsync({ classLabel, changes });
      toast.success(wasReviewed ? 'Saved. The entry is back to pending review.' : 'Saved');
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  const markReviewed = async () => {
    setConfirming(false);
    setFailure(null);
    try {
      await review.mutateAsync(classLabel);
      toast.success('Marked reviewed');
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card>
        <View style={styles.header}>
          <Text style={styles.label}>{entry.class_label}</Text>
          <StatusBadge kind="knowledge" status={entry.review_status} size="sm" />
        </View>
        <Text style={styles.meta}>
          {entry.is_healthy ? 'Healthy class' : 'Disease class'}
          {entry.reviewed_at ? ` · Reviewed ${reviewedAt.format(new Date(entry.reviewed_at))}` : ''}
        </Text>
      </Card>

      {entry.review_status === 'reviewed' ? (
        <Banner tone="info">Saving a change sends this entry back to pending review.</Banner>
      ) : null}

      <TextField label="Crop" value={draft.crop} onChangeText={set('crop')} error={errors.crop} />
      <TextField label="Disease" value={draft.disease} onChangeText={set('disease')} error={errors.disease} />
      {LIST_FIELDS.map(({ name, label }) => (
        <TextField
          key={name}
          label={label}
          helper="One item per line"
          optional
          multiline
          value={draft[name]}
          onChangeText={set(name)}
          error={errors[name]}
        />
      ))}
      <TextField label="Advice for farmers" multiline value={draft.advisory} onChangeText={set('advisory')} error={errors.advisory} />

      {/* A refusal (two-step verification needed, or a limit) stays on screen next to the form it concerns. */}
      {failure ? <Banner tone="danger">{failure}</Banner> : null}

      <Button label="Save" icon={Save} onPress={save} disabled={!dirty || review.isPending} loading={update.isPending} />
      {entry.review_status === 'pending_review' ? (
        <Button
          label="Mark reviewed"
          icon={CircleCheck}
          variant="secondary"
          // A review covers the text the server holds, so unsaved edits are saved first.
          disabled={dirty || update.isPending}
          loading={review.isPending}
          onPress={() => setConfirming(true)}
        />
      ) : null}
      {entry.review_status === 'pending_review' && dirty ? (
        <Text style={styles.meta}>Save your changes before marking the entry reviewed.</Text>
      ) : null}

      <Sheet visible={confirming} onClose={() => setConfirming(false)} title="Mark reviewed">
        <View style={styles.sheet}>
          <Text style={styles.body}>Confirm a qualified agronomist reviewed this entry.</Text>
          <Button label="Confirm review" icon={CircleCheck} onPress={markReviewed} />
          <Button label="Cancel" variant="quiet" onPress={() => setConfirming(false)} />
        </View>
      </Sheet>
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    content: { padding: space[4], gap: space[3] },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
    label: { ...typography.code, color: colors.ink, flexShrink: 1 },
    meta: { ...typography.caption, color: colors.ink2, marginTop: space[1] },
    body: { ...typography.body, color: colors.ink },
    sheet: { gap: space[3] },
    skeletonCard: { height: space[12] * 2 },
    skeletonField: { height: space[12] },
  });
}
