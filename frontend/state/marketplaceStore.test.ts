import { act } from '@testing-library/react-native';
import { useAuthStore } from './authStore';
import { connectMarketplaceToAuth, useMarketplaceStore } from './marketplaceStore';

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

  it('clears the filters when another account signs in, so a search never carries across users', () => {
    const disconnect = connectMarketplaceToAuth();
    act(() => {
      useAuthStore.setState({ user: { id: 'dealer-a' } as never });
      useMarketplaceStore.getState().setFilters({ search: 'Urea', city: 'Multan' });
    });
    act(() => {
      useAuthStore.setState({ user: null });
    });
    expect(useMarketplaceStore.getState().filters).toEqual(defaultFilters);

    act(() => {
      useAuthStore.setState({ user: { id: 'buyer-b' } as never });
      useMarketplaceStore.getState().setFilters({ search: 'Wheat' });
      useAuthStore.setState({ user: { id: 'buyer-b' } as never });
    });
    // The same user refreshing their session keeps what they typed.
    expect(useMarketplaceStore.getState().filters.search).toBe('Wheat');
    disconnect();
  });
});
