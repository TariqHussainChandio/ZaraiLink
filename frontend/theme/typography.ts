import type { TextStyle } from 'react-native';

// The design system's type scale (A2, D14). Words are set in Atkinson Hyperlegible Next, drawn for low-vision readers,
// whose easily confused letters stay distinct in glare and on low-resolution screens; numbers people compare (prices,
// quantities, stock, order numbers) are set in Atkinson Hyperlegible Mono so columns line up. Both are embedded at
// build time by the expo-font plugin (app.config.ts) as Android font families, so `fontWeight` picks the file.
const fontFamily = {
  sans: 'AtkinsonHyperlegibleNext',
  mono: 'AtkinsonHyperlegibleMono',
} as const;

type TypeStyle = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing' | 'textTransform'>;

function style(family: string, fontSize: number, lineHeight: number, fontWeight: TextStyle['fontWeight'], extra: Partial<TypeStyle> = {}): TypeStyle {
  return { fontFamily: family, fontSize, lineHeight, fontWeight, ...extra };
}

const { sans, mono } = fontFamily;

export const typography = {
  /** The one greeting or hero line on a home screen. Once per screen. */
  display: style(sans, 32, 40, '700', { letterSpacing: -0.32 }),
  /** Large app bar title on a tab root; sign-in and registration titles. */
  headline: style(sans, 26, 32, '700'),
  /** The product, order or application name on its detail screen. */
  titleLg: style(sans, 21, 28, '700'),
  /** Section headings, inner app bar titles, sheet and dialog titles. */
  title: style(sans, 18, 24, '700'),
  /** Advisory text, chat messages and input values. */
  bodyLg: style(sans, 17, 26, '400'),
  /** Default running text and list primary lines; 16 is the floor for anything read in the field. */
  body: style(sans, 16, 24, '400'),
  /** Primary lines that must stand out: product and seller names. */
  bodyStrong: style(sans, 16, 24, '600'),
  /** Buttons, tabs, chips and field labels. */
  label: style(sans, 16, 20, '600'),
  /** Metadata, helper text and badges: the smallest running text in the app. */
  caption: style(sans, 14, 20, '500'),
  /** Short uppercase kickers above a group; never a sentence. */
  overline: style(sans, 12, 16, '700', { letterSpacing: 0.96, textTransform: 'uppercase' }),
  /** The hero number on a dashboard tile or the total on an order confirmation. */
  figureLg: style(mono, 28, 36, '700'),
  /** Prices on cards and detail screens. */
  price: style(mono, 18, 24, '700'),
  /** Line items, quantities, stock counts and table cells. */
  figure: style(mono, 16, 22, '500'),
  /** Order numbers, SKUs, receipt and registration numbers. */
  code: style(mono, 14, 20, '500'),
} satisfies Record<string, TypeStyle>;

/** Weights for the rare line that needs more emphasis than its style gives it. */
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;
