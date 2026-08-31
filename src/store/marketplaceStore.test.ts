import { act } from '@testing-library/react-native';
import { fetchCategories, fetchCrops } from '../services/modules/marketplace/listingsService';
import { useMarketplaceStore } from './marketplaceStore';

jest.mock('../services/modules/marketplace/listingsService');

const mockFetchCategories = fetchCategories as jest.MockedFunction<typeof fetchCategories>;
const mockFetchCrops = fetchCrops as jest.MockedFunction<typeof fetchCrops>;

const defaultFilters = {
  categoryId: null,
  search: '',
  minPrice: null,
  maxPrice: null,
  city: null,
  cropName: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  act(() => {
    useMarketplaceStore.setState({
      filters: defaultFilters,
      categories: [],
      categoriesLoaded: false,
      crops: [],
      cropsLoaded: false,
    });
  });
});

describe('useMarketplaceStore filters', () => {
  it('merges a partial filter patch onto the existing filters', () => {
    act(() => {
      useMarketplaceStore.getState().setFilters({ search: 'wheat' });
    });
    expect(useMarketplaceStore.getState().filters).toEqual({ ...defaultFilters, search: 'wheat' });

    act(() => {
      useMarketplaceStore.getState().setFilters({ categoryId: 'cat-1' });
    });
    expect(useMarketplaceStore.getState().filters).toEqual({
      ...defaultFilters,
      search: 'wheat',
      categoryId: 'cat-1',
    });
  });

  it('resets filters back to the default', () => {
    act(() => {
      useMarketplaceStore.getState().setFilters({ search: 'wheat', minPrice: 10 });
      useMarketplaceStore.getState().resetFilters();
    });
    expect(useMarketplaceStore.getState().filters).toEqual(defaultFilters);
  });
});

describe('useMarketplaceStore.loadCategories', () => {
  it('fetches and stores categories on first call', async () => {
    const categories = [{ id: 'cat-1', name: 'Seeds', slug: 'seeds', icon: null }];
    mockFetchCategories.mockResolvedValue(categories as never);

    await act(async () => {
      await useMarketplaceStore.getState().loadCategories();
    });

    expect(mockFetchCategories).toHaveBeenCalledTimes(1);
    expect(useMarketplaceStore.getState().categories).toEqual(categories);
    expect(useMarketplaceStore.getState().categoriesLoaded).toBe(true);
  });

  it('does not re-fetch once already loaded', async () => {
    mockFetchCategories.mockResolvedValue([] as never);

    await act(async () => {
      await useMarketplaceStore.getState().loadCategories();
      await useMarketplaceStore.getState().loadCategories();
    });

    expect(mockFetchCategories).toHaveBeenCalledTimes(1);
  });
});

describe('useMarketplaceStore.loadCrops', () => {
  it('fetches and stores crops on first call', async () => {
    const crops = [{ id: 'crop-1', name: 'Wheat' }];
    mockFetchCrops.mockResolvedValue(crops as never);

    await act(async () => {
      await useMarketplaceStore.getState().loadCrops();
    });

    expect(mockFetchCrops).toHaveBeenCalledTimes(1);
    expect(useMarketplaceStore.getState().crops).toEqual(crops);
    expect(useMarketplaceStore.getState().cropsLoaded).toBe(true);
  });

  it('does not re-fetch once already loaded', async () => {
    mockFetchCrops.mockResolvedValue([] as never);

    await act(async () => {
      await useMarketplaceStore.getState().loadCrops();
      await useMarketplaceStore.getState().loadCrops();
    });

    expect(mockFetchCrops).toHaveBeenCalledTimes(1);
  });
});
