/** A dealer's or expert's application (A3b; SRDS §7, §10, §12), as the API returns it. */

export type ApplicationRole = 'dealer' | 'expert';

/** The five business types the maintainer decided on (2026-10-04); the database enum matches. */
export type BusinessType = 'agri_input_retailer' | 'wholesaler' | 'distributor' | 'manufacturer' | 'other';

/** One document an applicant of a role is asked for; an admin manages the list (SRDS §7). */
export interface RequiredDocument {
  id: string;
  role: ApplicationRole;
  code: string;
  label: string;
  description: string | null;
  is_required: boolean;
  active: boolean;
  sort_order: number;
}

/** A file attached to an application. Its type and size come from Storage, never from the app. */
export interface ApplicationDocument {
  id: string;
  required_document_id: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  required_document: { id: string; code: string; label: string } | null;
}

export interface DealerApplicationInput {
  business_name: string;
  business_type: BusinessType;
  registration_number: string;
  business_address: string;
  country: string;
  province: string;
  city: string;
}

export interface DealerProfile extends DealerApplicationInput {
  id: string;
  created_at: string;
  updated_at: string;
}
