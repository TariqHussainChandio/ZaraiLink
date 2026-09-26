import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../../theme';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { bg, fg } = toneColors(theme)[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

// Light mode uses pale tone tints with saturated text; the same pale tints would look like
// bright "holes" punched in a dark page, so dark mode gets muted-dark tints instead, paired
// with the already-brightened `semantic.*` (see colors.ts) for the foreground.
function toneColors({ colors, dark }: Theme): Record<BadgeTone, { bg: string; fg: string }> {
  if (dark) {
    return {
      neutral: { bg: colors.neutral.gray700, fg: colors.neutral.gray200 },
      success: { bg: '#1B3A1E', fg: colors.semantic.success },
      warning: { bg: '#3D2B12', fg: colors.semantic.warning },
      error: { bg: '#3D1A18', fg: colors.semantic.error },
      info: { bg: '#14293D', fg: colors.semantic.info },
    };
  }
  return {
    neutral: { bg: colors.neutral.gray200, fg: colors.neutral.gray700 },
    success: { bg: '#E3F2E3', fg: colors.semantic.success },
    warning: { bg: '#FBEBD3', fg: colors.semantic.warning },
    error: { bg: '#FADBD8', fg: colors.semantic.error },
    info: { bg: '#DCEBFB', fg: colors.semantic.info },
  };
}

function makeStyles({ spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs / 2,
      borderRadius: radii.full,
    },
    label: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
    },
  });
}
