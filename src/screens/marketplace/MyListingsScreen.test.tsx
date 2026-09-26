import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { MyListingsScreen } from './MyListingsScreen';
import { fetchListings } from '../../services/modules/marketplace/listingsService';
import { useAuthStore } from '../../store/authStore';
import { APP_TABS, MARKETPLACE_ROUTES } from '../../constants/routes';
import type { ListingWithRelations } from '../../types/marketplace';

const mockTabNavigate = jest.fn();

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
    useNavigation: () => ({
      getParent: () => ({ navigate: mockTabNavigate }),
    }),
  };
});

jest.mock('../../services/modules/marketplace/listingsService', () => ({
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
  it('loads and renders the current user\'s own listings', async () => {
    mockFetchListings.mockResolvedValue([listing()]);
    await renderWithQuery(<MyListingsScreen />);

    expect(await screen.findByText('Wheat seeds')).toBeTruthy();
    expect(mockFetchListings).toHaveBeenCalledWith({ ownerId: 'user-1' });
    expect(screen.getByText('active')).toBeTruthy();
  });

  it('shows an empty state when there are no listings', async () => {
    mockFetchListings.mockResolvedValue([]);
    await renderWithQuery(<MyListingsScreen />);
    expect(await screen.findByText('No listings yet')).toBeTruthy();
  });

  it('navigates to ListingDetail on the Marketplace tab when a row is pressed', async () => {
    mockFetchListings.mockResolvedValue([listing({ id: 'listing-42' })]);
    await renderWithQuery(<MyListingsScreen />);

    await fireEvent.press(await screen.findByText('Wheat seeds'));

    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Marketplace, {
      screen: MARKETPLACE_ROUTES.ListingDetail,
      params: { listingId: 'listing-42' },
    });
  });
});
