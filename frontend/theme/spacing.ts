// Space and corners (D15, Rate Board). Space is a 4-point grid named by step, as the design system names it (`space-4` is
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

// Corners are crisp, like a painted sign: xs for status badges, sm for buttons, inputs, chips, thumbnails and rate
// plates, md for cards, list groups, banners and dialogs, lg for the top corners of bottom sheets only, pill for
// avatars, count badges, the unread dot and the active tab pill.
export const radius = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 16,
  pill: 999,
} as const;
