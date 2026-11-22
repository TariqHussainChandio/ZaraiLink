import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../../testUtils/renderWithProviders';
import { queryKeys } from '../../../hooks/keys';
import { EditListingScreen } from './EditListingScreen';
import { deleteListing, fetchListingById, updateListing, uploadListingImages } from '../services/listingsService';
import { fetchLinkableInventoryProducts } from '../services/inventoryProductsService';
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
jest.mock('../services/inventoryProductsService', () => ({
  fetchLinkableInventoryProducts: jest.fn(),
}));
jest.mock('../../reference-data/services/referenceDataService', () => ({
  fetchUnits: jest.fn().mockResolvedValue([{ id: 'u1', code: 'kg', label: 'Kilogram', applies_to: 'weight' }]),
}));

const mockFetchListingById = fetchListingById as jest.Mock;
const mockUpdateListing = updateListing as jest.Mock;
const mockDeleteListing = deleteListing as jest.Mock;
const mockUploadImages = uploadListingImages as jest.Mock;
const mockFetchProducts = fetchLinkableInventoryProducts as jest.Mock;

const listing: ListingWithRelations = {
  id: 'listing-1',
  owner_id: 'user-1',
  inventory_product_id: null,
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
  mockFetchProducts.mockReset().mockResolvedValue([
    { id: 'product-1', sku: 'UREA-1', name: 'Urea', unit: 'bag', is_active: true },
    { id: 'product-2', sku: 'DAP-1', name: 'DAP', unit: 'bag', is_active: true },
    { id: 'product-old', sku: 'OLD-1', name: 'Old stock', unit: 'bag', is_active: false },
  ]);
  useAuthStore.setState({ user: { id: 'user-1' } as never, profile: { role: 'farmer' } as never });
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

  it('keeps the reason on the screen when saving fails, and stays on the form', async () => {
    mockFetchListingById.mockResolvedValue(listing);
    mockUpdateListing.mockRejectedValue(new Error('Server error'));
    const { props, navigation } = makeProps();
    await renderWithQuery(<EditListingScreen {...props} />);
    await screen.findByDisplayValue('Wheat seeds');

    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    // A Banner, not an alert: it stays until the next try (A8).
    expect(await screen.findByText("Couldn't save the changes")).toBeTruthy();
    expect(screen.getByText('Server error')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
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

// D8: an approved dealer's listing can sell from one of their inventory products.
describe('EditListingScreen, the linked inventory product', () => {
  const dealerListing: ListingWithRelations = { ...listing, seller_role: 'dealer', inventory_product_id: 'product-1' };

  function signInAsApprovedDealer() {
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: { role: 'dealer', account_status: 'approved' } as never });
  }

  async function openForDealer() {
    signInAsApprovedDealer();
    mockFetchListingById.mockResolvedValue(dealerListing);
    mockUpdateListing.mockResolvedValue({ id: 'listing-1' });
    const made = makeProps();
    await renderWithQuery(<EditListingScreen {...made.props} />);
    await screen.findByDisplayValue('Wheat seeds');
    return made;
  }

  async function choose(current: string, option: string) {
    await fireEvent.press(await screen.findByRole('button', { name: `Linked inventory product, ${current}` }));
    await fireEvent.press(await screen.findByRole('button', { name: option, includeHiddenElements: true }));
  }

  const save = () => fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

  it('shows the current link and offers only active products, plus None', async () => {
    await openForDealer();
    await fireEvent.press(await screen.findByRole('button', { name: 'Linked inventory product, Urea · UREA-1' }));
    expect(await screen.findByRole('button', { name: 'None', includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Urea · UREA-1', selected: true, includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'DAP · DAP-1', includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Old stock · OLD-1', { includeHiddenElements: true })).toBeNull();
  });

  it('keeps the link when the seller edits something else: the link is not sent at all', async () => {
    const { navigation } = await openForDealer();
    await fireEvent.changeText(screen.getByLabelText('Price'), '120');
    await save();

    await waitFor(() => expect(mockUpdateListing).toHaveBeenCalledTimes(1));
    const [, input] = mockUpdateListing.mock.calls[0];
    expect(input).toEqual(expect.objectContaining({ price: 120 }));
    expect(input).not.toHaveProperty('inventoryProductId');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it("moves the link to another of the dealer's products", async () => {
    await openForDealer();
    await choose('Urea · UREA-1', 'DAP · DAP-1');
    await save();
    await waitFor(() =>
      expect(mockUpdateListing).toHaveBeenCalledWith('listing-1', expect.objectContaining({ inventoryProductId: 'product-2' })),
    );
  });

  it('clears the link when the seller picks None', async () => {
    await openForDealer();
    await choose('Urea · UREA-1', 'None');
    await save();
    await waitFor(() =>
      expect(mockUpdateListing).toHaveBeenCalledWith('listing-1', expect.objectContaining({ inventoryProductId: null })),
    );
  });

  it('keeps a link to a product that is no longer active, and says so', async () => {
    signInAsApprovedDealer();
    mockFetchListingById.mockResolvedValue({ ...dealerListing, inventory_product_id: 'product-old' });
    mockUpdateListing.mockResolvedValue({ id: 'listing-1' });
    await renderWithQuery(<EditListingScreen {...makeProps().props} />);
    await screen.findByDisplayValue('Wheat seeds');

    expect(await screen.findByRole('button', { name: 'Linked inventory product, A product no longer active' })).toBeTruthy();
    await save();
    await waitFor(() => expect(mockUpdateListing).toHaveBeenCalledTimes(1));
    expect(mockUpdateListing.mock.calls[0][1]).not.toHaveProperty('inventoryProductId');
  });

  it('says so when the products cannot be loaded, and still saves other edits without touching the link', async () => {
    mockFetchProducts.mockRejectedValue(new Error('offline'));
    await openForDealer();

    expect(await screen.findByText('Your inventory products could not be loaded.')).toBeTruthy();
    await save();
    await waitFor(() => expect(mockUpdateListing).toHaveBeenCalledTimes(1));
    expect(mockUpdateListing.mock.calls[0][1]).not.toHaveProperty('inventoryProductId');
  });

  it.each([
    ['a farmer', { role: 'farmer', account_status: 'approved' }],
    ['a dealer still waiting for approval', { role: 'dealer', account_status: 'pending' }],
  ])('shows %s no picker and never asks for inventory products', async (_who, profile) => {
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: profile as never });
    mockFetchListingById.mockResolvedValue(listing);
    mockUpdateListing.mockResolvedValue({ id: 'listing-1' });
    await renderWithQuery(<EditListingScreen {...makeProps().props} />);
    await screen.findByDisplayValue('Wheat seeds');

    expect(screen.queryByText('Linked inventory product')).toBeNull();
    expect(mockFetchProducts).not.toHaveBeenCalled();
    await save();
    await waitFor(() => expect(mockUpdateListing).toHaveBeenCalledTimes(1));
    expect(mockUpdateListing.mock.calls[0][1]).not.toHaveProperty('inventoryProductId');
  });
});
