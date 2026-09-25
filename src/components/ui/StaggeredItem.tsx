import React, { useEffect, useState } from 'react';
import { Animated, ViewStyle } from 'react-native';
import { motion } from '../../theme/motion';

// `motion` (unlike `colors`) is theme-invariant — imported directly here rather than through
// `useTheme()`, since durations/easings don't change between light and dark.
// Capped so a long list doesn't make the tail of the first screenful visibly lag in — after a
// handful of items the stagger has already read as "the list animated in," further delay just
// feels slow.
const MAX_STAGGERED_INDEX = 8;
const STAGGER_STEP_MS = 40;
const RISE_DISTANCE = 12;

export interface StaggeredItemProps {
  index: number;
  style?: ViewStyle;
  children: React.ReactNode;
}

/** Fade + rise entrance for list/grid items, staggered by `index` — used on mount for a
 * FlatList's `renderItem` so the first screenful of results animates in together instead of
 * appearing as a flat cut. Re-renders after the initial mount (e.g. a re-fetch) don't
 * re-trigger it, since the animated values are created once via `useState`. */
export function StaggeredItem({ index, style, children }: StaggeredItemProps) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(RISE_DISTANCE));

  useEffect(() => {
    const delay = Math.min(index, MAX_STAGGERED_INDEX) * STAGGER_STEP_MS;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.duration.base,
        delay,
        easing: motion.easing.decelerate,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: motion.duration.base,
        delay,
        easing: motion.easing.decelerate,
        useNativeDriver: true,
      }),
    ]).start();
    // Deliberately mount-only: `index` is a stable identity for a list position, and `opacity`/
    // `translateY` are refs whose identity never changes — re-running this on every re-render
    // would replay the entrance animation on unrelated updates (e.g. a re-fetch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
