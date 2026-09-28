import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../../components';
import { ConsultationStatusBadge } from './ConsultationStatusBadge';
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

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.subject} numberOfLines={1}>
            {consultation.subject}
          </Text>
          <ConsultationStatusBadge status={consultation.status} />
        </View>
        <Text style={styles.meta}>
          {counterpartyName}
          {consultation.crop ? ` · ${consultation.crop.name}` : ''}
        </Text>
        <Text style={styles.date}>{new Date(consultation.created_at).toLocaleDateString()}</Text>
      </Card>
    </TouchableOpacity>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    card: {
      marginBottom: spacing.md,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    subject: {
      flex: 1,
      marginRight: spacing.sm,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
    },
    meta: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    date: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
  });
}
