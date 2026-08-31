import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SupplierDetailScreen } from './SupplierDetailScreen';
import {
  createSupplier,
  deleteSupplier,
  fetchSupplierById,
  updateSupplier,
} from '../../services/modules/dealer/supplierService';
import { useAuthStore } from '../../store/authStore';
import type { Supplier } from '../../types/dealer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

jest.mock('../../services/modules/dealer/supplierService', () => ({
  createSupplier: jest.fn(),
  deleteSupplier: jest.fn(),
  fetchSupplierById: jest.fn(),
  updateSupplier: jest.fn(),
}));

const mockCreateSupplier = createSupplier as jest.Mock;
const mockDeleteSupplier = deleteSupplier as jest.Mock;
const mockFetchSupplierById = fetchSupplierById as jest.Mock;
const mockUpdateSupplier = updateSupplier as jest.Mock;

const supplier: Supplier = {
  id: 'sup-1',
  dealer_id: 'dealer-1',
  name: 'AgriChem Traders',
  contact: '0300-1111111',
  products_supplied: 'Fertilizers, Pesticides',
  notes: 'Reliable, weekly delivery',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function makeProps(supplierId?: string) {
  return {
    navigation: { goBack: jest.fn() },
    route: { params: supplierId ? { supplierId } : {} },
  } as unknown as HomeScreenProps<'SupplierDetail'>;
}

beforeEach(() => {
  mockCreateSupplier.mockReset();
  mockDeleteSupplier.mockReset();
  mockFetchSupplierById.mockReset();
  mockUpdateSupplier.mockReset();
  useAuthStore.setState({ user: { id: 'dealer-1' } as never });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SupplierDetailScreen', () => {
  it('creates a new supplier from the form', async () => {
    mockCreateSupplier.mockResolvedValue(supplier);
    const props = makeProps();
    await render(<SupplierDetailScreen {...props} />);

    await fireEvent.changeText(screen.getByLabelText('Supplier name'), 'AgriChem Traders');
    await fireEvent.press(screen.getByText('Save Supplier'));

    expect(mockCreateSupplier).toHaveBeenCalledWith({
      name: 'AgriChem Traders',
      contact: null,
      productsSupplied: null,
      notes: null,
      status: 'active',
    });
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows a validation error when the name is missing', async () => {
    const props = makeProps();
    await render(<SupplierDetailScreen {...props} />);
    await fireEvent.press(screen.getByText('Save Supplier'));
    expect(await screen.findByText('Enter a supplier name')).toBeTruthy();
    expect(mockCreateSupplier).not.toHaveBeenCalled();
  });

  it('loads and prefills an existing supplier, then saves changes', async () => {
    mockFetchSupplierById.mockResolvedValue(supplier);
    mockUpdateSupplier.mockResolvedValue(supplier);
    const props = makeProps('sup-1');
    await render(<SupplierDetailScreen {...props} />);

    expect(await screen.findByLabelText('Supplier name')).toBeTruthy();
    expect(screen.getByLabelText('Supplier name').props.value).toBe('AgriChem Traders');

    await fireEvent.press(screen.getByText('Save Supplier'));
    expect(mockUpdateSupplier).toHaveBeenCalledWith('sup-1', {
      name: 'AgriChem Traders',
      contact: '0300-1111111',
      productsSupplied: 'Fertilizers, Pesticides',
      notes: 'Reliable, weekly delivery',
      status: 'active',
    });
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows an error state with retry when the supplier fails to load', async () => {
    mockFetchSupplierById.mockRejectedValueOnce(new Error('network down')).mockResolvedValue(supplier);
    const props = makeProps('sup-1');
    await render(<SupplierDetailScreen {...props} />);
    expect(await screen.findByText("Couldn't load this supplier")).toBeTruthy();

    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByLabelText('Supplier name')).toBeTruthy();
  });

  it('deletes the supplier after confirming the alert', async () => {
    mockFetchSupplierById.mockResolvedValue(supplier);
    mockDeleteSupplier.mockResolvedValue(undefined);
    (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
      buttons?.find((b: { text: string }) => b.text === 'Delete')?.onPress?.();
    });
    const props = makeProps('sup-1');
    await render(<SupplierDetailScreen {...props} />);
    await screen.findByLabelText('Supplier name');

    await fireEvent.press(screen.getByText('Delete Supplier'));
    expect(mockDeleteSupplier).toHaveBeenCalledWith('sup-1');
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows a failure alert when saving rejects', async () => {
    mockCreateSupplier.mockRejectedValue(new Error('Name already taken'));
    const props = makeProps();
    await render(<SupplierDetailScreen {...props} />);
    await fireEvent.changeText(screen.getByLabelText('Supplier name'), 'AgriChem Traders');
    await fireEvent.press(screen.getByText('Save Supplier'));

    expect(Alert.alert).toHaveBeenCalledWith('Failed to save supplier', 'Name already taken');
  });
});
