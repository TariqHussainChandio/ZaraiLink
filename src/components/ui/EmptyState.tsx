import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { lightTheme } from '../../theme';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const { colors, spacing, typography } = lightTheme;

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  title: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray800,
    textAlign: 'center',
  },
  description: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray500,
    textAlign: 'center',
  },
  action: {
    marginTop: spacing.lg,
  },
});
