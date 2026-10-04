import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { Role } from '../constants/roles';
import { type Theme, useTheme } from '../../theme';

export interface AvatarProps {
  uri?: string | null;
  name?: string;
  /** Tints the initials in the role's colour. */
  role?: Role;
  /** avatarSm 32, avatarMd 40 (default), avatarLg 64. */
  size?: number;
  /** A ring in the role colour, for your own profile header. */
  ring?: boolean;
}

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map(part => part[0]?.toUpperCase() ?? '');
  return initials.join('') || '?';
}

/** A person, by their photo or by their initials on their role's tint. */
export function Avatar({ uri, name, role, size, ring = false }: AvatarProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const side = size ?? theme.size.avatarMd;
  const accent = theme.colors.accent[role ?? 'brand'];
  const shape = { width: side, height: side, borderRadius: theme.radius.pill };
  const ringStyle = ring ? { borderWidth: theme.borders.selected, borderColor: accent.mark } : null;

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, shape, ringStyle]} accessibilityLabel={name} />;
  }

  return (
    <View style={[styles.fallback, shape, { backgroundColor: accent.soft }, ringStyle]} accessibilityLabel={name}>
      {/* Initials scale with the circle: four tenths of its side. */}
      <Text style={[styles.initials, { color: accent.ink, fontSize: Math.round(side * 0.4) }]}>{getInitials(name)}</Text>
    </View>
  );
}

function makeStyles({ colors, typography }: Theme) {
  return StyleSheet.create({
    image: { backgroundColor: colors.surfaceSunken },
    fallback: { alignItems: 'center', justifyContent: 'center' },
    initials: { fontFamily: typography.label.fontFamily, fontWeight: typography.title.fontWeight },
  });
}
