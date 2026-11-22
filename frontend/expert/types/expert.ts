import type { GeoLocation } from '../../common/types/referenceData';

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type ExpertSpecialization =
  | 'crop_management'
  | 'plant_diseases'
  | 'pest_management'
  | 'fertilizer_management'
  | 'irrigation'
  | 'soil_management'
  | 'crop_nutrition'
  | 'general_agriculture';

export interface Expert {
  id: string;
  qualifications: string | null;
  degree: string | null;
  experience: string | null;
  professional_description: string | null;
  location: GeoLocation | null;
  contact: string | null;
  /** SRDS §10 (A3b). */
  years_experience: number | null;
  institution_affiliation: string | null;
  verification_status: VerificationStatus;
  created_at: string;
  updated_at: string;
}

export interface ExpertWithProfile extends Expert {
  profile: { id: string; full_name: string; avatar_url: string | null } | null;
  expert_specializations: { specialization: ExpertSpecialization }[];
}

export interface ExpertVerification {
  id: string;
  expert_id: string;
  document_url: string | null;
  reviewed_by: string | null;
  decision: VerificationStatus | null;
  decision_at: string | null;
  notes: string | null;
  created_at: string;
}

export type ConsultationStatus =
  | 'requested'
  | 'accepted'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export type ConsultationPriority = 'low' | 'medium' | 'high';

export interface Consultation {
  id: string;
  user_id: string;
  expert_id: string | null;
  subject: string;
  crop_id: string | null;
  problem_description: string | null;
  farm_id: string | null;
  images: string[];
  priority: ConsultationPriority;
  status: ConsultationStatus;
  /** A6: the disease case the request was raised from, whose AI report the expert sees (SRDS §34). */
  disease_case_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsultationWithRelations extends Consultation {
  user: { id: string; full_name: string; avatar_url: string | null } | null;
  expert: { id: string; full_name: string; avatar_url: string | null } | null;
  crop: { id: string; name: string } | null;
}

export interface ConsultationMessage {
  id: string;
  consultation_id: string;
  sender_id: string;
  body: string;
  attachments: string[];
  recommended_listing_id: string | null;
  created_at: string;
}

export interface ConsultationMessageWithListing extends ConsultationMessage {
  recommended_listing: { id: string; title: string; price: number; unit: string } | null;
}
