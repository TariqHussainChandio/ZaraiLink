export const ROLES = ['farmer', 'buyer', 'dealer', 'expert', 'admin'] as const;

export type Role = (typeof ROLES)[number];

/** The roles a person can sign up as (SRDS §4); admin is never public (§50). */
export type RegistrableRole = Exclude<Role, 'admin'>;

export const ROLE_LABELS: Record<Role, string> = {
  farmer: 'Farmer',
  buyer: 'Buyer',
  dealer: 'Dealer',
  expert: 'Expert',
  admin: 'Admin',
};
