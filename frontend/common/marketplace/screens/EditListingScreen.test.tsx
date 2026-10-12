import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import {
  createTestQueryClient,
  renderWithQuery,
} from '../../../testUtils/renderWithProviders';
import { queryKeys } from '../../../hooks/keys';
import { EditListingScreen } from './EditListingScreen';
import {
  deleteListing,
  fetchListingById,
  updateListing,
  uploadListingImages,
} from '../services/listingsService';
import { fetchLinkableInventoryProducts } from '../services/inventoryProductsService';
import { useAuthStore } from '../../../state/authStore';
import { useMarketplaceStore } from '../../../state/marketplaceStore';
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
jest.mock('../services/inventoryProductsService', () => ({
  fetchLinkableInventoryProducts: jest.fn(),
}));

const mockFetchListingById = fetchListingById as jest.Mock;
const mockUpdateListing = updateListing as jest.Mock;
const mockDeleteListing = deleteListing as jest.Mock;
const mockUploadImages = uploadListingImages as jest.Mock;
const mockFetchProducts = fetchLinkableInventoryProducts as jest.Mock;

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
  inventory_product_id: null,
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
  mockFetchProducts.mockReset();
  mockFetchProducts.mockResolvedValue([
    {
      id: 'product-1',
      sku: 'UREA-1',
      name: 'Urea',
      unit: 'bag',
      is_active: true,
    },
    {
      id: 'product-2',
      sku: 'DAP-1',
      name: 'DAP',
      unit: 'bag',
      is_active: true,
    },
    {
      id: 'product-old',
      sku: 'OLD-1',
      name: 'Old stock',
      unit: 'bag',
      is_active: false,
    },
  ]);
  useAuthStore.setState({
    user: { id: 'user-1' } as never,
    profile: { role: 'farmer' } as never,
  });
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

describe('EditListingScreen', () => {
  it('loads and prefills the existing listing', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    await renderWithQuery(<EditListingScreen {...makeProps()} />);

    expect(await screen.findByDisplayValue('Wheat seeds')).toBeTruthy();
    expect(screen.getByDisplayValue('Certified seeds')).toBeTruthy();
    expect(screen.getByDisplayValue('100')).toBeTruthy();
    expect(screen.getByText('Save Changes')).toBeTruthy();
    expect(screen.getByText('Delete Listing')).toBeTruthy();
  });

  it('fills the form from the current listing, not from a stale cached copy, so saving cannot overwrite a newer price', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.marketplace.listing('listing-1'), {
      ...listing,
      price: 90,
    }); // cached yesterday
    mockFetchListingById.mockResolvedValue({ ...listing, price: 150 }); // what the server has now
    await renderWithQuery(<EditListingScreen {...makeProps()} />, queryClient);

    expect(await screen.findByDisplayValue('150')).toBeTruthy();
    expect(screen.queryByDisplayValue('90')).toBeNull();
  });

  it('falls back to the cached copy when the current one cannot be fetched (offline)', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.marketplace.listing('listing-1'), {
      ...listing,
      price: 90,
    });
    mockFetchListingById.mockRejectedValue(new Error('offline'));
    await renderWithQuery(<EditListingScreen {...makeProps()} />, queryClient);

    expect(await screen.findByDisplayValue('90')).toBeTruthy();
  });

  it('shows a retry state when loading the listing fails', async () => {
    mockFetchListingById.mockRejectedValue(new Error('Not found'));
    await renderWithQuery(<EditListingScreen {...makeProps()} />);

    expect(await screen.findByText("Couldn't load this listing")).toBeTruthy();

    mockFetchListingById.mockResolvedValue(listing);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByDisplayValue('Wheat seeds')).toBeTruthy();
  });

  it('saves the edited listing, keeping existing images when none are added', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    mockUpdateListing.mockResolvedValue({ id: 'listing-1' });
    const props = makeProps();
    await renderWithQuery(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.changeText(
      screen.getByLabelText('Title'),
      'Wheat seeds (updated)',
    );
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
    await renderWithQuery(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.changeText(screen.getByLabelText('Title'), '');
    await fireEvent.press(screen.getByText('Save Changes'));

    expect(await screen.findByText('Enter a title')).toBeTruthy();
    expect(mockUpdateListing).not.toHaveBeenCalled();
    expect(props.navigation.goBack).not.toHaveBeenCalled();
  });

  it('keeps the reason on the screen when saving fails', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    mockUpdateListing.mockRejectedValue(new Error('Server error'));
    const props = makeProps();
    await renderWithQuery(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.press(screen.getByText('Save Changes'));

    expect(await screen.findByText('Changes not saved')).toBeTruthy();
    expect(screen.getByText('Server error')).toBeTruthy();
    expect(props.navigation.goBack).not.toHaveBeenCalled();
  });

  it('deletes the listing after confirming in the sheet', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    mockDeleteListing.mockResolvedValue(undefined);
    const props = makeProps();
    await renderWithQuery(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.press(screen.getByText('Delete Listing'));
    expect(mockDeleteListing).not.toHaveBeenCalled(); // nothing is deleted before the confirmation
    await fireEvent.press(await screen.findByText('Delete'));

    expect(mockDeleteListing).toHaveBeenCalledWith('listing-1');
    expect(props.navigation.popToTop).toHaveBeenCalledTimes(1);
  });
});

// D8: an approved dealer's listing can sell from one of their inventory products.
describe('EditListingScreen — the linked inventory product', () => {
  const dealerListing: ListingWithRelations = {
    ...listing,
    seller_role: 'dealer',
    inventory_product_id: 'product-1',
  };

  function signInAsApprovedDealer() {
    useAuthStore.setState({
      user: { id: 'user-1' } as never,
      profile: { role: 'dealer', account_status: 'approved' } as never,
    });
  }

  async function openForDealer() {
    signInAsApprovedDealer();
    mockFetchListingById.mockResolvedValue(dealerListing);
    mockUpdateListing.mockResolvedValue({ id: 'listing-1' });
    const props = makeProps();
    await renderWithQuery(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');
    return props;
  }

  async function choose(current: string, option: string) {
    await fireEvent.press(
      await screen.findByRole('button', {
        name: `Linked inventory product (optional), ${current}`,
      }),
    );
    await fireEvent.press(
      await screen.findByRole('button', {
        name: option,
        includeHiddenElements: true,
      }),
    );
  }

  it('shows the current link and offers only active products, plus None', async () => {
    await openForDealer();
    await fireEvent.press(
      await screen.findByRole('button', {
        name: 'Linked inventory product (optional), Urea · UREA-1',
      }),
    );
    expect(
      await screen.findByRole('button', {
        name: 'None',
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Urea · UREA-1',
        selected: true,
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'DAP · DAP-1',
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByText('Old stock · OLD-1', { includeHiddenElements: true }),
    ).toBeNull();
  });

  it('keeps the link when the seller edits something else: the link is not sent at all', async () => {
    const props = await openForDealer();
    await fireEvent.changeText(screen.getByLabelText('Price'), '120');
    await fireEvent.press(screen.getByText('Save Changes'));

    expect(mockUpdateListing).toHaveBeenCalledTimes(1);
    const [, input] = mockUpdateListing.mock.calls[0];
    expect(input).toEqual(expect.objectContaining({ price: 120 }));
    expect(input).not.toHaveProperty('inventoryProductId');
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it("moves the link to another of the dealer's products", async () => {
    await openForDealer();
    await choose('Urea · UREA-1', 'DAP · DAP-1');
    await fireEvent.press(screen.getByText('Save Changes'));

    expect(mockUpdateListing).toHaveBeenCalledWith(
      'listing-1',
      expect.objectContaining({ inventoryProductId: 'product-2' }),
    );
  });

  it('clears the link when the seller picks None', async () => {
    await openForDealer();
    await choose('Urea · UREA-1', 'None');
    await fireEvent.press(screen.getByText('Save Changes'));

    expect(mockUpdateListing).toHaveBeenCalledWith(
      'listing-1',
      expect.objectContaining({ inventoryProductId: null }),
    );
  });

  it('keeps a link to a product that is no longer active, and says so', async () => {
    signInAsApprovedDealer();
    mockFetchListingById.mockResolvedValue({
      ...dealerListing,
      inventory_product_id: 'product-old',
    });
    mockUpdateListing.mockResolvedValue({ id: 'listing-1' });
    await renderWithQuery(<EditListingScreen {...makeProps()} />);
    await screen.findByDisplayValue('Wheat seeds');

    expect(
      await screen.findByRole('button', {
        name: 'Linked inventory product (optional), A product no longer active',
      }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('Save Changes'));
    expect(mockUpdateListing.mock.calls[0][1]).not.toHaveProperty(
      'inventoryProductId',
    );
  });

  it('says so when the products cannot be loaded, and still saves other edits without touching the link', async () => {
    mockFetchProducts.mockRejectedValue(new Error('offline'));
    await openForDealer();

    expect(
      await screen.findByText('Your inventory products could not be loaded.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('Save Changes'));
    expect(mockUpdateListing.mock.calls[0][1]).not.toHaveProperty(
      'inventoryProductId',
    );
  });

  it.each([
    ['a farmer', { role: 'farmer', account_status: 'approved' }],
    [
      'a dealer still waiting for approval',
      { role: 'dealer', account_status: 'pending' },
    ],
  ])(
    'shows %s no picker and never asks for inventory products',
    async (_who, profile) => {
      useAuthStore.setState({
        user: { id: 'user-1' } as never,
        profile: profile as never,
      });
      mockFetchListingById.mockResolvedValue(listing);
      mockUpdateListing.mockResolvedValue({ id: 'listing-1' });
      await renderWithQuery(<EditListingScreen {...makeProps()} />);
      await screen.findByDisplayValue('Wheat seeds');

      expect(
        screen.queryByText('Linked inventory product (optional)'),
      ).toBeNull();
      expect(mockFetchProducts).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByText('Save Changes'));
      expect(mockUpdateListing.mock.calls[0][1]).not.toHaveProperty(
        'inventoryProductId',
      );
    },
  );
});
