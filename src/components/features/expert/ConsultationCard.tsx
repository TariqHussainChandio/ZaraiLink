import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../../ui';
import { ConsultationStatusBadge } from './ConsultationStatusBadge';
import { lightTheme } from '../../../theme';
import type { ConsultationWithRelations } from '../../../types/expert';

export interface ConsultationCardProps {
  consultation: ConsultationWithRelations;
  counterpartyName: string;
  onPress: () => void;
}

const { colors, spacing, typography } = lightTheme;

export function ConsultationCard({ consultation, counterpartyName, onPress }: ConsultationCardProps) {
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

const styles = StyleSheet.create({
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
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray600,
  },
  date: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray400,
  },
});
