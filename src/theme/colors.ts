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

// Dark-mode counterpart. `neutral` is left UNCHANGED from `colors` — it's literal color names
// (e.g. `neutral.white` really does mean white), and most of its ~200 call sites use it for
// things that must stay the same regardless of theme (white text on a green Button). The four
// genuinely structural, theme-dependent tokens — `background.default/surface`,
// `text.primary/secondary`, `border` — get real dark values; these are what screens/components
// migrated to `useTheme()` read for chrome (page/card backgrounds, primary/secondary text,
// hairline borders).
//
// `brand.primary` and `semantic.*` DO get brightened here, unlike `neutral` — 15+ existing call
// sites use `colors.brand.primary` directly as TEXT/icon color (not just as a filled button
// background), and the original #2E7D32 is dark-on-dark against a near-black page background
// (fails contrast). Brightening it in the palette fixes every one of those call sites without
// touching their code — they already read `theme.colors.brand.primary`, they just get a
// different value now. Filled backgrounds (a green Button, a selected chip) are unaffected
// either way since white text on `#66BB6A` still contrasts fine.
export const darkColors = {
  ...colors,
  brand: {
    ...colors.brand,
    primary: '#66BB6A',
    primaryDark: '#43A047',
  },
  semantic: {
    success: '#66BB6A',
    warning: '#FFA726',
    error: '#EF5350',
    info: '#42A5F5',
  },
  background: {
    default: '#10140F', // near-black with a faint green cast, not pure black — matches the brand's warm/organic tone rather than a generic dark UI
    surface: '#1B211A', // one step up — cards/sheets sit visibly above the page
  },
  text: {
    primary: '#EDF1E9', // off-white, not pure white — softer on a dark surface
    secondary: '#98A398',
  },
  border: '#2C332B',
} as const;
