import { Ban, CircleCheck } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Banner,
  Button,
  Card,
  ScreenState,
  Sheet,
  StatusBadge,
  TextField,
  useToast,
} from '../../common/components';
import type { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { useAdminConsultation, useModerateConsultation } from '../hooks/admin';

type Action = 'close' | 'cancel';

// The database lets an admin close or cancel only a consultation still open (guard_consultations_update; SRDS §14).
const MODERATABLE = ['requested', 'accepted', 'in_progress', 'resolved'];

const ACTION_COPY: Record<
  Action,
  { title: string; button: string; done: string }
> = {
  close: {
    title: 'Close this consultation',
    button: 'Close consultation',
    done: 'Consultation closed',
  },
  cancel: {
    title: 'Cancel this consultation',
    button: 'Cancel consultation',
    done: 'Consultation cancelled',
  },
};

const WHEN = new Intl.DateTimeFormat('en-PK', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * One consultation as the admin moderates it (SRDS §14): who asked whom about what, the AI report it started from (if
 * any, advisory only: BR-13), and Close or Cancel with a reason the farmer and the expert read. Moderation needs two-step
 * verification and is audited by the API as "Consultation Moderated" (BR-15, SRDS §51).
 */
export function ConsultationModerationDetailScreen({
  route,
}: AdminScreenProps<typeof ADMIN_HOME_ROUTES.ConsultationModerationDetail>) {
  const { consultationId } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const query = useAdminConsultation(consultationId);
  const moderate = useModerateConsultation();
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const toast = useToast();

  if (!query.data) {
    return (
      <ScreenState
        query={query}
        errorTitle="Couldn't load the consultation"
        empty={{
          title: 'Consultation not found',
          description: 'Go back and open it again.',
        }}
      />
    );
  }

  const consultation = query.data;
  const report = consultation.ai_report?.report;
  const canModerate = MODERATABLE.includes(consultation.status);

  const open = (next: Action) => {
    setReason('');
    setReasonError(undefined);
    setAction(next);
  };

  const confirm = async () => {
    if (!action) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError('Say why, for the farmer and the expert');
      return;
    }
    const chosen = action;
    setAction(null);
    setFailure(null);
    try {
      await moderate.mutateAsync({
        id: consultationId,
        action: chosen,
        reason: trimmed,
      });
      toast.success(ACTION_COPY[chosen].done);
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Card>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {consultation.subject}
          </Text>
          <StatusBadge kind="consultation" status={consultation.status} />
        </View>
        <Text
          style={styles.meta}
        >{`Farmer: ${consultation.user?.full_name || 'Unknown'}`}</Text>
        <Text
          style={styles.meta}
        >{`Expert: ${consultation.expert?.full_name || 'Not assigned'}`}</Text>
        {consultation.crop ? (
          <Text style={styles.meta}>{`Crop: ${consultation.crop.name}`}</Text>
        ) : null}
        <Text
          style={styles.meta}
        >{`Opened ${WHEN.format(new Date(consultation.created_at))}`}</Text>
        <Text
          style={styles.meta}
        >{`Last change ${WHEN.format(new Date(consultation.updated_at))}`}</Text>
      </Card>

      {consultation.moderation_reason ? (
        <Banner tone="warning" title="Admin's reason">
          {consultation.moderation_reason}
        </Banner>
      ) : null}
      {failure ? <Banner tone="danger">{failure}</Banner> : null}

      {consultation.problem_description ? (
        <Card>
          <Text style={styles.heading}>Problem</Text>
          <Text style={styles.body}>{consultation.problem_description}</Text>
        </Card>
      ) : null}

      {report ? (
        <Card>
          <Text style={styles.heading}>AI report</Text>
          <Text style={styles.body}>
            {report.is_healthy
              ? `${report.crop}: healthy`
              : `${report.crop}: ${report.disease}`}
          </Text>
          <Text style={styles.meta}>
            {report.confidence_band === 'confident'
              ? 'Confident result'
              : 'Low-confidence result'}
          </Text>
          <Text style={styles.meta}>{report.disclaimer}</Text>
        </Card>
      ) : null}

      {canModerate ? (
        <View style={styles.actions}>
          <Button
            label="Close"
            icon={CircleCheck}
            variant="secondary"
            disabled={moderate.isPending}
            onPress={() => open('close')}
          />
          <Button
            label="Cancel"
            icon={Ban}
            variant="danger"
            loading={moderate.isPending}
            onPress={() => open('cancel')}
          />
        </View>
      ) : null}

      <Sheet
        visible={action !== null}
        onClose={() => setAction(null)}
        title={action ? ACTION_COPY[action].title : undefined}
      >
        <View style={styles.sheet}>
          <TextField
            label="Reason"
            helper="The farmer and the expert read this on the consultation."
            value={reason}
            onChangeText={text => {
              setReason(text);
              setReasonError(undefined);
            }}
            error={reasonError}
            multiline
          />
          {action ? (
            <Button
              label={ACTION_COPY[action].button}
              icon={action === 'cancel' ? Ban : CircleCheck}
              variant={action === 'cancel' ? 'danger' : 'primary'}
              onPress={confirm}
            />
          ) : null}
        </View>
      </Sheet>
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    content: { padding: space[4], gap: space[3] },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space[2],
      marginBottom: space[2],
    },
    title: { ...typography.title, flex: 1, color: colors.ink },
    heading: {
      ...typography.bodyStrong,
      color: colors.ink,
      marginBottom: space[1],
    },
    body: { ...typography.body, color: colors.ink },
    meta: { ...typography.caption, color: colors.ink2, marginTop: space[1] },
    actions: { gap: space[2] },
    sheet: { gap: space[3] },
  });
}
