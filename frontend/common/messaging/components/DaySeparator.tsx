import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../../../theme';

/** "Today", "Yesterday", "8 Nov": marks where the day changes in a conversation. A heading, so a screen reader can jump
 * between days. */
export function DaySeparator({ label }: { label: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label} accessibilityRole="header">
        {label}
      </Text>
    </View>
  );
}

function makeStyles({ colors, space, typography, radius }: Theme) {
  return StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: space[3] },
    label: {
      ...typography.caption,
      color: colors.ink2,
      backgroundColor: colors.surfaceSunken,
      paddingHorizontal: space[3],
      paddingVertical: space[1],
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
  });
}
