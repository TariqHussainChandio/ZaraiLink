import { useNavigation } from '@react-navigation/native';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { DealerBusinessStep } from '../../common/auth';
import { useTheme, type Theme } from '../../theme';

/** An approved dealer's business details (SRDS §7), the same form as the application's business step. */
export function BusinessDetailsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <DealerBusinessStep onDone={() => navigation.goBack()} />
    </ScrollView>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    content: { padding: space[4] },
  });
}
