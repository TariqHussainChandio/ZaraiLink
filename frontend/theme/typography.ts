import type { TextStyle } from 'react-native';

// The design system's type scale (D15, Rate Board). Two families, each with one job:
//  - `board` (Barlow Semi Condensed, only 600 and 700 exist) for headlines, titles and every figure: letters from road
//    signs and number plates, compact and readable at a distance, like a mandi rate board. Never a sentence in it.
//  - `text` (Atkinson Hyperlegible Next) for everything people read; drawn for low-vision readers, so easily confused
//    letters stay distinct in glare and on low-resolution screens.
// Both are embedded at build time by the expo-font plugin (app.config.ts) as Android font families, so `fontWeight`
// picks the file. Figures use tabular numerals so columns of prices and quantities line up.
const fontFamily = {
  board: 'BarlowSemiCondensed',
  text: 'AtkinsonHyperlegibleNext',
} as const;

// Size, line height, family and weight are always present (a component may do arithmetic on them); tracking and numerals
// are optional.
interface TypeStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: NonNullable<TextStyle['fontWeight']>;
  letterSpacing?: number;
  fontVariant?: TextStyle['fontVariant'];
}

function style(family: string, fontSize: number, lineHeight: number, fontWeight: TypeStyle['fontWeight'], extra: Partial<TypeStyle> = {}): TypeStyle {
  return { fontFamily: family, fontSize, lineHeight, fontWeight, ...extra };
}

const { board, text } = fontFamily;
const tabular: Pick<TypeStyle, 'fontVariant'> = { fontVariant: ['tabular-nums'] };

export const typography = {
  /** The situation line at the top of a home screen ("3 orders to dispatch"). Once per screen. */
  display: style(board, 34, 38, '700', { letterSpacing: -0.2, ...tabular }),
  /** The large title on a tab's first screen; sign-in and registration titles. */
  headline: style(board, 28, 32, '700', tabular),
  /** The product, order or application name on its detail screen. */
  titleLg: style(board, 24, 28, '700', tabular),
  /** An inner screen's app-bar title. */
  titleBar: style(board, 20, 24, '700', tabular),
  /** The price on a detail screen's rate plate; the total at checkout. */
  figureXl: style(board, 40, 44, '700', tabular),
  /** The price on a listing card's plate; a count on a home screen. */
  figureLg: style(board, 28, 32, '700', tabular),
  /** Prices in rows and line items. */
  price: style(board, 20, 24, '700', tabular),
  /** Quantities, stock counts and table cells. */
  figure: style(board, 17, 22, '600', tabular),
  /** Order numbers, SKUs, receipt and registration numbers. */
  code: style(board, 15, 20, '600', { letterSpacing: 0.3, ...tabular }),
  /** Section headings, sheet and dialog titles. */
  title: style(text, 18, 24, '700'),
  /** Advisory text, chat messages and input values. */
  bodyLg: style(text, 17, 26, '400'),
  /** Default running text; 16 is the floor for anything read in the field. */
  body: style(text, 16, 24, '400'),
  /** Primary lines that must stand out: product, seller and person names. */
  bodyStrong: style(text, 16, 24, '600'),
  /** Buttons, tabs, chips and field labels. */
  label: style(text, 16, 20, '600'),
  /** Metadata, helper text and badges: the smallest text in the app. */
  caption: style(text, 14, 20, '500'),
} satisfies Record<string, TypeStyle>;

/** Weights for the rare line that needs more emphasis than its style gives it. */
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;
