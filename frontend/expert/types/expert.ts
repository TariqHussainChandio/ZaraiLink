// Data types for experts, their verification records, and consultations, as the API returns them.
import type { GeoLocation } from '../../common/types/referenceData';

// Where an expert's application stands.
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

// The fields an expert can specialise in.
export type ExpertSpecialization =
  | 'crop_management'
  | 'plant_diseases'
  | 'pest_management'
  | 'fertilizer_management'
  | 'irrigation'
  | 'soil_management'
  | 'crop_nutrition'
  | 'general_agriculture';

// An expert's professional record.
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

// An expert with their name, photo and specialisations joined in.
export interface ExpertWithProfile extends Expert {
  profile: { id: string; full_name: string; avatar_url: string | null } | null;
  expert_specializations: { specialization: ExpertSpecialization }[];
}

// One admin review of an expert's application.
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

// The life cycle of a consultation request.
export type ConsultationStatus =
  | 'requested'
  | 'accepted'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'rejected'
  | 'cancelled'
  | 'expired';

// How urgent the person marked the request.
export type ConsultationPriority = 'low' | 'medium' | 'high';

// A request for advice from a farmer or buyer to an expert.
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

// A consultation with the requester, expert and crop joined in.
export interface ConsultationWithRelations extends Consultation {
  user: { id: string; full_name: string; avatar_url: string | null } | null;
  expert: { id: string; full_name: string; avatar_url: string | null } | null;
  crop: { id: string; name: string } | null;
}

// One message inside a consultation chat.
export interface ConsultationMessage {
  id: string;
  consultation_id: string;
  sender_id: string;
  body: string;
  attachments: string[];
  recommended_listing_id: string | null;
  created_at: string;
}

// A message with the product listing the expert recommended, if any.
export interface ConsultationMessageWithListing extends ConsultationMessage {
  recommended_listing: { id: string; title: string; price: number; unit: string } | null;
}
