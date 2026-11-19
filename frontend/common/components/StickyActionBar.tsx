import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useComposerInsets } from '../../hooks/useComposerInsets';
import { type Theme, useTheme } from '../../theme';

export interface StickyActionBarProps {
  /** The figure the action acts on: a QuantityStepper, or a RatePlate with the total. Takes the room the button leaves. */
  leading?: React.ReactNode;
  /** The screen's one primary action: a `Button` at `lg`. Show only the actions this viewer can take at this status. */
  children: React.ReactNode;
}

/** The screen's one primary action, pinned to the bottom with the figure it acts on: `surface`, a top hairline and
 * elevation 1. It clears the gesture area itself on a screen with no tab bar under it. Pass it to ScreenScaffold's
 * `footer`, which lays it out below the scrolling content, so nothing hides behind it. A second, destructive action goes
 * in the content as a quiet button that opens a confirm sheet. */
export function StickyActionBar({ leading, children }: StickyActionBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { bottom } = useComposerInsets();

  return (
    <View style={[styles.bar, { paddingBottom: theme.space[3] + bottom }]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={leading ? styles.action : styles.alone}>{children}</View>
    </View>
  );
}

function makeStyles({ colors, space, borders, shadows }: Theme) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingHorizontal: space[4],
      paddingTop: space[3],
      backgroundColor: colors.surface,
      borderTopWidth: borders.hairline,
      borderTopColor: colors.line,
      ...shadows.elev1,
    },
    leading: { flexShrink: 1, minWidth: 0 },
    action: { flex: 1, minWidth: 0 },
    alone: { flex: 1 },
  });
}
