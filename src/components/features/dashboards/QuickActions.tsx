import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { lightTheme } from '../../../theme';

export interface QuickAction {
  label: string;
  onPress: () => void;
}

export interface QuickActionsProps {
  actions: QuickAction[];
}

const { colors, spacing, radii, typography } = lightTheme;

export function QuickActions({ actions }: QuickActionsProps) {
  return (
    <View style={styles.row}>
      {actions.map(action => (
        <TouchableOpacity key={action.label} style={styles.action} onPress={action.onPress}>
          <Text style={styles.label}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  action: {
    backgroundColor: colors.brand.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  label: {
    color: colors.neutral.white,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold as any,
  },
});
