// Animation durations and easing curves shared by every animated interaction.
import { Easing } from 'react-native';

// Shared duration/easing pairs so every animated interaction in the app (press feedback, list
// stagger, skeleton shimmer) moves at the same speed instead of every screen picking its own
// numbers. Durations in ms, matching RN's `Animated` API directly.
const duration = {
  instant: 100,
  fast: 150,
  base: 220,
  slow: 320,
} as const;

const easing = {
  standard: Easing.bezier(0.4, 0.0, 0.2, 1),
  decelerate: Easing.out(Easing.cubic),
  accelerate: Easing.in(Easing.cubic),
} as const;

// The motion tokens the theme exposes as `theme.motion`.
export const motion = { duration, easing } as const;
