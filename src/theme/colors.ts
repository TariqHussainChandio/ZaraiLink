// SRDS v4.0 master color palette (see "implementation plan.md" Module 1). Existing
// `brand`/`semantic`/`neutral` keys are kept for backward compatibility with the ~190
// call sites already styled against them; `background`/`surface`/`text`/`border` are
// additive tokens introduced to match the spec's explicit naming.
export const colors = {
  brand: {
    primary: '#2E7D32', // Deep Green — primary buttons, active nav, major actions
    primaryDark: '#1B5E20', // Forest Green — headers, pressed states
    primaryLight: '#66BB6A', // mid-tone green — avatar fallback, icon accents (kept distinct from primaryTint for contrast against white/light text)
    primaryTint: '#E8F5E9', // Soft Green — pale backgrounds, cards, selected states
    secondary: '#8D6E63', // Earth Brown — agricultural/earth accents
    accent: '#F9A825', // Golden Yellow — highlights, ratings, harvest accents
  },
  semantic: {
    success: '#43A047',
    warning: '#FB8C00',
    error: '#D32F2F',
    info: '#1976D2',
  },
  background: {
    default: '#F8FAF7', // Off White — main application background
    surface: '#FFFFFF', // cards, dialogs, sheets
  },
  text: {
    primary: '#1F2937', // Dark Charcoal
    secondary: '#6B7280', // Gray
  },
  border: '#E5E7EB',
  neutral: {
    white: '#FFFFFF',
    gray50: '#F8FAF7',
    gray100: '#F2F2ED',
    gray200: '#E5E7EB',
    gray300: '#CFCFC4',
    gray400: '#A9A99A',
    gray500: '#6B7280',
    gray600: '#5F5F4F',
    gray700: '#434336',
    gray800: '#2A2A22',
    gray900: '#1F2937',
    black: '#000000',
  },
} as const;

export type Colors = typeof colors;
