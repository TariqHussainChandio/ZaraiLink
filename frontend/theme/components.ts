import { size } from './dimensions';
import { radius, space } from './spacing';

// Component recipes (D15, Rate Board): the measurements each shared component is built from, in one place, so a component
// never picks its own number.
export const components = {
  screen: { margin: space[4], sectionGap: space[6], headingGap: space[3] },
  button: {
    height: { lg: size.buttonLg, md: size.buttonMd, sm: size.buttonSm },
    paddingX: { lg: space[6], md: space[4], sm: space[3] },
    gap: space[2],
    radius: radius.sm,
  },
  input: { height: size.input, paddingX: space[3], gap: space[2], radius: radius.sm },
  chip: { height: size.chip, paddingX: space[3], gap: space[1], radius: radius.sm },
  card: { padding: space[4], paddingCompact: space[3], gap: space[3], radius: radius.md },
  row: { minHeight: size.row, paddingX: space[4], paddingY: space[3], gap: space[3] },
  badge: { paddingX: space[2], paddingY: 2, gap: space[1], radius: radius.xs },
  // A sheet stops at 90% of the window, so a long form never pushes its footer off a small phone.
  sheet: { radius: radius.lg, padding: space[4], grip: { width: 36, height: 4 }, maxHeight: '90%' },
  /** The rate plate (a price chalked on the board): `sm` is the compact padding of a plate on a card or in a bar; the
   * currency is drawn at this fraction of the figure. */
  plate: { radius: radius.sm, paddingX: space[3], paddingTop: space[1], paddingBottom: space[2], paddingXSm: space[2], paddingYSm: 2, currencyScale: 0.6 },
  /** A snackbar floats above the tab bar, which is `gap` above the content's bottom edge. It stays 6 s, longer with an
   * action to read and reach. */
  snackbar: {
    minHeight: size.input,
    paddingLeft: space[4],
    paddingRight: space[1],
    gap: space[2],
    margin: space[4],
    radius: radius.sm,
    duration: { message: 6000, withAction: 10000 },
  },
  banner: { padding: space[4], gap: space[3], radius: radius.md },
  tab: { pill: { width: 56, height: 30 } },
  /** How far a hit area is extended around a control smaller than touchMin. */
  hitSlop: (controlSize: number) => Math.max(0, Math.ceil((size.touchMin - controlSize) / 2)),
} as const;
