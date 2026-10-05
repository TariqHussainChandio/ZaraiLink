import { Plus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge, Banner, Button, Card, DocumentTile, Spinner } from '../../../components';
import { useTheme, type Theme } from '../../../../theme';
import { pickApplicationDocument } from '../../../../utils/documentPicker';
import { errorMessage } from '../../../../utils/errorMessage';
import { useApplicationDocuments, useAttachDocument, useRemoveDocument, useRequiredDocuments } from '../../hooks/application';
import type { ApplicationDocument, ApplicationRole } from '../../types/application';

export interface DocumentsStepProps {
  role: ApplicationRole;
  userId: string | undefined;
  /** False while the application is under review: the files are shown, nothing changes. */
  editable: boolean;
  onDone?: () => void;
}

/**
 * The documents an applicant sends (SRDS §7, §10; §53 rules 4 and 5): one card per document the admin asks for, with
 * the files attached to it. A file comes from the camera, the gallery or the phone's files (PDF or image), goes
 * straight into the applicant's own folder of their role's bucket, and is then attached through the API.
 */
export function DocumentsStep({ role, userId, editable, onDone }: DocumentsStepProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const required = useRequiredDocuments();
  const documents = useApplicationDocuments(role);
  const attach = useAttachDocument(role, userId);
  const remove = useRemoveDocument(role);
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const byRequirement = useMemo(() => {
    const groups = new Map<string | null, ApplicationDocument[]>();
    for (const document of documents.data ?? []) {
      const key = document.required_document_id;
      groups.set(key, [...(groups.get(key) ?? []), document]);
    }
    return groups;
  }, [documents.data]);

  const add = async (requiredDocumentId: string) => {
    setFailure(null);
    try {
      const file = await pickApplicationDocument();
      if (!file) return;
      setBusyFor(requiredDocumentId);
      await attach.mutateAsync({ file, requiredDocumentId });
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusyFor(null);
    }
  };

  const onRemove = async (documentId: string) => {
    setFailure(null);
    try {
      await remove.mutateAsync(documentId);
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  if (required.isLoading || documents.isLoading) return <Spinner />;
  if (required.error || documents.error) {
    return (
      <Banner tone="danger" actionLabel="Try again" onAction={() => Promise.all([required.refetch(), documents.refetch()])}>
        {errorMessage(required.error ?? documents.error)}
      </Banner>
    );
  }

  const earlier = byRequirement.get(null) ?? [];
  return (
    <View style={styles.list}>
      {editable ? (
        <Text style={styles.intro}>Photos or PDF files, up to 10 MB each. Only administrators reviewing your account can see them.</Text>
      ) : null}
      {(required.data ?? []).map(requirement => {
        const files = byRequirement.get(requirement.id) ?? [];
        return (
          <Card key={requirement.id}>
            <View style={styles.header}>
              <Text style={styles.title}>{requirement.label}</Text>
              <Badge
                label={requirement.is_required ? (files.length ? 'Added' : 'Needed') : 'Optional'}
                tone={requirement.is_required ? (files.length ? 'success' : 'warning') : 'neutral'}
                size="sm"
              />
            </View>
            {requirement.description ? <Text style={styles.description}>{requirement.description}</Text> : null}
            <View style={styles.files}>
              {files.map(file => (
                <DocumentTile
                  key={file.id}
                  fileName={file.file_name}
                  mimeType={file.mime_type}
                  sizeBytes={file.size_bytes}
                  onRemove={editable ? () => onRemove(file.id) : undefined}
                  busy={remove.isPending && remove.variables === file.id}
                />
              ))}
            </View>
            {editable ? (
              <Button
                label={files.length ? 'Add another file' : 'Add file'}
                icon={Plus}
                variant="secondary"
                size="sm"
                loading={busyFor === requirement.id}
                onPress={() => add(requirement.id)}
              />
            ) : null}
          </Card>
        );
      })}
      {earlier.length ? (
        <Card>
          <Text style={styles.title}>Earlier documents</Text>
          <View style={styles.files}>
            {earlier.map(file => (
              <DocumentTile
                key={file.id}
                fileName={file.file_name}
                mimeType={file.mime_type}
                sizeBytes={file.size_bytes}
                onRemove={editable ? () => onRemove(file.id) : undefined}
              />
            ))}
          </View>
        </Card>
      ) : null}
      {failure ? <Banner tone="danger">{failure}</Banner> : null}
      {onDone ? <Button label="Continue to review" onPress={onDone} /> : null}
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    list: { gap: space[3] },
    intro: { ...typography.body, color: colors.ink2 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
    title: { ...typography.bodyStrong, color: colors.ink, flexShrink: 1 },
    description: { ...typography.caption, color: colors.ink2, marginTop: space[1] },
    files: { gap: space[2], marginVertical: space[2] },
  });
}
