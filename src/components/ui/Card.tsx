import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { lightTheme } from '../../theme';

const { colors, spacing, radii, shadows } = lightTheme;

export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.neutral.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
});
