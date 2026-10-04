import { ShieldCheck, ShoppingBag, Sprout, Stethoscope, Store, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ROLE_LABELS, type Role } from '../constants/roles';
import { type Theme, useTheme } from '../../theme';

const ROLE_ICON: Record<Role, LucideIcon> = {
  farmer: Sprout,
  buyer: ShoppingBag,
  dealer: Store,
  expert: Stethoscope,
  admin: ShieldCheck,
};

export interface RoleBadgeProps {
  role: Role;
}

/** A person's role in the role's own colour (SRDS §44), with its icon. */
export function RoleBadge({ role }: RoleBadgeProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accent = theme.colors.accent[role];
  const Icon = ROLE_ICON[role];

  return (
    <View style={[styles.badge, { backgroundColor: accent.soft }]}>
      <Icon color={accent.ink} size={theme.size.iconSm} />
      <Text style={[styles.label, { color: accent.ink }]}>{ROLE_LABELS[role]}</Text>
    </View>
  );
}

function makeStyles({ components, radius, typography, fontWeight }: Theme) {
  return StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: components.badge.gap,
      paddingHorizontal: components.badge.paddingX,
      paddingVertical: components.badge.paddingY,
      borderRadius: radius.pill,
    },
    label: { ...typography.caption, fontWeight: fontWeight.semibold },
  });
}
