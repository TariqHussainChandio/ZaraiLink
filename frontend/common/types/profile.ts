import type { Role } from '../constants/roles';

/** A dealer's or expert's application (A3a; SRDS §8, §11, §13). Farmers and buyers are always `approved`. */
type AccountStatus = 'pending' | 'approved' | 'rejected';

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
  account_status: AccountStatus;
  /** The admin's reason, shown to a rejected applicant on the Application Status screen. */
  account_status_reason: string | null;
  account_status_changed_at: string | null;
  /** When a dealer or expert last sent their application for review (A3b). Pending with none is a draft still being
   * filled in; pending with one is under review, and frozen until the decision. */
  application_submitted_at: string | null;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}
