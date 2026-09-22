import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../localization';
import { StoreDetailScreen } from './StoreDetailScreen';
import {
  createStore,
  deleteStore,
  fetchStoreById,
  updateStore,
} from '../../services/modules/dealer/storeService';
import { useAuthStore } from '../../store/authStore';
import type { DealerStore } from '../../types/dealer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

jest.mock('../../services/modules/dealer/storeService', () => ({
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
  contact: '0300-0000000',
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
  it('creates a new store from the form', async () => {
    mockCreateStore.mockResolvedValue(store);
    const props = makeProps();
    await render(<StoreDetailScreen {...props} />);

    await fireEvent.changeText(screen.getByLabelText('Store name'), 'Main Branch');
    await fireEvent.press(screen.getByText('Save Store'));

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
    await render(<StoreDetailScreen {...props} />);
    await fireEvent.press(screen.getByText('Save Store'));
    expect(await screen.findByText('Enter a store name')).toBeTruthy();
    expect(mockCreateStore).not.toHaveBeenCalled();
  });

  it('loads and prefills an existing store, then saves changes', async () => {
    mockFetchStoreById.mockResolvedValue(store);
    mockUpdateStore.mockResolvedValue(store);
    const props = makeProps('store-1');
    await render(<StoreDetailScreen {...props} />);

    expect(await screen.findByLabelText('Store name')).toBeTruthy();
    expect(screen.getByLabelText('Store name').props.value).toBe('Main Branch');

    await fireEvent.press(screen.getByText('Save Store'));
    expect(mockUpdateStore).toHaveBeenCalledWith('store-1', {
      name: 'Main Branch',
      address: 'Ferozepur Road',
      contact: '0300-0000000',
      openingInfo: '9am - 6pm',
      status: 'active',
      country: 'Pakistan',
      province: 'Punjab',
      city: 'Lahore',
    });
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows an error state with retry when the store fails to load', async () => {
    mockFetchStoreById.mockRejectedValueOnce(new Error('network down')).mockResolvedValue(store);
    const props = makeProps('store-1');
    await render(<StoreDetailScreen {...props} />);
    expect(await screen.findByText("Couldn't load this store")).toBeTruthy();

    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByLabelText('Store name')).toBeTruthy();
  });

  it('deletes the store after confirming the alert', async () => {
    mockFetchStoreById.mockResolvedValue(store);
    mockDeleteStore.mockResolvedValue(undefined);
    (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
      buttons?.find((b: { text: string }) => b.text === 'Delete')?.onPress?.();
    });
    const props = makeProps('store-1');
    await render(<StoreDetailScreen {...props} />);
    await screen.findByLabelText('Store name');

    await fireEvent.press(screen.getByText('Delete Store'));
    expect(mockDeleteStore).toHaveBeenCalledWith('store-1');
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows a failure alert when saving rejects', async () => {
    mockCreateStore.mockRejectedValue(new Error('Name already taken'));
    const props = makeProps();
    await render(<StoreDetailScreen {...props} />);
    await fireEvent.changeText(screen.getByLabelText('Store name'), 'Main Branch');
    await fireEvent.press(screen.getByText('Save Store'));

    expect(Alert.alert).toHaveBeenCalledWith('Failed to save store', 'Name already taken');
  });
});
