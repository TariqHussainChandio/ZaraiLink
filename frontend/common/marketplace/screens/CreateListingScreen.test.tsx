import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { CreateListingScreen } from './CreateListingScreen';
import { createListing, uploadListingImages } from '../services/listingsService';
import { pickPhotos } from '../../../utils/photoPicker';
import { useAuthStore } from '../../../state/authStore';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

jest.mock('../services/listingsService', () => ({
  createListing: jest.fn(),
  uploadListingImages: jest.fn(),
  fetchCategories: jest.fn().mockResolvedValue([]),
  fetchCrops: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../reference-data/services/referenceDataService', () => ({
  fetchUnits: jest.fn().mockResolvedValue([{ id: 'u1', code: 'kg', label: 'Kilogram', applies_to: 'weight' }]),
}));
jest.mock('../../../utils/photoPicker', () => ({
  pickPhotos: jest.fn(),
}));

const mockCreateListing = createListing as jest.Mock;
const mockUploadImages = uploadListingImages as jest.Mock;
const mockPickPhotos = pickPhotos as jest.Mock;

type Listener = (event: { preventDefault: () => void; data: { action: object } }) => void;

function makeNavigation() {
  const listeners: Listener[] = [];
  const navigation = {
    replace: jest.fn(),
    dispatch: jest.fn(),
    addListener: jest.fn((_event: string, listener: Listener) => {
      listeners.push(listener);
      return () => undefined;
    }),
  };
  // What React Navigation does when the screen is about to be left (Back, gesture, tab press).
  const leave = async () => {
    const preventDefault = jest.fn();
    await act(async () => listeners.at(-1)?.({ preventDefault, data: { action: { type: 'GO_BACK' } } }));
    return preventDefault;
  };
  return { navigation: navigation as unknown as MarketplaceScreenProps<'CreateListing'>['navigation'], raw: navigation, leave };
}

async function pickKilogram() {
  await fireEvent.press(await screen.findByRole('button', { name: /Sold by/ }));
  await fireEvent.press(await screen.findByText('Kilogram (kg)', {}, { timeout: 3000 }));
}

async function fillRequiredFields() {
  await fireEvent.changeText(screen.getByLabelText('Name of the product'), 'Wheat seeds');
  await pickKilogram();
  await fireEvent.changeText(screen.getByLabelText('Price'), '100');
  await fireEvent.changeText(screen.getByLabelText('Quantity available'), '50');
}

beforeEach(() => {
  mockCreateListing.mockReset();
  mockUploadImages.mockReset();
  mockPickPhotos.mockReset();
  useAuthStore.setState({ user: { id: 'user-1' } as never, profile: null });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CreateListingScreen', () => {
  it('shows every problem inline at once, including the missing photo, and does not submit', async () => {
    const { navigation } = makeNavigation();
    await renderWithQuery(<CreateListingScreen navigation={navigation} route={{} as never} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Publish listing' }));

    expect(await screen.findByText('Enter a name of at least 2 letters')).toBeTruthy();
    expect(screen.getByText('Enter the price in rupees, above Rs 0')).toBeTruthy();
    expect(screen.getByText('Enter how many you have, 1 or more')).toBeTruthy();
    expect(screen.getByText('Choose how it is sold, such as kg or bag')).toBeTruthy();
    expect(screen.getByText('Add at least one photo so buyers can see what you sell')).toBeTruthy();
    expect(mockCreateListing).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('names a missing photo under the photos, not in an alert, once everything else is valid (MK-07)', async () => {
    const { navigation } = makeNavigation();
    await renderWithQuery(<CreateListingScreen navigation={navigation} route={{} as never} />);
    await fillRequiredFields();

    await fireEvent.press(screen.getByRole('button', { name: 'Publish listing' }));

    expect(await screen.findByText('Add at least one photo so buyers can see what you sell')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockCreateListing).not.toHaveBeenCalled();
  });

  it('adds photos to the ones already chosen, counts them, and removes one', async () => {
    mockPickPhotos.mockResolvedValueOnce([{ uri: 'file://a.jpg' }]).mockResolvedValueOnce([{ uri: 'file://b.jpg' }]);
    const { navigation } = makeNavigation();
    await renderWithQuery(<CreateListingScreen navigation={navigation} route={{} as never} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Add a photo' }));
    expect(await screen.findByLabelText('1 of 5 photos')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add a photo' }));
    expect(await screen.findByLabelText('2 of 5 photos')).toBeTruthy();
    // The picker is told how many more fit.
    expect(mockPickPhotos).toHaveBeenLastCalledWith({ selectionLimit: 4 });

    await fireEvent.press(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(await screen.findByLabelText('1 of 5 photos')).toBeTruthy();
  });

  it('picks photos, uploads them, creates the listing with whole numbers, and opens it with a snackbar', async () => {
    mockPickPhotos.mockResolvedValue([{ uri: 'file://photo1.jpg' }]);
    mockUploadImages.mockResolvedValue(['https://cdn.example.com/photo1.jpg']);
    mockCreateListing.mockResolvedValue({ id: 'listing-1' });
    const { navigation, raw } = makeNavigation();
    await renderWithQuery(<CreateListingScreen navigation={navigation} route={{} as never} />);

    await fillRequiredFields();
    await fireEvent.changeText(screen.getByLabelText('Price'), 'Rs 1,500');
    await fireEvent.press(screen.getByRole('button', { name: 'Add a photo' }));
    await screen.findByLabelText('1 of 5 photos');
    await fireEvent.press(screen.getByRole('button', { name: 'Publish listing' }));

    expect(await screen.findByText('Listing published')).toBeTruthy();
    expect(mockUploadImages).toHaveBeenCalledWith('user-1', [{ uri: 'file://photo1.jpg' }]);
    expect(mockCreateListing).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Wheat seeds',
        price: 1500,
        unit: 'kg',
        quantity: 50,
        images: ['https://cdn.example.com/photo1.jpg'],
      }),
    );
    expect(raw.replace).toHaveBeenCalledWith(MARKETPLACE_ROUTES.ListingDetail, { listingId: 'listing-1' });
  });

  it('shows an alert when creating the listing fails, and stays on the form', async () => {
    mockPickPhotos.mockResolvedValue([{ uri: 'file://photo1.jpg' }]);
    mockUploadImages.mockResolvedValue(['https://cdn.example.com/photo1.jpg']);
    mockCreateListing.mockRejectedValue(new Error('Server error'));
    const { navigation, raw } = makeNavigation();
    await renderWithQuery(<CreateListingScreen navigation={navigation} route={{} as never} />);

    await fillRequiredFields();
    await fireEvent.press(screen.getByRole('button', { name: 'Add a photo' }));
    await screen.findByLabelText('1 of 5 photos');
    await fireEvent.press(screen.getByRole('button', { name: 'Publish listing' }));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn't publish the listing", 'Server error'));
    expect(raw.replace).not.toHaveBeenCalled();
  });

  it('starts the place from the seller profile', async () => {
    useAuthStore.setState({ profile: { country: 'Pakistan', province: 'Punjab', city: 'Okara' } as never });
    const { navigation } = makeNavigation();
    await renderWithQuery(<CreateListingScreen navigation={navigation} route={{} as never} />);
    expect(screen.getByDisplayValue('Okara')).toBeTruthy();
    expect(screen.getByText('Punjab')).toBeTruthy();
  });

  it('lets an untouched form go without asking', async () => {
    const { navigation, leave } = makeNavigation();
    await renderWithQuery(<CreateListingScreen navigation={navigation} route={{} as never} />);
    expect(await leave()).not.toHaveBeenCalled();
  });

  it('asks "Discard this listing?" before throwing away a half-filled form, and leaves on Discard', async () => {
    const { navigation, raw, leave } = makeNavigation();
    await renderWithQuery(<CreateListingScreen navigation={navigation} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Name of the product'), 'Wheat');

    // The form reports itself dirty a moment after the keystroke, so leave until it asks.
    await waitFor(async () => expect(await leave()).toHaveBeenCalled());
    expect(await screen.findByText('Discard this listing?')).toBeTruthy();
    expect(raw.dispatch).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Discard listing' }));
    expect(raw.dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });

  it('keeps the form when the seller chooses Keep editing', async () => {
    const { navigation, raw, leave } = makeNavigation();
    await renderWithQuery(<CreateListingScreen navigation={navigation} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Name of the product'), 'Wheat');
    await waitFor(async () => expect(await leave()).toHaveBeenCalled());
    await fireEvent.press(await screen.findByRole('button', { name: 'Keep editing' }));
    expect(raw.dispatch).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Wheat')).toBeTruthy();
  });
});
