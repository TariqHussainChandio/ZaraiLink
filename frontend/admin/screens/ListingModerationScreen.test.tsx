import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ListingModerationScreen } from './ListingModerationScreen';
import {
  fetchAllListingsForModeration,
  updateListingStatus,
} from '../../common/marketplace/services/listingsService';
import { useAuthStore } from '../../state/authStore';
import { ApiError } from '../../services/api/errors';
import type { ListingWithRelations } from '../../common/marketplace/types/marketplace';

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

jest.mock('../../common/marketplace/services/listingsService', () => ({
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
  inventory_product_id: null,
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
    expect(screen.getByText(/Rs 100\/kg/)).toBeTruthy();
    // The status reads through the vocabulary: an active listing is "Listed", never the raw value.
    expect(screen.getByText('Listed')).toBeTruthy();
    expect(screen.queryByText('active')).toBeNull();
  });

  it('names each action after its listing', async () => {
    mockFetchListings.mockResolvedValue([listing(), listing({ id: 'listing-2', title: 'Desi maize', status: 'inactive' })]);
    await renderWithQuery(<ListingModerationScreen />);
    await screen.findByText('Wheat Seeds');

    expect(screen.getByRole('button', { name: 'Deactivate Wheat Seeds' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activate Desi maize' })).toBeTruthy();
  });

  it('lets the title and the price wrap instead of cutting them off at large font sizes', async () => {
    mockFetchListings.mockResolvedValue([listing({ title: 'Hybrid Desi maize seed, certified', price: 3950 })]);
    await renderWithQuery(<ListingModerationScreen />);

    const title = await screen.findByText('Hybrid Desi maize seed, certified');
    const price = screen.getByText(/Rs 3,950\/kg/);
    expect(title.props.numberOfLines).toBeUndefined();
    expect(price.props.numberOfLines).toBeUndefined();
  });

  it('asks for confirmation before deactivating, then deactivates', async () => {
    mockFetchListings.mockResolvedValue([listing()]);
    mockUpdateListingStatus.mockResolvedValue(undefined);
    await renderWithQuery(<ListingModerationScreen />);
    await screen.findByText('Wheat Seeds');

    await fireEvent.press(screen.getByRole('button', { name: 'Deactivate Wheat Seeds' }));
    // The row's button only asks; the sheet, named after the listing, decides.
    expect(mockUpdateListingStatus).not.toHaveBeenCalled();
    expect(screen.getByText(/Buyers stop seeing this listing/)).toBeTruthy();
    expect(screen.getAllByText('Deactivate Wheat Seeds').length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByRole('button', { name: 'Deactivate listing' }));

    expect(mockUpdateListingStatus).toHaveBeenCalledWith('listing-1', 'inactive');
    expect(await screen.findByText('Wheat Seeds deactivated')).toBeTruthy();
  });

  it('backing out of the sheet leaves the listing as it was', async () => {
    mockFetchListings.mockResolvedValue([listing()]);
    await renderWithQuery(<ListingModerationScreen />);
    await screen.findByText('Wheat Seeds');

    await fireEvent.press(screen.getByRole('button', { name: 'Deactivate Wheat Seeds' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

    expect(screen.queryByText(/Buyers stop seeing this listing/)).toBeNull();
    expect(mockUpdateListingStatus).not.toHaveBeenCalled();
  });

  it('activates an inactive listing straight away, since that undoes a deactivation', async () => {
    mockFetchListings.mockResolvedValue([listing({ status: 'inactive' })]);
    mockUpdateListingStatus.mockResolvedValue(undefined);
    await renderWithQuery(<ListingModerationScreen />);
    await screen.findByText('Wheat Seeds');

    await fireEvent.press(screen.getByRole('button', { name: 'Activate Wheat Seeds' }));

    expect(mockUpdateListingStatus).toHaveBeenCalledWith('listing-1', 'active');
    expect(await screen.findByText('Wheat Seeds activated')).toBeTruthy();
  });

  it('tells an admin without a second factor to set one up (the status route needs it)', async () => {
    // PATCH …/listings/{id}/status requires a second factor (require_admin_aal2, migration 20260928090000).
    mockFetchListings.mockResolvedValue([listing()]);
    mockUpdateListingStatus.mockRejectedValue(
      new ApiError({ status: 403, code: 'mfa_required', kind: 'forbidden', message: 'MFA required' }),
    );
    await renderWithQuery(<ListingModerationScreen />);
    await screen.findByText('Wheat Seeds');

    await fireEvent.press(screen.getByRole('button', { name: 'Deactivate Wheat Seeds' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Deactivate listing' }));

    // The refusal shows as a toast, in the words of the error code, and the listing keeps its state.
    expect(await screen.findByText('Could not update the listing. This action needs two-step verification.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deactivate Wheat Seeds' })).toBeTruthy();
  });

  it('hides the toggle action for sold listings', async () => {
    mockFetchListings.mockResolvedValue([listing({ status: 'sold' })]);
    await renderWithQuery(<ListingModerationScreen />);
    await screen.findByText('Wheat Seeds');

    expect(screen.queryByText('Deactivate')).toBeNull();
    expect(screen.queryByText('Activate')).toBeNull();
  });
});
