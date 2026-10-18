import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { CreateListingScreen } from './CreateListingScreen';
import {
  createListing,
  uploadListingImages,
} from '../services/listingsService';
import { fetchLinkableInventoryProducts } from '../services/inventoryProductsService';
import { pickPhotos } from '../../../utils/photoPicker';
import { useAuthStore } from '../../../state/authStore';
import { useMarketplaceStore } from '../../../state/marketplaceStore';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

jest.mock('../services/listingsService', () => ({
  createListing: jest.fn(),
  uploadListingImages: jest.fn(),
  fetchCategories: jest.fn().mockResolvedValue([]),
  fetchCrops: jest.fn().mockResolvedValue([]),
}));
jest.mock('../services/inventoryProductsService', () => ({
  fetchLinkableInventoryProducts: jest.fn(),
}));
jest.mock('../../../utils/photoPicker', () => ({
  pickPhotos: jest.fn(),
}));

const mockCreateListing = createListing as jest.Mock;
const mockUploadImages = uploadListingImages as jest.Mock;
const mockPickPhotos = pickPhotos as jest.Mock;
const mockFetchProducts = fetchLinkableInventoryProducts as jest.Mock;

function makeNavigation() {
  return {
    goBack: jest.fn(),
  } as unknown as MarketplaceScreenProps<'CreateListing'>['navigation'];
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
  mockFetchProducts.mockReset();
  useAuthStore.setState({ user: { id: 'user-1' } as never });
  useMarketplaceStore.setState({
    filters: {
      categoryId: null,
      search: '',
      minPrice: null,
      maxPrice: null,
      city: null,
      cropName: null,
    },
  });
});

describe('CreateListingScreen', () => {
  it('shows inline validation errors and does not submit when required fields are invalid', async () => {
    await renderWithQuery(
      <CreateListingScreen navigation={makeNavigation()} route={{} as never} />,
    );

    await fireEvent.press(screen.getByText('Publish Listing'));

    expect(await screen.findByText('Enter a title')).toBeTruthy();
    expect(screen.getByText('Enter a valid price')).toBeTruthy();
    expect(screen.getByText('Enter a valid quantity')).toBeTruthy();
    expect(mockCreateListing).not.toHaveBeenCalled();
    expect(
      screen.queryByText('Add at least one photo of your produce.'),
    ).toBeNull();
  });

  it('requires at least one photo before publishing', async () => {
    await renderWithQuery(
      <CreateListingScreen navigation={makeNavigation()} route={{} as never} />,
    );
    await fillRequiredFields();

    await fireEvent.press(screen.getByText('Publish Listing'));

    // The problem stays on the screen, announced, until a photo is added (a toast could vanish before it is read).
    expect(
      await screen.findByText('Add at least one photo of your produce.'),
    ).toBeTruthy();
    expect(mockCreateListing).not.toHaveBeenCalled();
  });

  it('picks photos, uploads them, creates the listing, and goes back on success', async () => {
    mockPickPhotos.mockResolvedValue([{ uri: 'file://photo1.jpg' }]);
    mockUploadImages.mockResolvedValue(['https://cdn.example.com/photo1.jpg']);
    mockCreateListing.mockResolvedValue({ id: 'listing-1' });
    const navigation = makeNavigation();
    await renderWithQuery(
      <CreateListingScreen navigation={navigation} route={{} as never} />,
    );

    await fillRequiredFields();
    await fireEvent.press(screen.getByRole('button', { name: 'Add photos' }));
    await fireEvent.press(screen.getByText('Publish Listing'));

    expect(mockUploadImages).toHaveBeenCalledWith('user-1', [
      { uri: 'file://photo1.jpg' },
    ]);
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

  it('keeps the reason on the screen when creating the listing fails', async () => {
    mockPickPhotos.mockResolvedValue([{ uri: 'file://photo1.jpg' }]);
    mockUploadImages.mockResolvedValue(['https://cdn.example.com/photo1.jpg']);
    mockCreateListing.mockRejectedValue(new Error('Server error'));
    const navigation = makeNavigation();
    await renderWithQuery(
      <CreateListingScreen navigation={navigation} route={{} as never} />,
    );

    await fillRequiredFields();
    await fireEvent.press(screen.getByRole('button', { name: 'Add photos' }));
    await fireEvent.press(screen.getByText('Publish Listing'));

    expect(await screen.findByText('Listing not published')).toBeTruthy();
    expect(screen.getByText('Server error')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it("publishes an approved dealer's listing linked to the product they picked (D8)", async () => {
    useAuthStore.setState({
      user: { id: 'user-1' } as never,
      profile: { role: 'dealer', account_status: 'approved' } as never,
    });
    mockFetchProducts.mockResolvedValue([
      {
        id: 'product-1',
        sku: 'UREA-1',
        name: 'Urea',
        unit: 'bag',
        is_active: true,
      },
    ]);
    mockPickPhotos.mockResolvedValue([{ uri: 'file://photo1.jpg' }]);
    mockUploadImages.mockResolvedValue(['https://cdn.example.com/photo1.jpg']);
    mockCreateListing.mockResolvedValue({ id: 'listing-1' });
    await renderWithQuery(
      <CreateListingScreen navigation={makeNavigation()} route={{} as never} />,
    );

    await fillRequiredFields();
    await fireEvent.press(
      await screen.findByRole('button', {
        name: 'Linked inventory product (optional), None',
      }),
    );
    await fireEvent.press(
      await screen.findByRole('button', {
        name: 'Urea · UREA-1',
        includeHiddenElements: true,
      }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add photos' }));
    await fireEvent.press(screen.getByText('Publish Listing'));

    expect(mockCreateListing).toHaveBeenCalledWith(
      expect.objectContaining({ inventoryProductId: 'product-1' }),
    );
  });

  it("publishes a farmer's listing with no product link", async () => {
    useAuthStore.setState({
      user: { id: 'user-1' } as never,
      profile: { role: 'farmer' } as never,
    });
    mockPickPhotos.mockResolvedValue([{ uri: 'file://photo1.jpg' }]);
    mockUploadImages.mockResolvedValue(['https://cdn.example.com/photo1.jpg']);
    mockCreateListing.mockResolvedValue({ id: 'listing-1' });
    await renderWithQuery(
      <CreateListingScreen navigation={makeNavigation()} route={{} as never} />,
    );

    await fillRequiredFields();
    await fireEvent.press(screen.getByRole('button', { name: 'Add photos' }));
    await fireEvent.press(screen.getByText('Publish Listing'));

    expect(mockFetchProducts).not.toHaveBeenCalled();
    expect(mockCreateListing).toHaveBeenCalledWith(
      expect.objectContaining({ inventoryProductId: null }),
    );
  });
});
