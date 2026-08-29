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

export type StatusColorKey = keyof typeof statusColors;
