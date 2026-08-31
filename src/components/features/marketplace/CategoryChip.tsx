import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme, type Theme } from '../../../theme';

export interface CategoryChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
}

export function CategoryChip({ label, selected = false, onPress }: CategoryChipProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    chip: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: spacing.sm,
    },
    chipSelected: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    label: {
      color: colors.text.secondary,
      fontWeight: typography.weights.medium as any,
      fontSize: typography.sizes.sm,
    },
    labelSelected: {
      // Deliberately literal white, not a semantic token — this is text sitting on the
      // brand-primary fill, which stays legible white in both themes.
      color: colors.neutral.white,
    },
  });
}
