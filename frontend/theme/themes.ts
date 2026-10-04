import { borders } from './borders';
import { darkColors, lightColors, type ThemeColors } from './colors';
import { components } from './components';
import { size } from './dimensions';
import { motion } from './motion';
import { shadows } from './shadows';
import { radius, space } from './spacing';
import { fontWeight, typography } from './typography';

// Only colours differ between the themes; type, space, shape, sizes and motion are shared.
const shared = { typography, fontWeight, space, radius, size, borders, shadows, components, motion } as const;

export interface Theme extends Readonly<typeof shared> {
  dark: boolean;
  colors: ThemeColors;
}

export const lightTheme: Theme = { ...shared, dark: false, colors: lightColors };
export const darkTheme: Theme = { ...shared, dark: true, colors: darkColors };
