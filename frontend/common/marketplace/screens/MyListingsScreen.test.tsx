import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { MyListingsScreen } from './MyListingsScreen';
import { fetchListings } from '../services/listingsService';
import { useAuthStore } from '../../../state/authStore';
import { APP_TABS, MARKETPLACE_ROUTES } from '../../constants/routes';
import type { ListingWithRelations } from '../types/marketplace';

const mockTabNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      getParent: () => ({ navigate: mockTabNavigate }),
    }),
  };
});

jest.mock('../services/listingsService', () => ({
  fetchListings: jest.fn(),
}));

const mockFetchListings = fetchListings as jest.Mock;

const listing = (overrides: Partial<ListingWithRelations> = {}): ListingWithRelations => ({
  id: 'listing-1',
  owner_id: 'user-1',
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

beforeEach(() => {
  mockFetchListings.mockReset();
  mockTabNavigate.mockReset();
  useAuthStore.setState({ user: { id: 'user-1' } as never });
});

describe('MyListingsScreen', () => {
  it("loads and renders the current user's own listings, with the status as a badge", async () => {
    mockFetchListings.mockResolvedValue([listing()]);
    await renderWithQuery(<MyListingsScreen />);

    expect(await screen.findByText('Wheat seeds')).toBeTruthy();
    expect(mockFetchListings).toHaveBeenCalledWith({ ownerId: 'user-1' });
    expect(screen.getByText('Rs 100 per kg · 50 kg available')).toBeTruthy();
    // The status reads through the vocabulary: an active listing is "Listed", never the raw value.
    expect(screen.getByText('Listed')).toBeTruthy();
    expect(screen.queryByText('active')).toBeNull();
  });

  it('says what to do when there are no listings, and the button opens the form in the Market tab', async () => {
    mockFetchListings.mockResolvedValue([]);
    await renderWithQuery(<MyListingsScreen />);
    expect(await screen.findByText('No listings yet')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'New listing' }));
    // initial: false keeps the Market tab's own first screen underneath (MK-01).
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Marketplace, {
      screen: MARKETPLACE_ROUTES.CreateListing,
      params: undefined,
      initial: false,
    });
  });

  it('shows a Banner with "Try again" when the load fails, not an empty list (MK-03)', async () => {
    mockFetchListings.mockRejectedValueOnce(new Error('Server down'));
    await renderWithQuery(<MyListingsScreen />);
    expect(await screen.findByText("Couldn't load your listings")).toBeTruthy();

    mockFetchListings.mockResolvedValue([listing()]);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Wheat seeds')).toBeTruthy();
  });

  it('opens a listing inside the Market tab under its first screen (MK-01)', async () => {
    mockFetchListings.mockResolvedValue([listing({ id: 'listing-42' })]);
    await renderWithQuery(<MyListingsScreen />);

    await fireEvent.press(await screen.findByText('Wheat seeds'));

    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Marketplace, {
      screen: MARKETPLACE_ROUTES.ListingDetail,
      params: { listingId: 'listing-42' },
      initial: false,
    });
  });
});
