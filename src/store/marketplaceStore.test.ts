import { act } from '@testing-library/react-native';
import { useMarketplaceStore } from './marketplaceStore';

const defaultFilters = {
  categoryId: null,
  search: '',
  minPrice: null,
  maxPrice: null,
  city: null,
  cropName: null,
};

beforeEach(() => {
  act(() => {
    useMarketplaceStore.setState({
      filters: defaultFilters,
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
