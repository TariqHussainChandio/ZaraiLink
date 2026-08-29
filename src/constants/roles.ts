export const ROLES = ['farmer', 'buyer', 'dealer', 'expert', 'admin'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  farmer: 'Farmer',
  buyer: 'Buyer',
  dealer: 'Dealer',
  expert: 'Expert',
  admin: 'Admin',
};
