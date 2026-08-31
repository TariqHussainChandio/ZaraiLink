import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BrowseScreen } from './BrowseScreen';
import { fetchListings } from '../../services/modules/marketplace/listingsService';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import { useMarketplaceStore } from '../../store/marketplaceStore';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import type { ListingWithRelations } from '../../types/marketplace';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) =>
      useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []),
  };
});

jest.mock('../../services/modules/marketplace/listingsService', () => ({
  fetchListings: jest.fn(),
}));

const mockFetchListings = fetchListings as jest.Mock;

const listing = (overrides: Partial<ListingWithRelations> = {}): ListingWithRelations => ({
  id: 'listing-1',
  owner_id: 'owner-1',
  category_id: null,
  title: 'Wheat seeds',
  description: null,
  price: 100,
  unit: 'kg',
  quantity: 50,
  images: [],
  status: 'active',
  crop_compatibility: [],
  brand: null,
  condition: null,
  location: null,
  seller_role: 'farmer',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  category: null,
  owner: null,
  ...overrides,
});

function makeNavigation() {
  return {
    navigate: jest.fn(),
    setOptions: jest.fn(),
  } as unknown as MarketplaceScreenProps<'Browse'>['navigation'];
}

beforeEach(() => {
  mockFetchListings.mockReset();
  mockFetchListings.mockResolvedValue([]);
  useAuthStore.setState({ role: 'buyer' } as never);
  useCartStore.setState({ items: [] });
  useMarketplaceStore.setState({
    filters: { categoryId: null, search: '', minPrice: null, maxPrice: null, city: null, cropName: null },
    categories: [],
    categoriesLoaded: true,
    crops: [],
    cropsLoaded: true,
  });
});

describe('BrowseScreen', () => {
  it('loads and renders listings on mount', async () => {
    mockFetchListings.mockResolvedValue([listing()]);
    await render(<BrowseScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByText('Wheat seeds')).toBeTruthy();
    expect(mockFetchListings).toHaveBeenCalledWith(expect.objectContaining({ page: 0 }));
  });

  it('shows an empty state when there are no listings', async () => {
    await render(<BrowseScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText('No listings yet')).toBeTruthy();
  });

  it('shows the "+ List" fab for a farmer and navigates to CreateListing', async () => {
    useAuthStore.setState({ role: 'farmer' } as never);
    const navigation = makeNavigation();
    await render(<BrowseScreen navigation={navigation} route={{} as never} />);
    await screen.findByText('No listings yet');

    await fireEvent.press(screen.getByText('+ List'));
    expect(navigation.navigate).toHaveBeenCalledWith(MARKETPLACE_ROUTES.CreateListing);
  });

  it('hides the fab for a buyer', async () => {
    await render(<BrowseScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('No listings yet');
    expect(screen.queryByText('+ List')).toBeNull();
  });

  it('navigates to ListingDetail when a listing is pressed', async () => {
    mockFetchListings.mockResolvedValue([listing({ id: 'listing-42' })]);
    const navigation = makeNavigation();
    await render(<BrowseScreen navigation={navigation} route={{} as never} />);

    await fireEvent.press(await screen.findByText('Wheat seeds'));
    expect(navigation.navigate).toHaveBeenCalledWith(MARKETPLACE_ROUTES.ListingDetail, {
      listingId: 'listing-42',
    });
  });
});
