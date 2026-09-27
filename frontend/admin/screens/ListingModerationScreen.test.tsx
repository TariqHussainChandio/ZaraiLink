import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ListingModerationScreen } from './ListingModerationScreen';
import {
  fetchAllListingsForModeration,
  updateListingStatus,
} from '../../services/modules/marketplace/listingsService';
import { useAuthStore } from '../../store/authStore';
import { ApiError } from '../../services/api/errors';
import type { ListingWithRelations } from '../../types/marketplace';

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
  fetchAllListingsForModeration: jest.fn(),
  updateListingStatus: jest.fn(),
}));

const mockFetchListings = fetchAllListingsForModeration as jest.Mock;
const mockUpdateListingStatus = updateListingStatus as jest.Mock;

const listing = (overrides: Partial<ListingWithRelations> = {}): ListingWithRelations => ({
  id: 'listing-1',
  owner_id: 'owner-1',
  category_id: 'cat-1',
  title: 'Wheat Seeds',
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
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  category: { id: 'cat-1', name: 'Seeds', slug: 'seeds' },
  owner: { id: 'owner-1', full_name: 'Farmer Sana', avatar_url: null },
  ...overrides,
});

beforeEach(() => {
  mockFetchListings.mockReset();
  mockUpdateListingStatus.mockReset();
  useAuthStore.setState({ user: { id: 'admin-1' } as never });
});

describe('ListingModerationScreen', () => {
  it('shows an empty state when there are no listings', async () => {
    mockFetchListings.mockResolvedValue([]);
    await renderWithQuery(<ListingModerationScreen />);
    expect(await screen.findByText('No listings yet')).toBeTruthy();
  });

  it('lists listings with owner, price, and status', async () => {
    mockFetchListings.mockResolvedValue([listing()]);
    await renderWithQuery(<ListingModerationScreen />);

    expect(await screen.findByText('Wheat Seeds')).toBeTruthy();
    expect(screen.getByText(/Farmer Sana/)).toBeTruthy();
    expect(screen.getByText(/Rs\. 100\/kg/)).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
  });

  it('deactivates an active listing', async () => {
    mockFetchListings.mockResolvedValue([listing()]);
    mockUpdateListingStatus.mockResolvedValue(undefined);
    await renderWithQuery(<ListingModerationScreen />);
    await screen.findByText('Wheat Seeds');

    await fireEvent.press(screen.getByText('Deactivate'));

    expect(mockUpdateListingStatus).toHaveBeenCalledWith('listing-1', 'inactive');
  });

  it('activates an inactive listing', async () => {
    mockFetchListings.mockResolvedValue([listing({ status: 'inactive' })]);
    mockUpdateListingStatus.mockResolvedValue(undefined);
    await renderWithQuery(<ListingModerationScreen />);
    await screen.findByText('Wheat Seeds');

    await fireEvent.press(screen.getByText('Activate'));

    expect(mockUpdateListingStatus).toHaveBeenCalledWith('listing-1', 'active');
  });

  it('tells an admin without a second factor to set one up (the status route needs it)', async () => {
    // PATCH …/listings/{id}/status requires a second factor (require_admin_aal2, migration 20260928090000).
    mockFetchListings.mockResolvedValue([listing()]);
    mockUpdateListingStatus.mockRejectedValue(
      new ApiError({ status: 403, code: 'mfa_required', kind: 'forbidden', message: 'MFA required' }),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderWithQuery(<ListingModerationScreen />);
    await screen.findByText('Wheat Seeds');

    await fireEvent.press(screen.getByText('Deactivate'));

    expect(alert).toHaveBeenCalledWith('Could not update the listing', 'This action needs two-step verification.');
    alert.mockRestore();
  });

  it('hides the toggle action for sold listings', async () => {
    mockFetchListings.mockResolvedValue([listing({ status: 'sold' })]);
    await renderWithQuery(<ListingModerationScreen />);
    await screen.findByText('Wheat Seeds');

    expect(screen.queryByText('Deactivate')).toBeNull();
    expect(screen.queryByText('Activate')).toBeNull();
  });
});
