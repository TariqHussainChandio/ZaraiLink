import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card } from '../../../components/ui';
import { lightTheme } from '../../../theme';

export interface StatCardProps {
  label: string;
  value: string | number;
}

const { colors, spacing, typography } = lightTheme;

export function StatCard({ label, value }: StatCardProps) {
  return (
    <Card style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'flex-start',
  },
  value: {
    fontSize: typography.sizes['2xl'],
    fontWeight: typography.weights.bold as any,
    color: colors.neutral.gray900,
  },
  label: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray500,
  },
});
