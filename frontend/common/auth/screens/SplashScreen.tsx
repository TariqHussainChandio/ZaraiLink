import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme, type Theme } from '../../../theme';
import { BrandPanel } from '../components/BrandPanel';

/** The board panel, full screen, while the session is restored. The spinner is chalk-coloured: the accent mark would be
 * the farmer green on the blackboard green. */
export function SplashScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.screen}>
      <BrandPanel fill />
      <View style={styles.spinner}>
        <ActivityIndicator testID="spinner" accessibilityLabel="Loading" color={theme.colors.onBoard} size="large" />
      </View>
    </View>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.board },
    spinner: { position: 'absolute', left: 0, right: 0, bottom: space[12], alignItems: 'center' },
  });
}
