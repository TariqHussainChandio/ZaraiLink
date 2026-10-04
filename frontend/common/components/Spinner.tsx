import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { type Theme, useRoleAccent, useTheme } from '../../theme';

export interface SpinnerProps {
  fullscreen?: boolean;
  size?: 'small' | 'large';
}

/** Work in progress that has no shape to show. Lists and cards load as skeletons instead. */
export function Spinner({ fullscreen = false, size = 'large' }: SpinnerProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const indicator = <ActivityIndicator testID="spinner" accessibilityLabel="Loading" color={accent.mark} size={size} />;

  if (!fullscreen) return indicator;
  return <View style={styles.fullscreen}>{indicator}</View>;
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    fullscreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ground },
  });
}
