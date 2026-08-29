import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { lightTheme } from '../../theme';
import { ROLE_LABELS, type Role } from '../../constants/roles';

export interface RoleBadgeProps {
  role: Role;
}

const { roleColors, spacing, radii, typography } = lightTheme;

export function RoleBadge({ role }: RoleBadgeProps) {
  const color = roleColors[role];

  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.label, { color }]}>{ROLE_LABELS[role]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radii.full,
    borderWidth: 1,
    // Solid background (rather than a light tint) so the badge stays legible whether it sits
    // on a plain screen background or overlaid on a photo (e.g. marketplace listing cards).
    backgroundColor: lightTheme.colors.neutral.white,
  },
  label: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold as any,
  },
});
