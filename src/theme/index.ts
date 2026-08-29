import { colors } from './colors';
import { typography } from './typography';
import { radii, shadows, spacing } from './spacing';
import { roleColors } from './roleColors';
import { moduleAccents } from './moduleAccents';
import { statusColors } from './statusColors';

export const lightTheme = {
  dark: false,
  colors,
  typography,
  spacing,
  radii,
  shadows,
  roleColors,
  moduleAccents,
  statusColors,
} as const;

// Stub — same tokens as light for now, revisit when dark-mode styling is scoped.
export const darkTheme = lightTheme;

export type Theme = typeof lightTheme;

export * from './colors';
export * from './typography';
export * from './spacing';
export * from './roleColors';
export * from './moduleAccents';
export * from './statusColors';
