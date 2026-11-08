import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { SupplierListScreen } from './SupplierListScreen';
import { fetchSuppliers } from '../services/supplierService';
import { useAuthStore } from '../../state/authStore';
import { HOME_ROUTES } from '../../common/constants/routes';
import type { Supplier } from '../types/dealer';
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

jest.mock('../services/supplierService', () => ({
  fetchSuppliers: jest.fn(),
}));

const mockFetchSuppliers = fetchSuppliers as jest.Mock;

const supplier = (overrides: Partial<Supplier> = {}): Supplier => ({
  id: 'sup-1',
  dealer_id: 'dealer-1',
  name: 'AgriChem Traders',
  contact: '0300-1111111',
  products_supplied: 'Fertilizers, Pesticides',
  notes: null,
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as HomeScreenProps<'Suppliers'>['navigation'];
}

beforeEach(() => {
  mockFetchSuppliers.mockReset();
  useAuthStore.setState({ user: { id: 'dealer-1' } as never });
});

describe('SupplierListScreen', () => {
  it('shows an empty state when there are no suppliers', async () => {
    mockFetchSuppliers.mockResolvedValue([]);
    await renderWithQuery(<SupplierListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText('No suppliers yet')).toBeTruthy();
  });

  it('lists suppliers with the products they supply, falling back when unset', async () => {
    mockFetchSuppliers.mockResolvedValue([
      supplier(),
      supplier({ id: 'sup-2', name: 'Green Fields', products_supplied: null }),
    ]);
    await renderWithQuery(<SupplierListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText('AgriChem Traders')).toBeTruthy();
    expect(screen.getByText('Fertilizers, Pesticides')).toBeTruthy();
    expect(screen.getByText('Green Fields')).toBeTruthy();
    expect(screen.getByText('No products listed')).toBeTruthy();
  });

  it('shows each supplier as Active or Inactive from the status vocabulary, not the raw value', async () => {
    mockFetchSuppliers.mockResolvedValue([supplier(), supplier({ id: 'sup-2', name: 'Green Fields', status: 'inactive' })]);
    await renderWithQuery(<SupplierListScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('AgriChem Traders');
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
    expect(screen.queryByText('active')).toBeNull();
  });

  it('finds a supplier by name', async () => {
    mockFetchSuppliers.mockResolvedValue([supplier(), supplier({ id: 'sup-2', name: 'Green Fields' })]);
    await renderWithQuery(<SupplierListScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('AgriChem Traders');
    await fireEvent.changeText(screen.getByLabelText('Find a supplier'), 'green');
    expect(screen.getByText('Green Fields')).toBeTruthy();
    expect(screen.queryByText('AgriChem Traders')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Find a supplier'), 'zzz');
    expect(screen.getByText('No suppliers match')).toBeTruthy();
  });

  it('shows a failed load as an error with Try again, never as "No suppliers yet"', async () => {
    mockFetchSuppliers.mockRejectedValue(new Error('Network request failed'));
    await renderWithQuery(<SupplierListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText("Couldn't load your suppliers")).toBeTruthy();
    expect(screen.queryByText('No suppliers yet')).toBeNull();

    mockFetchSuppliers.mockResolvedValue([]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('No suppliers yet')).toBeTruthy();
  });

  it('navigates to a supplier detail on row press and to a new supplier from the sticky Add supplier button', async () => {
    mockFetchSuppliers.mockResolvedValue([supplier()]);
    const navigation = makeNavigation();
    await renderWithQuery(<SupplierListScreen navigation={navigation} route={{} as never} />);
    await screen.findByText('AgriChem Traders');

    await fireEvent.press(screen.getByText('AgriChem Traders'));
    expect(navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.SupplierDetail, { supplierId: 'sup-1' });

    await fireEvent.press(screen.getByRole('button', { name: 'Add supplier' }));
    expect(navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.SupplierDetail, {});
  });
});
