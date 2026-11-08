import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { StoreListScreen } from './StoreListScreen';
import { fetchStores } from '../services/storeService';
import { useAuthStore } from '../../state/authStore';
import { HOME_ROUTES } from '../../common/constants/routes';
import type { DealerStore } from '../types/dealer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

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

jest.mock('../services/storeService', () => ({
  fetchStores: jest.fn(),
}));

const mockFetchStores = fetchStores as jest.Mock;

const store = (overrides: Partial<DealerStore> = {}): DealerStore => ({
  id: 'store-1',
  dealer_id: 'dealer-1',
  name: 'Main Branch',
  address: 'Ferozepur Road',
  location: null,
  contact: '0300-0000000',
  opening_info: null,
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as HomeScreenProps<'Stores'>['navigation'];
}

beforeEach(() => {
  mockFetchStores.mockReset();
  useAuthStore.setState({ user: { id: 'dealer-1' } as never });
});

describe('StoreListScreen', () => {
  it('shows an empty state when there are no stores', async () => {
    mockFetchStores.mockResolvedValue([]);
    await renderWithQuery(<StoreListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText('No stores yet')).toBeTruthy();
  });

  it('lists stores with their address, falling back when unset', async () => {
    mockFetchStores.mockResolvedValue([
      store(),
      store({ id: 'store-2', name: 'Warehouse', status: 'inactive', address: null }),
    ]);
    await renderWithQuery(<StoreListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText('Main Branch')).toBeTruthy();
    expect(screen.getByText('Ferozepur Road')).toBeTruthy();
    expect(screen.getByText('Warehouse')).toBeTruthy();
    expect(screen.getByText('No address set')).toBeTruthy();
  });

  it('shows each store as Active or Inactive from the status vocabulary, not the raw value', async () => {
    mockFetchStores.mockResolvedValue([store(), store({ id: 'store-2', name: 'Warehouse', status: 'inactive' })]);
    await renderWithQuery(<StoreListScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Main Branch');
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
    expect(screen.queryByText('active')).toBeNull();
  });

  it('finds a store by name', async () => {
    mockFetchStores.mockResolvedValue([store(), store({ id: 'store-2', name: 'Warehouse' })]);
    await renderWithQuery(<StoreListScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Main Branch');
    await fireEvent.changeText(screen.getByLabelText('Find a store'), 'ware');
    expect(screen.getByText('Warehouse')).toBeTruthy();
    expect(screen.queryByText('Main Branch')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Find a store'), 'zzz');
    expect(screen.getByText('No stores match')).toBeTruthy();
  });

  it('shows a failed load as an error with Try again, never as "No stores yet"', async () => {
    mockFetchStores.mockRejectedValue(new Error('Network request failed'));
    await renderWithQuery(<StoreListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText("Couldn't load your stores")).toBeTruthy();
    expect(screen.queryByText('No stores yet')).toBeNull();

    mockFetchStores.mockResolvedValue([]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('No stores yet')).toBeTruthy();
  });

  it('navigates to a store detail on row press and to a new store from the sticky Add store button', async () => {
    mockFetchStores.mockResolvedValue([store()]);
    const navigation = makeNavigation();
    await renderWithQuery(<StoreListScreen navigation={navigation} route={{} as never} />);
    await screen.findByText('Main Branch');

    await fireEvent.press(screen.getByText('Main Branch'));
    expect(navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.StoreDetail, { storeId: 'store-1' });

    await fireEvent.press(screen.getByRole('button', { name: 'Add store' }));
    expect(navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.StoreDetail, {});
  });
});
