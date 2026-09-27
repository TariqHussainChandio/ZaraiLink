import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../../theme';
import { ROLE_LABELS, type Role } from '../../constants/roles';

export interface RoleBadgeProps {
  role: Role;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const color = theme.roleColors[role];

  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.label, { color }]}>{ROLE_LABELS[role]}</Text>
    </View>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs / 2,
      borderRadius: radii.full,
      borderWidth: 1,
      // Deliberately literal white, not `colors.background.surface` — this badge is designed
      // to stay legible whether it sits on the app's own background OR overlaid on a photo (e.g.
      // marketplace listing cards), and a photo doesn't respect the app's theme.
      backgroundColor: colors.neutral.white,
    },
    label: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
    },
  });
}
