import { size } from './dimensions';
import { radius, space } from './spacing';

// Component recipes (A2, D14): the measurements each shared component is built from, in one place, so a component
// never picks its own number.
export const components = {
  screen: { margin: space[4], sectionGap: space[6], headingGap: space[5] },
  button: {
    height: { lg: size.buttonLg, md: size.buttonMd, sm: size.buttonSm },
    paddingX: { lg: space[6], md: space[4], sm: space[3] },
    gap: space[2],
    radius: radius.sm,
    /** A pressed button scales down slightly, so it feels pressed rather than only dimmed. */
    pressedScale: 0.97,
  },
  input: { height: size.input, paddingX: space[3], gap: space[2], radius: radius.sm },
  chip: { height: size.chip, paddingX: space[3], gap: space[1], radius: radius.sm },
  card: { padding: space[4], paddingCompact: space[3], gap: space[3], radius: radius.md },
  row: { minHeight: size.row, paddingX: space[4], paddingY: space[3], gap: space[3] },
  badge: { paddingX: space[2], paddingY: 2, gap: space[1], radius: radius.xs },
  sheet: { radius: radius.lg, padding: space[4], grip: { width: 36, height: 4 } },
  banner: { padding: space[4], gap: space[3], radius: radius.md },
  tab: { pill: { width: 56, height: 30 } },
  /** How far a hit area is extended around a control smaller than touchMin. */
  hitSlop: (controlSize: number) => Math.max(0, Math.ceil((size.touchMin - controlSize) / 2)),
} as const;
