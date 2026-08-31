import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CreateListingScreen } from './CreateListingScreen';
import { createListing, uploadListingImages } from '../../services/modules/marketplace/listingsService';
import { pickPhotos } from '../../utils/photoPicker';
import { useAuthStore } from '../../store/authStore';
import { useMarketplaceStore } from '../../store/marketplaceStore';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

jest.mock('../../services/modules/marketplace/listingsService', () => ({
  createListing: jest.fn(),
  uploadListingImages: jest.fn(),
}));
jest.mock('../../utils/photoPicker', () => ({
  pickPhotos: jest.fn(),
}));

const mockCreateListing = createListing as jest.Mock;
const mockUploadImages = uploadListingImages as jest.Mock;
const mockPickPhotos = pickPhotos as jest.Mock;

function makeNavigation() {
  return { goBack: jest.fn() } as unknown as MarketplaceScreenProps<'CreateListing'>['navigation'];
}

async function fillRequiredFields() {
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Wheat seeds');
  await fireEvent.changeText(screen.getByLabelText('Price'), '100');
  await fireEvent.changeText(screen.getByLabelText('Unit'), 'kg');
  await fireEvent.changeText(screen.getByLabelText('Quantity available'), '50');
}

beforeEach(() => {
  mockCreateListing.mockReset();
  mockUploadImages.mockReset();
  mockPickPhotos.mockReset();
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

describe('CreateListingScreen', () => {
  it('shows inline validation errors and does not submit when required fields are invalid', async () => {
    await render(<CreateListingScreen navigation={makeNavigation()} route={{} as never} />);

    await fireEvent.press(screen.getByText('Publish Listing'));

    expect(await screen.findByText('Enter a title')).toBeTruthy();
    expect(screen.getByText('Enter a valid price')).toBeTruthy();
    expect(screen.getByText('Enter a valid quantity')).toBeTruthy();
    expect(mockCreateListing).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('requires at least one photo before publishing', async () => {
    await render(<CreateListingScreen navigation={makeNavigation()} route={{} as never} />);
    await fillRequiredFields();

    await fireEvent.press(screen.getByText('Publish Listing'));

    expect(Alert.alert).toHaveBeenCalledWith('Add a photo', expect.any(String));
    expect(mockCreateListing).not.toHaveBeenCalled();
  });

  it('picks photos, uploads them, creates the listing, and goes back on success', async () => {
    mockPickPhotos.mockResolvedValue([{ uri: 'file://photo1.jpg' }]);
    mockUploadImages.mockResolvedValue(['https://cdn.example.com/photo1.jpg']);
    mockCreateListing.mockResolvedValue({ id: 'listing-1' });
    const navigation = makeNavigation();
    await render(<CreateListingScreen navigation={navigation} route={{} as never} />);

    await fillRequiredFields();
    await fireEvent.press(screen.getByText('+ Add'));
    await fireEvent.press(screen.getByText('Publish Listing'));

    expect(mockUploadImages).toHaveBeenCalledWith('user-1', [{ uri: 'file://photo1.jpg' }]);
    expect(mockCreateListing).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Wheat seeds',
        price: 100,
        unit: 'kg',
        quantity: 50,
        images: ['https://cdn.example.com/photo1.jpg'],
      }),
    );
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows an alert when creating the listing fails', async () => {
    mockPickPhotos.mockResolvedValue([{ uri: 'file://photo1.jpg' }]);
    mockUploadImages.mockResolvedValue(['https://cdn.example.com/photo1.jpg']);
    mockCreateListing.mockRejectedValue(new Error('Server error'));
    const navigation = makeNavigation();
    await render(<CreateListingScreen navigation={navigation} route={{} as never} />);

    await fillRequiredFields();
    await fireEvent.press(screen.getByText('+ Add'));
    await fireEvent.press(screen.getByText('Publish Listing'));

    expect(Alert.alert).toHaveBeenCalledWith('Failed to create listing', 'Server error');
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
