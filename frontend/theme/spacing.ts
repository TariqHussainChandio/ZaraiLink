// Space and corners (A2, D14). Space is a 4-point grid named by step, as the design system names it (`space-4` is
// `space[4]`): the screen side margin is space[4], sections are space[6] apart, a heading sits space[5] above its
// content, cards in a grid are space[3] apart.
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  12: 48,
} as const;

// Corners: xs for status badges, sm for buttons, inputs, chips and images, md for cards, list groups and dialogs,
// lg for the top corners of bottom sheets only, pill for the active tab pill, avatars, count badges and search.
export const radius = {
  xs: 3,
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;
