// Cross-domain status color coding (SRDS v4.0 §"Status Color Coding"). Covers order,
// payment, expert-verification, and moderation statuses with one shared vocabulary so
// the same status reads the same color everywhere in the app.
export const statusColors = {
  success: '#43A047',
  completed: '#43A047',
  pending: '#FB8C00',
  processing: '#1976D2',
  warning: '#F57C00',
  rejected: '#D32F2F',
  cancelled: '#757575',
  failed: '#C62828',
  verified: '#2E7D32',
  underReview: '#F9A825',
  suspended: '#D32F2F',
} as const;

// Dark-ground contrast pass: each value brightened one step (WCAG contrast against a ~#10140F
// page background is noticeably worse for these mid-saturation tones than against white —
// `cancelled`'s #757575 in particular reads as barely-there on dark). Hue kept the same so a
// status still reads as "the same color" switching themes, just lighter.
export const statusColorsDark = {
  success: '#66BB6A',
  completed: '#66BB6A',
  pending: '#FFA726',
  processing: '#42A5F5',
  warning: '#FFA726',
  rejected: '#EF5350',
  cancelled: '#9E9E9E',
  failed: '#E57373',
  verified: '#66BB6A',
  underReview: '#FFD54F',
  suspended: '#EF5350',
} as const;

export type StatusColorKey = keyof typeof statusColors;
