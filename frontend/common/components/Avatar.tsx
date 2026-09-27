import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../../theme';

export interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
}

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map(part => part[0]?.toUpperCase() ?? '');
  return initials.join('') || '?';
}

export function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimensionStyle]} />;
  }

  return (
    <View style={[styles.fallback, dimensionStyle]}>
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{getInitials(name)}</Text>
    </View>
  );
}

function makeStyles({ colors, typography }: Theme) {
  return StyleSheet.create({
    image: {
      backgroundColor: colors.border,
    },
    fallback: {
      backgroundColor: colors.brand.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initials: {
      color: colors.neutral.white,
      fontWeight: typography.weights.semibold,
    },
  });
}
