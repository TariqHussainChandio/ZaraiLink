import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme, type Theme } from '../../theme';

const PULSE_MIN_OPACITY = 0.35;
const PULSE_MAX_OPACITY = 0.85;

/** Base shimmer block — a plain opacity pulse, not a moving gradient (no gradient library is
 * installed in this project, and a pulse reads as "loading" just as clearly without adding one).
 * Every other skeleton shape in this file is built from this. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const opacity = useRef(new Animated.Value(PULSE_MIN_OPACITY)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: PULSE_MAX_OPACITY,
          duration: theme.motion.duration.slow,
          easing: theme.motion.easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: PULSE_MIN_OPACITY,
          duration: theme.motion.duration.slow,
          easing: theme.motion.easing.standard,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, theme.motion]);

  return <Animated.View style={[styles.block, { opacity }, style]} />;
}

/** Mirrors `ListingCard`'s shape (image block, title line, price line) — for the marketplace
 * grid and any other image-forward card list. */
export function SkeletonCard() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.card}>
      <Skeleton style={styles.cardImage} />
      <View style={styles.cardBody}>
        <Skeleton style={styles.lineWide} />
        <Skeleton style={[styles.lineNarrow, styles.lineSpacing]} />
      </View>
    </View>
  );
}

/** Mirrors a typical dashboard/list row (leading icon or avatar, two text lines, trailing
 * badge-shaped block) — for order lists, inventory lists, and dashboard activity feeds. */
export function SkeletonListItem() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.row}>
      <Skeleton style={styles.rowIcon} />
      <View style={styles.rowBody}>
        <Skeleton style={styles.lineWide} />
        <Skeleton style={[styles.lineNarrow, styles.lineSpacing]} />
      </View>
      <Skeleton style={styles.rowTrailing} />
    </View>
  );
}

/** N repeated `SkeletonListItem`s — the common case of "replace a fullscreen Spinner with a
 * list-shaped placeholder" in one call. */
export function SkeletonList({ count = 6 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </View>
  );
}

function makeStyles({ colors, spacing, radii }: Theme) {
  return StyleSheet.create({
    block: {
      backgroundColor: colors.border,
      borderRadius: radii.sm,
    },
    card: {
      flex: 1,
      margin: spacing.xs,
      borderRadius: radii.lg,
      overflow: 'hidden',
      backgroundColor: colors.background.surface,
    },
    cardImage: {
      width: '100%',
      height: 110,
      borderRadius: 0,
    },
    cardBody: {
      padding: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: radii.full,
    },
    rowBody: {
      flex: 1,
    },
    rowTrailing: {
      width: 48,
      height: 20,
      borderRadius: radii.sm,
    },
    lineWide: {
      height: 12,
      width: '80%',
    },
    lineNarrow: {
      height: 10,
      width: '45%',
    },
    lineSpacing: {
      marginTop: spacing.xs,
    },
  });
}
