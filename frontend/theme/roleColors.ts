import type { Role } from '../constants/roles';

// Per-role accent colors (SRDS v4.0 §"Role-Based Color Coding"). These are secondary
// identifiers only — badges, dashboard indicators, icons, charts, status labels — and
// must never be used to theme an entire role's screens differently from the rest of
// the app.
export const roleColors: Record<Role, string> = {
  buyer: '#1976D2',
  farmer: '#2E7D32',
  dealer: '#EF6C00',
  expert: '#7B1FA2',
  admin: '#374151',
};

// Dark-ground contrast pass. Four of five read fine one step brighter, same as statusColors;
// `admin`'s #374151 is the one that actually breaks on dark — a dark charcoal accent on an
// already-dark page background has poor contrast, so it gets a real lightening, not just a step.
export const roleColorsDark: Record<Role, string> = {
  buyer: '#42A5F5',
  farmer: '#66BB6A',
  dealer: '#FFA726',
  expert: '#AB47BC',
  admin: '#9CA3AF',
};
