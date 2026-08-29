import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { lightTheme } from '../../theme';

export interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
}

const { colors, typography } = lightTheme;

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map(part => part[0]?.toUpperCase() ?? '');
  return initials.join('') || '?';
}

export function Avatar({ uri, name, size = 40 }: AvatarProps) {
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

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.neutral.gray200,
  },
  fallback: {
    backgroundColor: colors.brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.neutral.white,
    fontWeight: typography.weights.semibold as any,
  },
});
