import React, { useMemo, useState } from 'react';
import { Animated, StyleSheet, TouchableWithoutFeedback, View, ViewProps } from 'react-native';
import { useTheme, type Theme } from '../../theme';

const PRESSED_SCALE = 0.98;

export interface CardProps extends ViewProps {
  onPress?: () => void;
}

/** Plain static container when `onPress` is omitted (every existing usage). Becomes a
 * scale-on-press tappable surface when it is — same motion language as `Button`. */
export function Card({ style, children, onPress, ...rest }: CardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [scale] = useState(() => new Animated.Value(1));

  if (!onPress) {
    return (
      <View style={[styles.card, style]} {...rest}>
        {children}
      </View>
    );
  }

  const animateTo = (toValue: number) =>
    Animated.timing(scale, {
      toValue,
      duration: theme.motion.duration.instant,
      easing: theme.motion.easing.standard,
      useNativeDriver: true,
    }).start();

  return (
    <TouchableWithoutFeedback
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => animateTo(PRESSED_SCALE)}
      onPressOut={() => animateTo(1)}
    >
      <Animated.View style={[styles.card, { transform: [{ scale }] }, style]} {...rest}>
        {children}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

function makeStyles({ colors, spacing, radii, shadows }: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.background.surface,
      borderRadius: radii.lg,
      padding: spacing.lg,
      ...shadows.sm,
    },
  });
}
