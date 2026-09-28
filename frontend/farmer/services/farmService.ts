import { apiFetch } from '../../services/api/client';
import type { Farm, FarmCrop, FarmCropWithCrop, FarmerProfile } from '../types/farmer';

export interface FarmInput {
  name: string;
  area: number | null;
  landUnit: string | null;
  notes: string | null;
  country: string | null;
  province: string | null;
  city: string | null;
}

function toApiFarm(input: Partial<FarmInput>) {
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.area !== undefined && { area: input.area }),
    ...(input.landUnit !== undefined && { land_unit: input.landUnit }),
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.country !== undefined && { country: input.country }),
    ...(input.province !== undefined && { province: input.province }),
    ...(input.city !== undefined && { city: input.city }),
  };
}

// No ownerId param — always the caller's own farms.
export async function fetchFarms(): Promise<Farm[]> {
  return apiFetch('/api/v1/farmer/farms');
}

export async function fetchFarmById(id: string): Promise<Farm> {
  return apiFetch(`/api/v1/farmer/farms/${id}`);
}

export async function createFarm(input: FarmInput): Promise<Farm> {
  return apiFetch('/api/v1/farmer/farms', { method: 'POST', body: toApiFarm(input) });
}

export async function updateFarm(id: string, input: Partial<FarmInput>): Promise<Farm> {
  return apiFetch(`/api/v1/farmer/farms/${id}`, { method: 'PATCH', body: toApiFarm(input) });
}

export async function deleteFarm(id: string): Promise<void> {
  await apiFetch(`/api/v1/farmer/farms/${id}`, { method: 'DELETE' });
}

export interface FarmCropInput {
  cropId: string | null;
  variety: string | null;
  plantingDate: string | null;
  area: number | null;
  expectedHarvestDate: string | null;
  growthStage: string | null;
  notes: string | null;
}

function toApiFarmCrop(input: Partial<FarmCropInput>) {
  return {
    ...(input.cropId !== undefined && { crop_id: input.cropId }),
    ...(input.variety !== undefined && { variety: input.variety }),
    ...(input.plantingDate !== undefined && { planting_date: input.plantingDate }),
    ...(input.area !== undefined && { area: input.area }),
    ...(input.expectedHarvestDate !== undefined && { expected_harvest_date: input.expectedHarvestDate }),
    ...(input.growthStage !== undefined && { growth_stage: input.growthStage }),
    ...(input.notes !== undefined && { notes: input.notes }),
  };
}

export async function fetchFarmCrops(farmId: string): Promise<FarmCropWithCrop[]> {
  return apiFetch(`/api/v1/farmer/farms/${farmId}/crops`);
}

export async function fetchFarmCropById(id: string): Promise<FarmCropWithCrop> {
  return apiFetch(`/api/v1/farmer/crops/${id}`);
}

export async function createFarmCrop(farmId: string, input: FarmCropInput): Promise<FarmCrop> {
  return apiFetch(`/api/v1/farmer/farms/${farmId}/crops`, { method: 'POST', body: toApiFarmCrop(input) });
}

export async function updateFarmCrop(id: string, input: Partial<FarmCropInput>): Promise<FarmCrop> {
  return apiFetch(`/api/v1/farmer/crops/${id}`, { method: 'PATCH', body: toApiFarmCrop(input) });
}

export async function deleteFarmCrop(id: string): Promise<void> {
  await apiFetch(`/api/v1/farmer/crops/${id}`, { method: 'DELETE' });
}

// No userId param — always the caller's own farmer profile.
export async function fetchFarmerProfile(): Promise<FarmerProfile | null> {
  return apiFetch('/api/v1/farmer/profile');
}

export async function upsertFarmerProfile(input: {
  experience: string | null;
  agriculturalInfo: string | null;
}): Promise<void> {
  await apiFetch('/api/v1/farmer/profile', {
    method: 'PUT',
    body: { experience: input.experience, agricultural_info: input.agriculturalInfo },
  });
}
