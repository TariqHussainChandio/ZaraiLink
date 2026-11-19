import * as ImagePicker from 'expo-image-picker';
import { Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, ConfirmSheet, DocumentTile, StatusBadge } from '../../../components';
import { useTheme, type Theme } from '../../../../theme';
import { pickApplicationDocument } from '../../../../utils/documentPicker';
import { errorMessage } from '../../../../utils/errorMessage';
import { useApplicationDocuments, useAttachDocument, useRemoveDocument, useRequiredDocuments } from '../../hooks/application';
import type { ApplicationDocument, ApplicationRole } from '../../types/application';
import { FormSkeleton, StepActions } from './StepParts';

export interface DocumentsStepProps {
  role: ApplicationRole;
  userId: string | undefined;
  /** False while the application is under review: the files are shown, nothing changes. */
  editable: boolean;
  onDone?: () => void;
  /** Present when the step is in the wizard: Back goes to the details. */
  onBack?: () => void;
}

/**
 * The documents an applicant sends (SRDS §7, §10; §53 rules 4 and 5): one card per document the admin asks for, with
 * the files attached to it. A file comes from the camera, the gallery or the phone's files (PDF or image), goes
 * straight into the applicant's own folder of their role's bucket, and is then attached through the API. The phone keeps
 * nothing of it afterwards.
 */
export function DocumentsStep({ role, userId, editable, onDone, onBack }: DocumentsStepProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const required = useRequiredDocuments();
  const documents = useApplicationDocuments(role);
  const attach = useAttachDocument(role, userId);
  const remove = useRemoveDocument(role);
  const [busyFor, setBusyFor] = useState<string | null>(null);
  // An upload that failed is told inside the card of the document it was for, where the person is looking.
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<ApplicationDocument | null>(null);
  const [cameraBlocked, setCameraBlocked] = useState(false);

  // "Take photo" does nothing once Android has stopped asking (the picker answers an empty result, like a cancel), so the
  // person is told why and sent to the setting. `canAskAgain` is false only after a refusal Android will not ask about
  // again: a plain cancel never shows this.
  const checkCamera = useCallback(async () => {
    try {
      const permission = await ImagePicker.getCameraPermissionsAsync();
      setCameraBlocked(permission.status === 'denied' && !permission.canAskAgain);
    } catch {
      setCameraBlocked(false);
    }
  }, []);

  useEffect(() => {
    if (!editable) return;
    checkCamera();
    // The person may have gone to the settings and come back.
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') checkCamera();
    });
    return () => subscription.remove();
  }, [editable, checkCamera]);

  const byRequirement = useMemo(() => {
    const groups = new Map<string | null, ApplicationDocument[]>();
    for (const document of documents.data ?? []) {
      const key = document.required_document_id;
      groups.set(key, [...(groups.get(key) ?? []), document]);
    }
    return groups;
  }, [documents.data]);

  const add = async (requiredDocumentId: string) => {
    setFailures(current => ({ ...current, [requiredDocumentId]: '' }));
    try {
      const file = await pickApplicationDocument();
      checkCamera();
      if (!file) return;
      setBusyFor(requiredDocumentId);
      await attach.mutateAsync({ file, requiredDocumentId });
    } catch (error) {
      setFailures(current => ({ ...current, [requiredDocumentId]: errorMessage(error) }));
    } finally {
      setBusyFor(null);
    }
  };

  if (required.isPending || documents.isPending) return <FormSkeleton />;
  if (required.error || documents.error) {
    return (
      <Banner
        tone="danger"
        title="Couldn't load your documents"
        actionLabel="Try again"
        onAction={() => Promise.all([required.refetch(), documents.refetch()])}
      >
        {errorMessage(required.error ?? documents.error)}
      </Banner>
    );
  }

  const requirements = required.data ?? [];
  const mustHave = requirements.filter(requirement => requirement.is_required);
  const added = mustHave.filter(requirement => (byRequirement.get(requirement.id) ?? []).length > 0).length;
  const other = byRequirement.get(null) ?? [];
  return (
    <View style={styles.list}>
      {editable ? (
        <View style={styles.intro}>
          <Text style={styles.progress}>{`${added} of ${mustHave.length} required documents added`}</Text>
          <Text style={styles.hint}>Photos or PDF files, up to 10 MB each. Only administrators reviewing your account can see them.</Text>
        </View>
      ) : null}
      {editable && cameraBlocked ? (
        <Banner tone="warning" title="The camera is turned off" actionLabel="Open settings" onAction={() => Linking.openSettings()}>
          Allow the camera for ZaraiLink in the phone settings to take a photo here, or choose a photo or file instead.
        </Banner>
      ) : null}
      {requirements.map(requirement => {
        const files = byRequirement.get(requirement.id) ?? [];
        const status = files.length ? 'added' : requirement.is_required ? 'needed' : 'optional';
        const failure = failures[requirement.id];
        return (
          <Card key={requirement.id}>
            <View style={styles.header}>
              <Text style={styles.title}>{requirement.label}</Text>
              <StatusBadge kind="document" status={status} size="sm" />
            </View>
            {requirement.description ? <Text style={styles.description}>{requirement.description}</Text> : null}
            {files.length ? (
              <View style={styles.files}>
                {files.map(file => (
                  <DocumentTile
                    key={file.id}
                    fileName={file.file_name}
                    mimeType={file.mime_type}
                    sizeBytes={file.size_bytes}
                    onRemove={editable ? () => setRemoving(file) : undefined}
                    busy={remove.isPending && remove.variables === file.id}
                  />
                ))}
              </View>
            ) : null}
            {failure ? (
              <View style={styles.files}>
                <Banner tone="danger" title="Couldn't add the file">
                  {failure}
                </Banner>
              </View>
            ) : null}
            {editable ? (
              <View style={styles.add}>
                <Button
                  label={files.length ? 'Add another file' : 'Add photo or PDF'}
                  icon={Plus}
                  variant="secondary"
                  loading={busyFor === requirement.id}
                  onPress={() => add(requirement.id)}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
      {other.length ? (
        <Card>
          <Text style={styles.title}>Other files</Text>
          <Text style={styles.description}>Files you sent that are not tied to a document on the list above.</Text>
          <View style={styles.files}>
            {other.map(file => (
              <DocumentTile
                key={file.id}
                fileName={file.file_name}
                mimeType={file.mime_type}
                sizeBytes={file.size_bytes}
                onRemove={editable ? () => setRemoving(file) : undefined}
                busy={remove.isPending && remove.variables === file.id}
              />
            ))}
          </View>
        </Card>
      ) : null}
      {onDone ? <StepActions onBack={onBack} primaryLabel="Continue to review" onPrimary={onDone} /> : null}

      <ConfirmSheet
        visible={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this file?"
        message={`"${removing?.file_name ?? ''}" is taken off your application. Add it again if you change your mind.`}
        confirmLabel="Remove file"
        keepLabel="Keep file"
        destructive
        onConfirm={async () => {
          if (removing) await remove.mutateAsync(removing.id);
        }}
      />
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    list: { gap: space[3] },
    intro: { gap: space[1] },
    progress: { ...typography.bodyStrong, color: colors.ink },
    hint: { ...typography.body, color: colors.ink2 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
    title: { ...typography.bodyStrong, color: colors.ink, flexShrink: 1 },
    description: { ...typography.caption, color: colors.ink2, marginTop: space[1] },
    files: { gap: space[2], marginTop: space[2] },
    add: { marginTop: space[3] },
  });
}
