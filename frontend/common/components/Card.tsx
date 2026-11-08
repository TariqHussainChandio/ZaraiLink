import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { type Accent, type Theme, useRoleAccent, useTheme } from '../../theme';

export interface CardProps extends ViewProps {
  /** Makes the whole card one target. */
  onPress?: () => void;
  /** md (16, default), sm (12, compact), none (the content pads itself, as for an image at the top). */
  pad?: 'md' | 'sm' | 'none';
  /** A chosen option: a 2px border in the scope's accent. */
  selected?: boolean;
}

/** The facts about one thing (a listing, an order, an application) on `surface` with a 1px `line` border. Cards sit on
 * `ground`, never on another card, and cast no shadow: only floating layers take elevation. A pressable card ripples
 * and never scales; its `testID` and `accessibilityLabel` belong to the pressable itself, which is what a screen reader
 * and a test find. */
export function Card({ style, children, onPress, pad = 'md', selected = false, ...rest }: CardProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const look = [styles.card, styles[pad], selected && styles.selected, style];

  if (!onPress) {
    return (
      <View style={look} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      android_ripple={{ color: theme.colors.ripple }}
      {...rest}
      onPress={onPress}
      style={[look, styles.pressable]}
    >
      {children}
    </Pressable>
  );
}

function makeStyles({ colors, borders, components }: Theme, accent: Accent) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: components.card.radius,
      borderWidth: borders.hairline,
      borderColor: colors.line,
    },
    md: { padding: components.card.padding },
    sm: { padding: components.card.paddingCompact },
    none: { padding: 0, overflow: 'hidden' },
    // The ripple is clipped to the card's rounded corners.
    pressable: { overflow: 'hidden' },
    selected: { borderWidth: borders.selected, borderColor: accent.mark },
  });
}
