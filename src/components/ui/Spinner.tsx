import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { lightTheme } from '../../theme';

export interface SpinnerProps {
  fullscreen?: boolean;
  size?: 'small' | 'large';
}

export function Spinner({ fullscreen = false, size = 'large' }: SpinnerProps) {
  if (!fullscreen) {
    return <ActivityIndicator color={lightTheme.colors.brand.primary} size={size} />;
  }

  return (
    <View style={styles.fullscreen}>
      <ActivityIndicator color={lightTheme.colors.brand.primary} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.colors.neutral.white,
  },
});
