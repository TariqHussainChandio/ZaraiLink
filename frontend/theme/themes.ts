import { colors, darkColors } from './colors';
import { typography } from './typography';
import { radii, shadows, spacing } from './spacing';
import { roleColors, roleColorsDark } from './roleColors';
import { moduleAccents, moduleAccentsDark } from './moduleAccents';
import { statusColors, statusColorsDark } from './statusColors';
import { motion } from './motion';

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
  motion,
} as const;

// Real dark palette (see colors.ts/roleColors.ts/statusColors.ts/moduleAccents.ts for the
// per-token reasoning) — `typography`/`spacing`/`radii`/`shadows`/`motion` are theme-invariant,
// only shared with light via the same imports.
export const darkTheme = {
  dark: true,
  colors: darkColors,
  typography,
  spacing,
  radii,
  shadows,
  roleColors: roleColorsDark,
  moduleAccents: moduleAccentsDark,
  statusColors: statusColorsDark,
  motion,
} as const;

export type Theme = typeof lightTheme | typeof darkTheme;
