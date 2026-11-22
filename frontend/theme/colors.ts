// ZaraiLink colours: the approved design system's tokens (D15, Rate Board, https://claude.ai/artifact/TszKUgaoe99eChm1KYw5TD)
// with D20's olive and earth-brown brand, light and dark. Five materials: field (`ground`), paper (`surface`), board (`board`), chalk (`onBoard`, `boardInk2`)
// and ink. The role and module identity values are SRDS §44's and did not change from D14. contrast.test.ts holds every
// text, icon and control pairing to WCAG 2 in both themes, so a changed value that fails contrast fails the tests.

/** A role or module accent: `mark` for icons, indicators and identity; `fill` for primary buttons (with `onAccent` on
 * it); `ink` for accent text on `surface` and on `soft`; `soft` for tints (selected chips, the active tab pill). */
export interface Accent {
  mark: string;
  fill: string;
  ink: string;
  soft: string;
}

export type AccentKey = 'brand' | 'farmer' | 'buyer' | 'dealer' | 'expert' | 'admin' | 'ai' | 'inventory';
export type ToneKey = 'info' | 'success' | 'warning' | 'neutral' | 'danger';

// D20 (2026-11-22, replaces D15's blackboard green): ZaraiLink's brand is olive green, with earth brown as its second
// colour. The brand accent draws every screen outside a role's own marks: splash, sign-in, registration and the app bar
// of every shell. A farmer's own screens keep the farmer green (SRDS §44), below.
const lightBrand: Accent = { mark: '#556B2F', fill: '#556B2F', ink: '#556B2F', soft: '#EEF2E3' };
const darkBrand: Accent = { mark: '#A8C07A', fill: '#B4CB87', ink: '#BFD394', soft: '#1F2814' };
// D20: earth brown, the brand's second colour: prices and the brand's secondary marks.
const lightSecondary: Accent = { mark: '#7B4B2A', fill: '#7B4B2A', ink: '#6B4024', soft: '#F4EAE1' };
const darkSecondary: Accent = { mark: '#D2A27A', fill: '#DDB28E', ink: '#E3BE9E', soft: '#2E1F14' };
const lightFarmer: Accent = { mark: '#2E7D32', fill: '#2E7D32', ink: '#1E6123', soft: '#E3F0E2' };
const darkFarmer: Accent = { mark: '#6CBF70', fill: '#7CC97F', ink: '#93D395', soft: '#1B301C' };

export const lightColors = {
  /** Screen background behind every list and form. */
  ground: '#EDF1E8',
  /** Cards, rows, app bars, tab bars, sheets and inputs. */
  surface: '#FFFFFF',
  /** Search fields, skeletons, image wells and disabled inputs. */
  surfaceSunken: '#E3E8DE',
  /** 1px hairlines: card borders and dividers (decoration only). */
  line: '#D2D9CC',
  /** Borders of inputs, checkboxes and secondary buttons. */
  lineStrong: '#646F5E',
  /** Primary text and icons. */
  ink: '#111813',
  /** Secondary text: metadata, supporting lines, inactive tab labels. */
  ink2: '#364036',
  /** Tertiary text: timestamps, placeholders, helper text. */
  ink3: '#525D4F',
  /** Disabled labels, only inside a disabled control. */
  inkDisabled: '#9AA294',
  /** The filled star of a rating: amber, 3:1 on `surface` (a graphic, not text). */
  rating: '#B86E00',
  /** Text and icons on every accent `fill` and on `status.danger.fill`: white in light, near-black in dark. */
  onAccent: '#FFFFFF',
  /** The focus ring: 2px, 2px outside the control. */
  focus: '#0B57D0',
  /** Behind bottom sheets and dialogs. */
  scrim: '#0D110C99',
  /** The brand panel on splash and sign-in, and the photo viewer's ground: olive (D20). No control sits on it. */
  board: '#556B2F',
  /** The wordmark and text on the brand panel. */
  onBoard: '#FFFFFF',
  /** Secondary text on the brand panel. */
  boardInk2: '#E9EEDC',
  /** Every app bar in every shell is the brand olive (D20), with `onAppBar` for its title and icons. */
  appBar: '#556B2F',
  onAppBar: '#FFFFFF',
  /** The Android press ripple on `surface`, `ground` and `surfaceSunken` controls: rows, icon buttons, tabs, chips, cards. */
  ripple: '#1118131F',
  /** The press ripple on an accent fill or `status.danger.fill` (primary and destructive buttons). */
  rippleOnFill: '#FFFFFF47',
  /** The brand's second colour, earth brown (D20). */
  secondary: lightSecondary,
  accent: {
    brand: lightBrand,
    // SRDS §44: the farmer accent stays the farmer green (#2E7D32) although the brand is now olive (D20).
    farmer: lightFarmer,
    buyer: { mark: '#1976D2', fill: '#1565C0', ink: '#1257A8', soft: '#E3EDFA' },
    // SRDS #EF6C00 is a mark only: white text on it is 3.1:1, so dealer buttons use the darker fill.
    dealer: { mark: '#EF6C00', fill: '#A94700', ink: '#984000', soft: '#FCEBDC' },
    expert: { mark: '#7B1FA2', fill: '#7B1FA2', ink: '#6A1B9A', soft: '#F2E6F7' },
    admin: { mark: '#374151', fill: '#374151', ink: '#374151', soft: '#E8EBEF' },
    // SRDS #00897B is a mark only: white text on it is 4.3:1, so advisory buttons use the darker fill.
    ai: { mark: '#00897B', fill: '#00695C', ink: '#00655A', soft: '#DDF1EE' },
    // D20: the dealer's inventory system, a separate app inside ZaraiLink, is drawn in the brand's second colour.
    inventory: lightSecondary,
  } satisfies Record<AccentKey, Accent>,
  /** Module accents (SRDS §44): icons and section marks for a feature area. Marketplace, orders, dealer, expert and AI
   * share their role's mark; payments and notifications have their own. */
  module: {
    marketplace: lightFarmer.mark,
    orders: '#1976D2',
    dealer: '#EF6C00',
    expert: '#7B1FA2',
    ai: '#00897B',
    payments: '#43A047',
    paymentsInk: '#1E6123',
    /** The unread dot and count badge only; never text. */
    notifications: '#F9A825',
    notificationsInk: '#744E00',
    notificationsSoft: '#FDF3D6',
    /** The count on the amber badge, in both themes. */
    onNotifications: '#1F1600',
  },
  status: {
    info: { mark: '#1565C0', ink: '#0F55A3', soft: '#E3EDFA' },
    success: { mark: '#2E7D32', ink: '#1E6123', soft: '#E3F0E2' },
    warning: { mark: '#B86E00', ink: '#824700', soft: '#FCEFD8' },
    neutral: { mark: '#5C6758', ink: '#384235', soft: '#EAEDE7' },
    // The one solid status: rejected, failed and out of stock read as a dark block, apart from success by lightness.
    danger: { mark: '#C62828', ink: '#A11D1D', soft: '#FAE5E3', fill: '#B3261E' },
  },
};

export type ThemeColors = typeof lightColors;

export const darkColors: ThemeColors = {
  ground: '#0A0E0B',
  surface: '#151B17',
  surfaceSunken: '#1E2620',
  line: '#2B342D',
  lineStrong: '#7D897A',
  ink: '#E8EDE6',
  ink2: '#BAC4B6',
  ink3: '#98A394',
  inkDisabled: '#5A6456',
  rating: '#F0A53C',
  // The dark fills are light tints, so the text on them is dark.
  onAccent: '#0B1009',
  focus: '#8AB4F8',
  scrim: '#000000B3',
  // The board darkens in the dark theme so the brand panel does not glare.
  board: '#3A4A20',
  onBoard: '#F4F7F2',
  boardInk2: '#D5DEC2',
  // A deep olive in the dark theme, so the bar stays the brand colour without glaring.
  appBar: '#3A4A20',
  onAppBar: '#F4F7F2',
  ripple: '#E8EDE629',
  // The dark fills are light tints, so the ripple on them is dark.
  rippleOnFill: '#0B10093D',
  secondary: darkSecondary,
  accent: {
    brand: darkBrand,
    farmer: darkFarmer,
    buyer: { mark: '#64A9F2', fill: '#7AB6F5', ink: '#98C6F8', soft: '#15283D' },
    dealer: { mark: '#FF9A4D', fill: '#FFA868', ink: '#FFB988', soft: '#382212' },
    expert: { mark: '#C28BE0', fill: '#CD9CE8', ink: '#D8B0EE', soft: '#2C1A36' },
    admin: { mark: '#A5AFBD', fill: '#B3BCC8', ink: '#C2CAD4', soft: '#232830' },
    ai: { mark: '#4DB8AD', fill: '#5EC6BB', ink: '#84D5CC', soft: '#10302C' },
    inventory: darkSecondary,
  },
  module: {
    marketplace: darkFarmer.mark,
    orders: '#64A9F2',
    dealer: '#FF9A4D',
    expert: '#C28BE0',
    ai: '#4DB8AD',
    payments: '#6CBF70',
    paymentsInk: '#93D395',
    notifications: '#F9A825',
    notificationsInk: '#F7C660',
    notificationsSoft: '#35290A',
    onNotifications: '#1F1600',
  },
  status: {
    info: { mark: '#64A9F2', ink: '#98C6F8', soft: '#15283D' },
    success: { mark: '#6CBF70', ink: '#93D395', soft: '#1B301C' },
    warning: { mark: '#F0A53C', ink: '#F7C660', soft: '#35290A' },
    neutral: { mark: '#98A393', ink: '#C4CCBF', soft: '#252C23' },
    danger: { mark: '#F07A72', ink: '#F6A39D', soft: '#3A1715', fill: '#F28D86' },
  },
};
