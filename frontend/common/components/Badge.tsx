import type { LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Theme, type ToneKey, useTheme } from '../../theme';


export interface BadgeProps {
  label: string;
  tone?: ToneKey;
  /** A status always carries its icon (StatusBadge passes it); a plain tag such as a specialisation may have none. */
  icon?: LucideIcon;
  size?: 'md' | 'sm';
}

/** A short label on a tone's tint. Only `danger` is a solid block, so a failure stands out by lightness as well as
 * hue. For a status, use StatusBadge, which takes the tone, icon and word from the shared vocabulary. */
export function Badge({ label, tone = 'neutral', icon: Icon, size = 'md' }: BadgeProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const t = theme.colors.status[tone];
  const solid = tone === 'danger';
  const fg = solid ? theme.colors.onAccent : t.ink;

  return (
    <View style={[styles.badge, size === 'sm' && styles.small, { backgroundColor: solid ? theme.colors.status.danger.fill : t.soft }]}>
      {Icon ? <Icon color={solid ? fg : t.mark} size={theme.size.iconSm} /> : null}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

function makeStyles({ components, space, typography, fontWeight }: Theme) {
  const { badge } = components;
  return StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: badge.gap,
      paddingHorizontal: badge.paddingX,
      paddingVertical: badge.paddingY,
      borderRadius: badge.radius,
    },
    // Dense rows: the same text, less padding.
    small: { paddingHorizontal: space[1], paddingVertical: 0 },
    label: { ...typography.caption, fontWeight: fontWeight.semibold },
  });
}
