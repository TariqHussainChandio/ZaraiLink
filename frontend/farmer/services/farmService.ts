// API calls for the farmer module: farms, crops on a farm, and the farmer profile.
import { apiFetch } from '../../services/api/client';
import type { Farm, FarmCrop, FarmCropWithCrop, FarmerProfile } from '../types/farmer';

// What the app sends to create or edit a farm (camelCase, mapped to snake_case below).
export interface FarmInput {
  name: string;
  area: number | null;
  landUnit: string | null;
  notes: string | null;
  country: string | null;
  province: string | null;
  city: string | null;
}

// Converts farm input to the API's snake_case body, sending only the fields given.
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

// Gets one of the caller's farms.
export async function fetchFarmById(id: string): Promise<Farm> {
  return apiFetch(`/api/v1/farmer/farms/${id}`);
}

// Creates a farm for the caller.
export async function createFarm(input: FarmInput): Promise<Farm> {
  return apiFetch('/api/v1/farmer/farms', { method: 'POST', body: toApiFarm(input) });
}

// Changes some fields of a farm.
export async function updateFarm(id: string, input: Partial<FarmInput>): Promise<Farm> {
  return apiFetch(`/api/v1/farmer/farms/${id}`, { method: 'PATCH', body: toApiFarm(input) });
}

// Deletes a farm and its crops.
export async function deleteFarm(id: string): Promise<void> {
  await apiFetch(`/api/v1/farmer/farms/${id}`, { method: 'DELETE' });
}

// What the app sends to add or edit a crop on a farm.
export interface FarmCropInput {
  cropId: string | null;
  variety: string | null;
  plantingDate: string | null;
  area: number | null;
  expectedHarvestDate: string | null;
  growthStage: string | null;
  notes: string | null;
}

// Converts crop input to the API's snake_case body, sending only the fields given.
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

// Lists the crops on one farm.
export async function fetchFarmCrops(farmId: string): Promise<FarmCropWithCrop[]> {
  return apiFetch(`/api/v1/farmer/farms/${farmId}/crops`);
}

// Gets one recorded crop.
export async function fetchFarmCropById(id: string): Promise<FarmCropWithCrop> {
  return apiFetch(`/api/v1/farmer/crops/${id}`);
}

// Adds a crop to a farm.
export async function createFarmCrop(farmId: string, input: FarmCropInput): Promise<FarmCrop> {
  return apiFetch(`/api/v1/farmer/farms/${farmId}/crops`, { method: 'POST', body: toApiFarmCrop(input) });
}

// Changes some fields of a recorded crop.
export async function updateFarmCrop(id: string, input: Partial<FarmCropInput>): Promise<FarmCrop> {
  return apiFetch(`/api/v1/farmer/crops/${id}`, { method: 'PATCH', body: toApiFarmCrop(input) });
}

// Removes a recorded crop.
export async function deleteFarmCrop(id: string): Promise<void> {
  await apiFetch(`/api/v1/farmer/crops/${id}`, { method: 'DELETE' });
}

// No userId param — always the caller's own farmer profile.
export async function fetchFarmerProfile(): Promise<FarmerProfile | null> {
  return apiFetch('/api/v1/farmer/profile');
}

// Creates or updates the caller's farmer profile (experience, farming info).
export async function upsertFarmerProfile(input: {
  experience: string | null;
  agriculturalInfo: string | null;
}): Promise<void> {
  await apiFetch('/api/v1/farmer/profile', {
    method: 'PUT',
    body: { experience: input.experience, agricultural_info: input.agriculturalInfo },
  });
}
