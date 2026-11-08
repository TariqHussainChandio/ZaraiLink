import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../../testUtils/renderWithProviders';
import { queryKeys } from '../../../hooks/keys';
import { EditListingScreen } from './EditListingScreen';
import { deleteListing, fetchListingById, updateListing, uploadListingImages } from '../services/listingsService';
import { useAuthStore } from '../../../state/authStore';
import type { ListingWithRelations } from '../types/marketplace';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

jest.mock('../services/listingsService', () => ({
  fetchListingById: jest.fn(),
  updateListing: jest.fn(),
  deleteListing: jest.fn(),
  uploadListingImages: jest.fn(),
  fetchCategories: jest.fn().mockResolvedValue([]),
  fetchCrops: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../reference-data/services/referenceDataService', () => ({
  fetchUnits: jest.fn().mockResolvedValue([{ id: 'u1', code: 'kg', label: 'Kilogram', applies_to: 'weight' }]),
}));

const mockFetchListingById = fetchListingById as jest.Mock;
const mockUpdateListing = updateListing as jest.Mock;
const mockDeleteListing = deleteListing as jest.Mock;
const mockUploadImages = uploadListingImages as jest.Mock;

const listing: ListingWithRelations = {
  id: 'listing-1',
  owner_id: 'user-1',
  category_id: null,
  title: 'Wheat seeds',
  description: 'Certified seeds',
  price: 100,
  unit: 'kg',
  quantity: 50,
  images: ['https://cdn.example.com/existing.jpg'],
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
};

type Listener = (event: { preventDefault: () => void; data: { action: object } }) => void;

function makeProps() {
  const listeners: Listener[] = [];
  const navigation = {
    goBack: jest.fn(),
    popToTop: jest.fn(),
    dispatch: jest.fn(),
    addListener: jest.fn((_event: string, listener: Listener) => {
      listeners.push(listener);
      return () => undefined;
    }),
  };
  const leave = async () => {
    const preventDefault = jest.fn();
    await act(async () => listeners.at(-1)?.({ preventDefault, data: { action: { type: 'GO_BACK' } } }));
    return preventDefault;
  };
  return {
    props: { navigation, route: { params: { listingId: 'listing-1' } } } as unknown as MarketplaceScreenProps<'EditListing'>,
    navigation,
    leave,
  };
}

beforeEach(() => {
  mockFetchListingById.mockReset();
  mockUpdateListing.mockReset();
  mockDeleteListing.mockReset();
  mockUploadImages.mockReset();
  useAuthStore.setState({ user: { id: 'user-1' } as never });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EditListingScreen', () => {
  it('loads and prefills the existing listing, with its price and quantity as plain digits', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    await renderWithQuery(<EditListingScreen {...makeProps().props} />);

    expect(await screen.findByDisplayValue('Wheat seeds')).toBeTruthy();
    expect(screen.getByDisplayValue('Certified seeds')).toBeTruthy();
    expect(screen.getByDisplayValue('100')).toBeTruthy();
    expect(screen.getByDisplayValue('50')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete listing' })).toBeTruthy();
    expect(screen.getByLabelText('1 of 5 photos')).toBeTruthy();
  });

  it('fills the form from the current listing, not from a stale cached copy, so saving cannot overwrite a newer price', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.marketplace.listing('listing-1'), { ...listing, price: 90 }); // cached yesterday
    mockFetchListingById.mockResolvedValue({ ...listing, price: 150 }); // what the server has now
    await renderWithQuery(<EditListingScreen {...makeProps().props} />, queryClient);

    expect(await screen.findByDisplayValue('150')).toBeTruthy();
    expect(screen.queryByDisplayValue('90')).toBeNull();
  });

  it('falls back to the cached copy when the current one cannot be fetched (offline)', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.marketplace.listing('listing-1'), { ...listing, price: 90 });
    mockFetchListingById.mockRejectedValue(new Error('offline'));
    await renderWithQuery(<EditListingScreen {...makeProps().props} />, queryClient);

    expect(await screen.findByDisplayValue('90')).toBeTruthy();
  });

  it('shows a Banner with "Try again" when loading the listing fails (MK-03)', async () => {
    mockFetchListingById.mockRejectedValue(new Error('Not found'));
    await renderWithQuery(<EditListingScreen {...makeProps().props} />);

    expect(await screen.findByText("Couldn't load this listing")).toBeTruthy();

    mockFetchListingById.mockResolvedValue(listing);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByDisplayValue('Wheat seeds')).toBeTruthy();
  });

  it('saves the edited listing, keeping existing images when none are added, and says so in a snackbar', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    mockUpdateListing.mockResolvedValue({ id: 'listing-1' });
    const { props, navigation } = makeProps();
    await renderWithQuery(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.changeText(screen.getByLabelText('Name of the product'), 'Wheat seeds (updated)');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Changes saved')).toBeTruthy();
    expect(mockUploadImages).not.toHaveBeenCalled();
    expect(mockUpdateListing).toHaveBeenCalledWith(
      'listing-1',
      expect.objectContaining({ title: 'Wheat seeds (updated)', price: 100, quantity: 50, images: ['https://cdn.example.com/existing.jpg'] }),
    );
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows a validation error and does not save when a required field is cleared', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    const { props, navigation } = makeProps();
    await renderWithQuery(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.changeText(screen.getByLabelText('Name of the product'), '');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Enter a name of at least 2 letters')).toBeTruthy();
    expect(mockUpdateListing).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('removes a photo, and will not save a listing left with none', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    const { props } = makeProps();
    await renderWithQuery(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.press(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(screen.getByLabelText('0 of 5 photos')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Keep at least one photo so buyers can see what you sell')).toBeTruthy();
    expect(mockUpdateListing).not.toHaveBeenCalled();
  });

  it('shows an alert when saving fails, and stays on the form', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    mockUpdateListing.mockRejectedValue(new Error('Server error'));
    const { props, navigation } = makeProps();
    await renderWithQuery(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn't save the changes", 'Server error'));
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('deletes the listing only after the sheet names the consequence and the seller confirms', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    mockDeleteListing.mockResolvedValue(undefined);
    const { props, navigation } = makeProps();
    await renderWithQuery(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.press(screen.getByRole('button', { name: 'Delete listing' }));
    expect(await screen.findByText('Delete this listing?')).toBeTruthy();
    expect(mockDeleteListing).not.toHaveBeenCalled();

    // The sheet's button is the second one with this name; the form's own is behind it.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete listing' }).at(-1)!);
    await waitFor(() => expect(mockDeleteListing).toHaveBeenCalledWith('listing-1'));
    await waitFor(() => expect(navigation.popToTop).toHaveBeenCalledTimes(1));
  });

  it('keeps the listing when the seller backs out of the delete sheet', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    const { props, navigation } = makeProps();
    await renderWithQuery(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.press(screen.getByRole('button', { name: 'Delete listing' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Keep listing' }));
    expect(mockDeleteListing).not.toHaveBeenCalled();
    expect(navigation.popToTop).not.toHaveBeenCalled();
  });

  it('asks before leaving with unsaved changes, and not when nothing changed', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    const { props, navigation, leave } = makeProps();
    await renderWithQuery(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    expect(await leave()).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Name of the product'), 'Wheat seeds 2');
    await waitFor(async () => expect(await leave()).toHaveBeenCalled());
    expect(await screen.findByText('Discard your changes?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Discard changes' }));
    expect(navigation.dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });
});
