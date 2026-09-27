import type { GeoLocation } from './referenceData';

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

export interface FarmCropWithCrop extends FarmCrop {
  crop: { id: string; name: string } | null;
}

export interface FarmerProfile {
  id: string;
  experience: string | null;
  agricultural_info: string | null;
  updated_at: string;
}
