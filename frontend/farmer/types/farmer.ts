// Data types for farms, crops on a farm and the farmer profile, as the API returns them.
import type { GeoLocation } from '../../common/types/referenceData';

// A farm owned by a farmer.
export interface Farm {
  id: string;
  owner_id: string;
  name: string;
  location: GeoLocation | null;
  area: number | null;
  land_unit: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// A crop recorded on a farm.
export interface FarmCrop {
  id: string;
  farm_id: string;
  crop_id: string | null;
  variety: string | null;
  planting_date: string | null;
  area: number | null;
  expected_harvest_date: string | null;
  growth_stage: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// A recorded crop with its crop name joined in.
export interface FarmCropWithCrop extends FarmCrop {
  crop: { id: string; name: string } | null;
}

// The farmer's extra profile details.
export interface FarmerProfile {
  id: string;
  experience: string | null;
  agricultural_info: string | null;
  updated_at: string;
}
