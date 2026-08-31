import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { EditListingScreen } from './EditListingScreen';
import {
  deleteListing,
  fetchListingById,
  updateListing,
  uploadListingImages,
} from '../../services/modules/marketplace/listingsService';
import { useAuthStore } from '../../store/authStore';
import { useMarketplaceStore } from '../../store/marketplaceStore';
import type { ListingWithRelations } from '../../types/marketplace';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

jest.mock('../../services/modules/marketplace/listingsService', () => ({
  fetchListingById: jest.fn(),
  updateListing: jest.fn(),
  deleteListing: jest.fn(),
  uploadListingImages: jest.fn(),
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

function makeProps() {
  return {
    navigation: { goBack: jest.fn(), popToTop: jest.fn() },
    route: { params: { listingId: 'listing-1' } },
  } as unknown as MarketplaceScreenProps<'EditListing'>;
}

beforeEach(() => {
  mockFetchListingById.mockReset();
  mockUpdateListing.mockReset();
  mockDeleteListing.mockReset();
  mockUploadImages.mockReset();
  useAuthStore.setState({ user: { id: 'user-1' } as never });
  useMarketplaceStore.setState({
    filters: { categoryId: null, search: '', minPrice: null, maxPrice: null, city: null, cropName: null },
    categories: [],
    categoriesLoaded: true,
    crops: [],
    cropsLoaded: true,
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EditListingScreen', () => {
  it('loads and prefills the existing listing', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    await render(<EditListingScreen {...makeProps()} />);

    expect(await screen.findByDisplayValue('Wheat seeds')).toBeTruthy();
    expect(screen.getByDisplayValue('Certified seeds')).toBeTruthy();
    expect(screen.getByDisplayValue('100')).toBeTruthy();
    expect(screen.getByText('Save Changes')).toBeTruthy();
    expect(screen.getByText('Delete Listing')).toBeTruthy();
  });

  it('shows a retry state when loading the listing fails', async () => {
    mockFetchListingById.mockRejectedValue(new Error('Not found'));
    await render(<EditListingScreen {...makeProps()} />);

    expect(await screen.findByText("Couldn't load this listing")).toBeTruthy();

    mockFetchListingById.mockResolvedValue(listing);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByDisplayValue('Wheat seeds')).toBeTruthy();
  });

  it('saves the edited listing, keeping existing images when none are added', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    mockUpdateListing.mockResolvedValue({ id: 'listing-1' });
    const props = makeProps();
    await render(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Wheat seeds (updated)');
    await fireEvent.press(screen.getByText('Save Changes'));

    expect(mockUploadImages).not.toHaveBeenCalled();
    expect(mockUpdateListing).toHaveBeenCalledWith(
      'listing-1',
      expect.objectContaining({
        title: 'Wheat seeds (updated)',
        images: ['https://cdn.example.com/existing.jpg'],
      }),
    );
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows a validation error and does not save when a required field is cleared', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    const props = makeProps();
    await render(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.changeText(screen.getByLabelText('Title'), '');
    await fireEvent.press(screen.getByText('Save Changes'));

    expect(await screen.findByText('Enter a title')).toBeTruthy();
    expect(mockUpdateListing).not.toHaveBeenCalled();
    expect(props.navigation.goBack).not.toHaveBeenCalled();
  });

  it('shows an alert when saving fails', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    mockUpdateListing.mockRejectedValue(new Error('Server error'));
    const props = makeProps();
    await render(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.press(screen.getByText('Save Changes'));

    expect(Alert.alert).toHaveBeenCalledWith('Failed to update listing', 'Server error');
    expect(props.navigation.goBack).not.toHaveBeenCalled();
  });

  it('deletes the listing after confirming the alert', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    mockDeleteListing.mockResolvedValue(undefined);
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
      buttons?.find((b: { text: string }) => b.text === 'Delete')?.onPress?.();
    });
    const props = makeProps();
    await render(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.press(screen.getByText('Delete Listing'));

    expect(mockDeleteListing).toHaveBeenCalledWith('listing-1');
    expect(props.navigation.popToTop).toHaveBeenCalledTimes(1);
  });
});
