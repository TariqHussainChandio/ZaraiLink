import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { lightTheme } from '../../../theme';

export interface CategoryChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
}

const { colors, spacing, radii, typography } = lightTheme;

export function CategoryChip({ label, selected = false, onPress }: CategoryChipProps) {
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

const styles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.neutral.gray300,
    marginRight: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  label: {
    color: colors.neutral.gray700,
    fontWeight: typography.weights.medium as any,
    fontSize: typography.sizes.sm,
  },
  labelSelected: {
    color: colors.neutral.white,
  },
});
