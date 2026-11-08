import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ListingModerationScreen } from './ListingModerationScreen';
import { fetchModerationListingsPage } from '../services/adminService';
import { updateListingStatus } from '../../common/marketplace/services/listingsService';
import { useAuthStore } from '../../state/authStore';
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

jest.mock('../services/adminService', () => ({ fetchModerationListingsPage: jest.fn() }));
jest.mock('../../common/marketplace/services/listingsService', () => ({ updateListingStatus: jest.fn() }));

const mockFetchPage = fetchModerationListingsPage as jest.Mock;
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

const page = (rows: ListingWithRelations[], next: { limit: number; offset: number } | null = null) => ({ data: rows, next });

beforeEach(() => {
  mockFetchPage.mockReset();
  mockUpdateListingStatus.mockReset();
  useAuthStore.setState({ user: { id: 'admin-1' } as never });
});

describe('ListingModerationScreen', () => {
  it('shows an empty state when there are no listings', async () => {
    mockFetchPage.mockResolvedValue(page([]));
    await renderWithQuery(<ListingModerationScreen />);
    expect(await screen.findByText('No listings yet')).toBeTruthy();
  });

  it('says the load failed instead of "No listings yet" (AD-11)', async () => {
    mockFetchPage.mockRejectedValueOnce(new Error('boom'));
    await renderWithQuery(<ListingModerationScreen />);
    expect(await screen.findByText("Couldn't load listings")).toBeTruthy();
    expect(screen.queryByText('No listings yet')).toBeNull();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('lists listings with the price and the status word from the shared vocabulary', async () => {
    mockFetchPage.mockResolvedValue(page([listing()]));
    await renderWithQuery(<ListingModerationScreen />);
    expect(await screen.findByText('Wheat Seeds')).toBeTruthy();
    expect(screen.getByText('Farmer Sana')).toBeTruthy();
    expect(screen.getByText('Rs 100/kg')).toBeTruthy();
    // The filter chip and the row's badge use the same word.
    expect(screen.getAllByText('Listed')).toHaveLength(2);
  });

  it('hides a listing only after the consequence is read, and offers Undo (AD-04, AD-17)', async () => {
    mockFetchPage.mockResolvedValue(page([listing()]));
    mockUpdateListingStatus.mockResolvedValue(undefined);
    await renderWithQuery(<ListingModerationScreen />);

    await fireEvent.press(await screen.findByText('Wheat Seeds'));
    await fireEvent.press(await screen.findByText('Hide listing'));
    expect(await screen.findByText('Hide "Wheat Seeds"?')).toBeTruthy();
    expect(screen.getByText(/Buyers will no longer find "Wheat Seeds" in the marketplace/)).toBeTruthy();
    expect(mockUpdateListingStatus).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Hide listing' }));
    expect(mockUpdateListingStatus).toHaveBeenCalledWith('listing-1', 'inactive');
    expect(await screen.findByText('Listing hidden')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(mockUpdateListingStatus).toHaveBeenLastCalledWith('listing-1', 'active');
  });

  it('restores a hidden listing', async () => {
    mockFetchPage.mockResolvedValue(page([listing({ status: 'inactive' })]));
    mockUpdateListingStatus.mockResolvedValue(undefined);
    await renderWithQuery(<ListingModerationScreen />);

    await fireEvent.press(await screen.findByText('Wheat Seeds'));
    await fireEvent.press(await screen.findByText('Restore listing'));
    await fireEvent.press(screen.getByRole('button', { name: 'Restore listing' }));

    expect(mockUpdateListingStatus).toHaveBeenCalledWith('listing-1', 'active');
  });

  it('keeps the sheet open with the reason when the server refuses', async () => {
    mockFetchPage.mockResolvedValue(page([listing()]));
    mockUpdateListingStatus.mockRejectedValue(new Error('no'));
    await renderWithQuery(<ListingModerationScreen />);

    await fireEvent.press(await screen.findByText('Wheat Seeds'));
    await fireEvent.press(await screen.findByText('Hide listing'));
    await fireEvent.press(screen.getByRole('button', { name: 'Hide listing' }));

    expect(await screen.findByText("Couldn't finish")).toBeTruthy();
  });

  it('offers nothing on a sold listing', async () => {
    mockFetchPage.mockResolvedValue(page([listing({ status: 'sold' })]));
    await renderWithQuery(<ListingModerationScreen />);
    await screen.findByText('Wheat Seeds');
    expect(screen.queryByRole('button', { name: /Wheat Seeds/ })).toBeNull();
  });

  it('filters by status and searches by title or seller', async () => {
    mockFetchPage.mockResolvedValue(
      page([listing(), listing({ id: 'listing-2', title: 'Urea 50 kg', status: 'inactive', owner: { id: 'o2', full_name: 'Dealer Bilal', avatar_url: null } })]),
    );
    await renderWithQuery(<ListingModerationScreen />);
    await screen.findByText('Wheat Seeds');

    await fireEvent.press(screen.getByRole('button', { name: 'Hidden' }));
    expect(screen.queryByText('Wheat Seeds')).toBeNull();
    expect(screen.getByText('Urea 50 kg')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'All' }));
    await fireEvent.changeText(screen.getByLabelText('Find a listing'), 'sana');
    expect(screen.getByText('Wheat Seeds')).toBeTruthy();
    expect(screen.queryByText('Urea 50 kg')).toBeNull();
  });

  it('loads the next page', async () => {
    mockFetchPage.mockResolvedValueOnce(page([listing()], { limit: 50, offset: 50 }));
    mockFetchPage.mockResolvedValueOnce(page([listing({ id: 'listing-101', title: 'Listing 101' })]));
    await renderWithQuery(<ListingModerationScreen />);
    await screen.findByText('Wheat Seeds');

    await fireEvent.press(screen.getByRole('button', { name: 'Load more listings' }));

    expect(await screen.findByText('Listing 101')).toBeTruthy();
    expect(mockFetchPage).toHaveBeenLastCalledWith(50);
  });
});
