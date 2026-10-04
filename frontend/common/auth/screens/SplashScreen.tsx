import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../components';
import { useTheme, type Theme } from '../../../theme';

export function SplashScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ZaraiLink</Text>
      <Spinner />
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      gap: space[4],
    },
    title: {
      ...typography.display,
      color: colors.accent.brand.ink,
    },
  });
}
