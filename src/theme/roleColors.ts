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
