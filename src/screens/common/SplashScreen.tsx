import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../components/ui';
import { lightTheme } from '../../theme';

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ZaraiLink</Text>
      <Spinner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.colors.neutral.white,
    gap: lightTheme.spacing.lg,
  },
  title: {
    fontSize: lightTheme.typography.sizes['3xl'],
    fontWeight: lightTheme.typography.weights.bold as any,
    color: lightTheme.colors.brand.primary,
  },
});
