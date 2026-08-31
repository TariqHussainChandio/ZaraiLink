import type { Role } from '../constants/roles';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  /** E.164 format, e.g. "+923001234567" (SRDS v4.0 §6.2). */
  phone: string | null;
  avatar_url: string | null;
  /** Legacy free-text display string, composed by the app from the structured fields below. */
  location: string | null;
  country: string | null;
  province: string | null;
  city: string | null;
  village: string | null;
  street: string | null;
  is_suspended: boolean;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}
