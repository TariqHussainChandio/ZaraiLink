import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, StatusBadge } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import type { ConsultationWithRelations } from '../../../expert';
import { formatAgo } from '../../../utils/dates';
import { PriorityBadge, priorityLabel } from './PriorityBadge';
import { isActiveStatus } from '../utils/requests';

interface ConsultationCardActions {
  onAccept: () => void;
  onDecline: () => void;
  /** Which button shows the spinner: the pressed one only (FA-11). Both are off while either runs. */
  pending?: 'accept' | 'decline' | null;
}

export interface ConsultationCardProps {
  consultation: ConsultationWithRelations;
  counterpartyName: string;
  onPress: () => void;
  /** The expert's Accept and Decline, for a request still waiting for an answer. */
  actions?: ConsultationCardActions;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One consultation: what it is about, who with, how urgent, how long ago, and how many photos came with it. */
export function ConsultationCard({ consultation, counterpartyName, onPress, actions }: ConsultationCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const photos = consultation.images.length;
  const active = isActiveStatus(consultation.status);
  // A request in the expert's queue is all "requested": the priority says more than the status, which they know.
  const showStatus = !actions;

  const details = [
    counterpartyName,
    consultation.crop?.name,
    formatAgo(consultation.created_at),
    photos > 0 ? plural(photos, 'photo', 'photos') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const spoken = [
    consultation.subject,
    `from ${counterpartyName}`,
    consultation.crop ? `crop ${consultation.crop.name}` : null,
    active ? priorityLabel(consultation.priority) : null,
    formatAgo(consultation.created_at),
    photos > 0 ? plural(photos, 'photo', 'photos') : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card style={styles.card} pad="none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        android_ripple={{ color: theme.colors.ripple }}
        style={styles.body}
      >
        <Text style={styles.subject}>{consultation.subject}</Text>
        <Text style={styles.meta}>{details}</Text>
        <View style={styles.badges}>
          {showStatus ? <StatusBadge kind="consultation" status={consultation.status} /> : null}
          {active ? <PriorityBadge priority={consultation.priority} /> : null}
        </View>
      </Pressable>
      {actions ? (
        <View style={styles.actions}>
          <Button
            label="Decline"
            variant="secondary"
            size="md"
            fullWidth={false}
            style={styles.action}
            loading={actions.pending === 'decline'}
            disabled={actions.pending === 'accept'}
            onPress={actions.onDecline}
          />
          <Button
            label="Accept"
            size="md"
            fullWidth={false}
            style={styles.action}
            loading={actions.pending === 'accept'}
            disabled={actions.pending === 'decline'}
            onPress={actions.onAccept}
          />
        </View>
      ) : null}
    </Card>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    card: { overflow: 'hidden' },
    body: { padding: space[4], gap: space[1] },
    subject: { ...typography.bodyStrong, color: colors.ink },
    meta: { ...typography.caption, color: colors.ink2 },
    badges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
      marginTop: space[1],
    },
    actions: {
      flexDirection: 'row',
      gap: space[3],
      paddingHorizontal: space[4],
      paddingBottom: space[4],
    },
    action: { flex: 1 },
  });
}
