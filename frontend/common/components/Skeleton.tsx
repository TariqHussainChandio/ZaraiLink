import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { type Theme, useTheme } from '../../theme';

const PULSE_MIN_OPACITY = 0.4;
const PULSE_MAX_OPACITY = 1;

/** One pulsing block in `surfaceSunken`: the shape of content that is still loading. The pulse stops when the phone
 * asks for reduced motion. Every other skeleton shape in this file is built from it. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [opacity] = useState(() => new Animated.Value(PULSE_MAX_OPACITY));

  useEffect(() => {
    let pulse: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(reduce => {
        if (reduce || cancelled) return;
        const step = (toValue: number) =>
          Animated.timing(opacity, { toValue, duration: theme.motion.duration.slow * 2, easing: theme.motion.easing.standard, useNativeDriver: true });
        pulse = Animated.loop(Animated.sequence([step(PULSE_MIN_OPACITY), step(PULSE_MAX_OPACITY)]));
        pulse.start();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      pulse?.stop();
    };
  }, [opacity, theme.motion]);

  return <Animated.View style={[styles.block, { opacity }, style]} />;
}

/** A listing card: image block, title line, price line. */
export function SkeletonCard() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.card}>
      <Skeleton style={styles.cardImage} />
      <View style={styles.cardBody}>
        <Skeleton style={styles.lineWide} />
        <Skeleton style={styles.lineNarrow} />
      </View>
    </View>
  );
}

/** A list row: a leading tile, two text lines and a trailing figure. */
export function SkeletonListItem() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.row}>
      <Skeleton style={styles.rowIcon} />
      <View style={styles.rowBody}>
        <Skeleton style={styles.lineWide} />
        <Skeleton style={styles.lineNarrow} />
      </View>
      <Skeleton style={styles.rowTrailing} />
    </View>
  );
}

/** N list rows: the list-shaped placeholder for a loading list. */
export function SkeletonList({ count = 6 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </View>
  );
}

function makeStyles({ colors, space, size, radius, borders, components, typography }: Theme) {
  // A text line is as tall as a caption's letters, not its line box.
  const line = typography.caption.fontSize;
  return StyleSheet.create({
    block: { backgroundColor: colors.surfaceSunken, borderRadius: radius.xs },
    card: {
      flex: 1,
      margin: space[1],
      borderRadius: components.card.radius,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    cardImage: { width: '100%', height: size.photoLg, borderRadius: 0 },
    cardBody: { padding: space[3], gap: space[2] },
    row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: size.row, paddingVertical: space[3], paddingHorizontal: space[4] },
    rowIcon: { width: size.avatarMd, height: size.avatarMd, borderRadius: radius.sm },
    rowBody: { flex: 1, gap: space[2] },
    rowTrailing: { width: size.touchMin, height: line },
    lineWide: { height: line, width: '80%' },
    lineNarrow: { height: line, width: '45%' },
  });
}
