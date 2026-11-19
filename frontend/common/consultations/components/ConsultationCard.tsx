import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card, StatusBadge } from '../../components';
import { statusMeta } from '../../constants/status';
import { useTheme, type Theme } from '../../../theme';
import type { ConsultationWithRelations } from '../../../expert';

export interface ConsultationCardProps {
  consultation: ConsultationWithRelations;
  counterpartyName: string;
  onPress: () => void;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'} ago`;

/**
 * How long a request has waited, as "2 days ago" (A8, E1): an expert triages by age, which a bare date hides. Written
 * out here because Hermes has no `Intl.RelativeTimeFormat` and date-fns is not a dependency of the app.
 */
export function requestAge(createdAt: string, now: Date = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - new Date(createdAt).getTime());
  if (elapsed < MINUTE) return 'Just now';
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour');
  const days = Math.floor(elapsed / DAY);
  if (days < 30) return plural(days, 'day');
  if (days < 365) return plural(Math.floor(days / 30), 'month');
  return plural(Math.floor(days / 365), 'year');
}

export function ConsultationCard({ consultation, counterpartyName, onPress }: ConsultationCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const createdOn = new Date(consultation.created_at).toLocaleDateString();
  const age = requestAge(consultation.created_at);
  // A missing crop is said, not left out: a silent gap reads as if the card were cut short (A8, E1).
  const cropName = consultation.crop?.name ?? 'Crop not given';
  // One label in reading order, so TalkBack says the whole card once instead of four separate fragments.
  const label = `${consultation.subject}. ${statusMeta('consultation', consultation.status).label}. ${counterpartyName}, ${cropName}. ${age}, ${createdOn}`;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the consultation"
    >
      <Card style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.subject} numberOfLines={1}>
            {consultation.subject}
          </Text>
          <StatusBadge kind="consultation" status={consultation.status} />
        </View>
        <Text style={styles.meta}>{`${counterpartyName} · ${cropName}`}</Text>
        <Text style={styles.date}>{`${age} · ${createdOn}`}</Text>
      </Card>
    </TouchableOpacity>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    card: {
      marginBottom: space[3],
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: space[1],
    },
    subject: {
      flex: 1,
      marginRight: space[2],
      ...typography.bodyStrong,
      color: colors.ink,
    },
    meta: {
      ...typography.caption,
      color: colors.ink2,
    },
    date: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
  });
}
