import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { StoreDetailScreen } from './StoreDetailScreen';
import { createStore, deleteStore, fetchStoreById, updateStore } from '../services/storeService';
import { useAuthStore } from '../../state/authStore';
import type { DealerStore } from '../types/dealer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

jest.mock('../services/storeService', () => ({
  createStore: jest.fn(),
  deleteStore: jest.fn(),
  fetchStoreById: jest.fn(),
  updateStore: jest.fn(),
}));

const mockCreateStore = createStore as jest.Mock;
const mockDeleteStore = deleteStore as jest.Mock;
const mockFetchStoreById = fetchStoreById as jest.Mock;
const mockUpdateStore = updateStore as jest.Mock;

const store: DealerStore = {
  id: 'store-1',
  dealer_id: 'dealer-1',
  name: 'Main Branch',
  address: 'Ferozepur Road',
  location: { country: 'Pakistan', province: 'Punjab', city: 'Lahore' },
  contact: '+923000000000',
  opening_info: '9am - 6pm',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function makeProps(storeId?: string) {
  return {
    navigation: { goBack: jest.fn() },
    route: { params: storeId ? { storeId } : {} },
  } as unknown as HomeScreenProps<'StoreDetail'>;
}

beforeEach(() => {
  mockCreateStore.mockReset();
  mockDeleteStore.mockReset();
  mockFetchStoreById.mockReset();
  mockUpdateStore.mockReset();
  useAuthStore.setState({ user: { id: 'dealer-1' } as never });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('StoreDetailScreen', () => {
  it('adds a new store from the form', async () => {
    mockCreateStore.mockResolvedValue(store);
    const props = makeProps();
    await renderWithQuery(<StoreDetailScreen {...props} />);

    await fireEvent.changeText(screen.getByLabelText('Store name'), 'Main Branch');
    await fireEvent.press(screen.getByRole('button', { name: 'Add store' }));

    expect(mockCreateStore).toHaveBeenCalledWith({
      name: 'Main Branch',
      address: null,
      contact: null,
      openingInfo: null,
      status: 'active',
      country: null,
      province: null,
      city: null,
    });
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows a validation error when the name is missing', async () => {
    const props = makeProps();
    await renderWithQuery(<StoreDetailScreen {...props} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add store' }));
    expect(await screen.findByText('Enter a store name')).toBeTruthy();
    expect(mockCreateStore).not.toHaveBeenCalled();
  });

  it('takes the contact as a phone number and refuses text that is not one, inline', async () => {
    mockCreateStore.mockResolvedValue(store);
    await renderWithQuery(<StoreDetailScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText('Store name'), 'Main Branch');
    await fireEvent.changeText(screen.getByLabelText('Contact number'), 'call Ali');
    await fireEvent.press(screen.getByRole('button', { name: 'Add store' }));
    expect(await screen.findByText('Enter a phone number like 0300 1234567')).toBeTruthy();
    expect(mockCreateStore).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Contact number'), '0300 0000000');
    await fireEvent.press(screen.getByRole('button', { name: 'Add store' }));
    expect(mockCreateStore).toHaveBeenCalledWith(expect.objectContaining({ contact: '+923000000000' }));
  });

  it('loads and prefills an existing store, then saves changes', async () => {
    mockFetchStoreById.mockResolvedValue(store);
    mockUpdateStore.mockResolvedValue(store);
    const props = makeProps('store-1');
    await renderWithQuery(<StoreDetailScreen {...props} />);

    expect(await screen.findByLabelText('Store name')).toBeTruthy();
    expect(screen.getByLabelText('Store name').props.value).toBe('Main Branch');

    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(mockUpdateStore).toHaveBeenCalledWith('store-1', {
      name: 'Main Branch',
      address: 'Ferozepur Road',
      contact: '+923000000000',
      openingInfo: '9am - 6pm',
      status: 'active',
      country: 'Pakistan',
      province: 'Punjab',
      city: 'Lahore',
    });
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows a failed load as an error with Try again', async () => {
    mockFetchStoreById.mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValue(store);
    const props = makeProps('store-1');
    await renderWithQuery(<StoreDetailScreen {...props} />);
    expect(await screen.findByText("Couldn't load this store")).toBeTruthy();

    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByLabelText('Store name')).toBeTruthy();
  });

  it('asks before removing the store, then removes it', async () => {
    mockFetchStoreById.mockResolvedValue(store);
    mockDeleteStore.mockResolvedValue(undefined);
    const props = makeProps('store-1');
    await renderWithQuery(<StoreDetailScreen {...props} />);
    await screen.findByLabelText('Store name');

    await fireEvent.press(screen.getByRole('button', { name: 'Remove store' }));
    expect(await screen.findByText('Remove Main Branch?')).toBeTruthy();
    expect(mockDeleteStore).not.toHaveBeenCalled();

    await fireEvent.press(within(screen.getByLabelText('Remove Main Branch?')).getByRole('button', { name: 'Remove store' }));
    expect(mockDeleteStore).toHaveBeenCalledWith('store-1');
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows a save failure on the screen, not in an alert, and keeps the form', async () => {
    mockCreateStore.mockRejectedValue(new Error('Network request failed'));
    const props = makeProps();
    await renderWithQuery(<StoreDetailScreen {...props} />);
    await fireEvent.changeText(screen.getByLabelText('Store name'), 'Main Branch');
    await fireEvent.press(screen.getByRole('button', { name: 'Add store' }));

    expect(await screen.findByText("Couldn't save the store")).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(props.navigation.goBack).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Store name').props.value).toBe('Main Branch');
  });
});
