import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../../testUtils/renderWithProviders';
import { queryKeys } from '../../../hooks/keys';
import { ApiError } from '../../../services/api/errors';
import { BrowseScreen } from './BrowseScreen';
import { fetchListings } from '../services/listingsService';
import { useAuthStore } from '../../../state/authStore';
import { useCartStore } from '../../../state/cartStore';
import { useMarketplaceStore } from '../../../state/marketplaceStore';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import type { ListingWithRelations } from '../types/marketplace';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

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

jest.mock('../services/listingsService', () => ({
  fetchListings: jest.fn(),
  fetchCategories: jest.fn().mockResolvedValue([]),
  fetchCrops: jest.fn().mockResolvedValue([]),
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

const wait = () => ({ timeout: 3000 });

beforeEach(() => {
  mockFetchListings.mockReset();
  mockFetchListings.mockResolvedValue([]);
  useAuthStore.setState({ role: 'buyer' } as never);
  useCartStore.setState({ items: [] });
  useMarketplaceStore.setState({
    filters: { categoryId: null, search: '', minPrice: null, maxPrice: null, city: null, cropName: null },
  });
});

describe('BrowseScreen', () => {
  it('loads and renders listings on mount, with the price on its plate and who sells it', async () => {
    mockFetchListings.mockResolvedValue([
      listing({ owner: { id: 'owner-1', full_name: 'Chaudhry Seeds', avatar_url: null }, location: { country: 'Pakistan', province: 'Punjab', city: 'Sargodha' } }),
    ]);
    await renderWithQuery(<BrowseScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByText('Wheat seeds')).toBeTruthy();
    expect(screen.getByLabelText('Rs 100, per kg')).toBeTruthy();
    expect(screen.getByText('Chaudhry Seeds · Sargodha')).toBeTruthy();
    expect(mockFetchListings).toHaveBeenCalledWith(expect.objectContaining({ page: 0 }));
  });

  it('says nothing is listed yet, without blaming a filter, when the market is empty', async () => {
    await renderWithQuery(<BrowseScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText('Nothing is listed yet')).toBeTruthy();
    expect(screen.queryByText('No listings match')).toBeNull();
    // A buyer is not told to "list produce" (MK-14).
    expect(screen.queryByText(/List what you sell/)).toBeNull();
  });

  it('says "No listings match" with Clear filters when a filter is on, and Clear filters resets them', async () => {
    useMarketplaceStore.setState({
      filters: { categoryId: null, search: '', minPrice: null, maxPrice: 500, city: 'Okara', cropName: null },
    });
    await renderWithQuery(<BrowseScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByText('No listings match')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    expect(useMarketplaceStore.getState().filters.city).toBeNull();
    expect(useMarketplaceStore.getState().filters.maxPrice).toBeNull();
  });

  it('offers a seller a "New listing" button that opens the form', async () => {
    useAuthStore.setState({ role: 'farmer' } as never);
    const navigation = makeNavigation();
    await renderWithQuery(<BrowseScreen navigation={navigation} route={{} as never} />);
    await screen.findByText('Nothing is listed yet');

    // The empty state and the screen's own button both offer it; the first is enough to prove the route.
    await fireEvent.press(screen.getAllByRole('button', { name: 'New listing' })[0]!);
    expect(navigation.navigate).toHaveBeenCalledWith(MARKETPLACE_ROUTES.CreateListing);
  });

  it('shows a buyer no way to list anything', async () => {
    await renderWithQuery(<BrowseScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Nothing is listed yet');
    expect(screen.queryByRole('button', { name: 'New listing' })).toBeNull();
  });

  it('navigates to ListingDetail when a listing is pressed', async () => {
    mockFetchListings.mockResolvedValue([listing({ id: 'listing-42' })]);
    const navigation = makeNavigation();
    await renderWithQuery(<BrowseScreen navigation={navigation} route={{} as never} />);

    await fireEvent.press(await screen.findByText('Wheat seeds'));
    expect(navigation.navigate).toHaveBeenCalledWith(MARKETPLACE_ROUTES.ListingDetail, {
      listingId: 'listing-42',
    });
  });

  it('shows a Banner with the reason and "Try again" when nothing is cached and the request fails', async () => {
    mockFetchListings.mockRejectedValueOnce(
      new ApiError({ status: 0, code: 'network', kind: 'network', message: 'No connection to the server' }),
    );
    await renderWithQuery(<BrowseScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByText("Couldn't load the market")).toBeTruthy();
    expect(screen.getByText('No connection. Check your internet, then try again.')).toBeTruthy();

    mockFetchListings.mockResolvedValue([listing()]);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Wheat seeds', {}, wait())).toBeTruthy();
  });

  it('keeps showing the cached listings when the device is offline (the refetch fails)', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.marketplace.listings({}), { pages: [[listing()]], pageParams: [0] });
    mockFetchListings.mockRejectedValue(
      new ApiError({ status: 0, code: 'network', kind: 'network', message: 'No connection to the server' }),
    );
    await renderWithQuery(<BrowseScreen navigation={makeNavigation()} route={{} as never} />, queryClient);

    expect(await screen.findByText('Wheat seeds')).toBeTruthy();
    await waitFor(() => expect(mockFetchListings).toHaveBeenCalled());
    expect(screen.getByText('Wheat seeds')).toBeTruthy();
  });

  it('keeps the old grid on screen while a new search loads, instead of flashing skeletons (MK-13)', async () => {
    mockFetchListings.mockResolvedValueOnce([listing()]);
    await renderWithQuery(<BrowseScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Wheat seeds');

    let resolveNext: (value: ListingWithRelations[]) => void = () => undefined;
    mockFetchListings.mockReturnValueOnce(new Promise<ListingWithRelations[]>(resolve => (resolveNext = resolve)));
    await act(async () => useMarketplaceStore.getState().setFilters({ search: 'urea' }));

    // The request for "urea" is in flight; the wheat card is still there.
    await waitFor(() => expect(mockFetchListings).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'urea' })));
    expect(screen.getByText('Wheat seeds')).toBeTruthy();

    await act(async () => resolveNext([listing({ id: 'listing-2', title: 'Urea 50 kg' })]));
    expect(await screen.findByText('Urea 50 kg')).toBeTruthy();
  });
});
