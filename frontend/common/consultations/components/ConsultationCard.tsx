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

export function ConsultationCard({ consultation, counterpartyName, onPress }: ConsultationCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const createdOn = new Date(consultation.created_at).toLocaleDateString();
  const cropName = consultation.crop ? `, ${consultation.crop.name}` : '';
  // One label in reading order, so TalkBack says the whole card once instead of four separate fragments.
  const label = `${consultation.subject}. ${statusMeta('consultation', consultation.status).label}. ${counterpartyName}${cropName}. ${createdOn}`;

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
        <Text style={styles.meta}>
          {counterpartyName}
          {consultation.crop ? ` · ${consultation.crop.name}` : ''}
        </Text>
        <Text style={styles.date}>{createdOn}</Text>
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
