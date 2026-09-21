import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../localization';
import { StoreListScreen } from './StoreListScreen';
import { fetchStores } from '../../services/modules/dealer/storeService';
import { useAuthStore } from '../../store/authStore';
import { HOME_ROUTES } from '../../constants/routes';
import type { DealerStore } from '../../types/dealer';
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

jest.mock('../../services/modules/dealer/storeService', () => ({
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
    await render(<StoreListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText('No stores yet')).toBeTruthy();
  });

  it('lists stores with their address, falling back when unset', async () => {
    mockFetchStores.mockResolvedValue([
      store(),
      store({ id: 'store-2', name: 'Warehouse', status: 'inactive', address: null }),
    ]);
    await render(<StoreListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText('Main Branch')).toBeTruthy();
    expect(screen.getByText('Ferozepur Road')).toBeTruthy();
    expect(screen.getByText('Warehouse')).toBeTruthy();
    expect(screen.getByText('No address set')).toBeTruthy();
  });

  it('shows an error state with retry when stores fail to load', async () => {
    mockFetchStores.mockRejectedValue(new Error('network down'));
    await render(<StoreListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText("Couldn't load stores")).toBeTruthy();

    mockFetchStores.mockResolvedValue([]);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('No stores yet')).toBeTruthy();
  });

  it('navigates to a store detail on row press and to a new store on FAB press', async () => {
    mockFetchStores.mockResolvedValue([store()]);
    const navigation = makeNavigation();
    await render(<StoreListScreen navigation={navigation} route={{} as never} />);
    await screen.findByText('Main Branch');

    await fireEvent.press(screen.getByText('Main Branch'));
    expect(navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.StoreDetail, { storeId: 'store-1' });

    await fireEvent.press(screen.getByText('+ New Store'));
    expect(navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.StoreDetail, {});
  });
});
