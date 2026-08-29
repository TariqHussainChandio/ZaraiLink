import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { lightTheme } from '../../theme';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

const { colors, spacing, radii, typography } = lightTheme;

const toneColors: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.neutral.gray200, fg: colors.neutral.gray700 },
  success: { bg: '#E3F2E3', fg: colors.semantic.success },
  warning: { bg: '#FBEBD3', fg: colors.semantic.warning },
  error: { bg: '#FADBD8', fg: colors.semantic.error },
  info: { bg: '#DCEBFB', fg: colors.semantic.info },
};

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const { bg, fg } = toneColors[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radii.full,
  },
  label: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold as any,
  },
});
