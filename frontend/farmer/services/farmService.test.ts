import { apiFetch } from '../../api/client';
import {
  createFarm,
  createFarmCrop,
  deleteFarm,
  deleteFarmCrop,
  fetchFarmById,
  fetchFarmCropById,
  fetchFarmCrops,
  fetchFarmerProfile,
  fetchFarms,
  updateFarm,
  updateFarmCrop,
  upsertFarmerProfile,
} from './farmService';

jest.mock('../../api/client');

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('farms', () => {
  it('fetchFarms fetches the caller-scoped list', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchFarms();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/farmer/farms');
  });

  it('fetchFarmById fetches a single farm', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchFarmById('farm-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/farmer/farms/farm-1');
  });

  it('createFarm maps every field to snake_case', async () => {
    mockApiFetch.mockResolvedValue({});
    await createFarm({
      name: 'North Field',
      area: 5,
      landUnit: 'acre',
      notes: 'Irrigated',
      country: 'Pakistan',
      province: 'Punjab',
      city: 'Multan',
    });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/farmer/farms', {
      method: 'POST',
      body: {
        name: 'North Field',
        area: 5,
        land_unit: 'acre',
        notes: 'Irrigated',
        country: 'Pakistan',
        province: 'Punjab',
        city: 'Multan',
      },
    });
  });

  it('updateFarm omits fields the caller did not set', async () => {
    mockApiFetch.mockResolvedValue({});
    await updateFarm('farm-1', { area: 8 });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/farmer/farms/farm-1', {
      method: 'PATCH',
      body: { area: 8 },
    });
  });

  it('deleteFarm DELETEs the farm', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await deleteFarm('farm-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/farmer/farms/farm-1', { method: 'DELETE' });
  });
});

describe('farm crops', () => {
  it('fetchFarmCrops fetches crops scoped to a farm', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchFarmCrops('farm-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/farmer/farms/farm-1/crops');
  });

  it('fetchFarmCropById fetches a single crop', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchFarmCropById('crop-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/farmer/crops/crop-1');
  });

  it('createFarmCrop maps every field to snake_case, scoped under the farm', async () => {
    mockApiFetch.mockResolvedValue({});
    await createFarmCrop('farm-1', {
      cropId: 'crop-type-1',
      variety: 'Durum',
      plantingDate: '2026-01-01',
      area: 2,
      expectedHarvestDate: '2026-05-01',
      growthStage: 'seedling',
      notes: 'First planting',
    });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/farmer/farms/farm-1/crops', {
      method: 'POST',
      body: {
        crop_id: 'crop-type-1',
        variety: 'Durum',
        planting_date: '2026-01-01',
        area: 2,
        expected_harvest_date: '2026-05-01',
        growth_stage: 'seedling',
        notes: 'First planting',
      },
    });
  });

  it('updateFarmCrop omits fields the caller did not set', async () => {
    mockApiFetch.mockResolvedValue({});
    await updateFarmCrop('crop-1', { growthStage: 'flowering' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/farmer/crops/crop-1', {
      method: 'PATCH',
      body: { growth_stage: 'flowering' },
    });
  });

  it('deleteFarmCrop DELETEs the crop', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await deleteFarmCrop('crop-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/farmer/crops/crop-1', { method: 'DELETE' });
  });
});

describe('farmer profile', () => {
  it('fetchFarmerProfile fetches the caller-scoped profile', async () => {
    mockApiFetch.mockResolvedValue(null);
    const result = await fetchFarmerProfile();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/farmer/profile');
    expect(result).toBeNull();
  });

  it('upsertFarmerProfile PUTs experience/agricultural_info', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await upsertFarmerProfile({ experience: '10 years', agriculturalInfo: 'Organic wheat' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/farmer/profile', {
      method: 'PUT',
      body: { experience: '10 years', agricultural_info: 'Organic wheat' },
    });
  });
});
