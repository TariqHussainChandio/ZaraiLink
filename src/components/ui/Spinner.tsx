import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme, type Theme } from '../../theme';

export interface SpinnerProps {
  fullscreen?: boolean;
  size?: 'small' | 'large';
}

export function Spinner({ fullscreen = false, size = 'large' }: SpinnerProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (!fullscreen) {
    return <ActivityIndicator testID="spinner" color={theme.colors.brand.primary} size={size} />;
  }

  return (
    <View style={styles.fullscreen}>
      <ActivityIndicator testID="spinner" color={theme.colors.brand.primary} size={size} />
    </View>
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    fullscreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background.surface,
    },
  });
}
