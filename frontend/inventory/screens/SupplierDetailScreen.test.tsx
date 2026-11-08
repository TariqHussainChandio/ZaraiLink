import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { SupplierDetailScreen } from './SupplierDetailScreen';
import { createSupplier, deleteSupplier, fetchSupplierById, updateSupplier } from '../services/supplierService';
import { useAuthStore } from '../../state/authStore';
import type { Supplier } from '../types/dealer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

jest.mock('../services/supplierService', () => ({
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
  contact: '+923001111111',
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
  it('adds a new supplier from the form', async () => {
    mockCreateSupplier.mockResolvedValue(supplier);
    const props = makeProps();
    await renderWithQuery(<SupplierDetailScreen {...props} />);

    await fireEvent.changeText(screen.getByLabelText('Supplier name'), 'AgriChem Traders');
    await fireEvent.press(screen.getByRole('button', { name: 'Add supplier' }));

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
    await renderWithQuery(<SupplierDetailScreen {...props} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add supplier' }));
    expect(await screen.findByText('Enter a supplier name')).toBeTruthy();
    expect(mockCreateSupplier).not.toHaveBeenCalled();
  });

  it('takes the contact as a phone number and stores it as E.164', async () => {
    mockCreateSupplier.mockResolvedValue(supplier);
    await renderWithQuery(<SupplierDetailScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText('Supplier name'), 'AgriChem Traders');
    await fireEvent.changeText(screen.getByLabelText('Contact number'), '0300 1111111');
    await fireEvent.press(screen.getByRole('button', { name: 'Add supplier' }));
    expect(mockCreateSupplier).toHaveBeenCalledWith(expect.objectContaining({ contact: '+923001111111' }));
  });

  it('refuses a contact that is not a phone number, inline', async () => {
    await renderWithQuery(<SupplierDetailScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText('Supplier name'), 'AgriChem Traders');
    await fireEvent.changeText(screen.getByLabelText('Contact number'), 'call Ali');
    await fireEvent.press(screen.getByRole('button', { name: 'Add supplier' }));
    expect(await screen.findByText('Enter a phone number like 0300 1234567')).toBeTruthy();
    expect(mockCreateSupplier).not.toHaveBeenCalled();
  });

  it('loads and prefills an existing supplier, then saves changes', async () => {
    mockFetchSupplierById.mockResolvedValue(supplier);
    mockUpdateSupplier.mockResolvedValue(supplier);
    const props = makeProps('sup-1');
    await renderWithQuery(<SupplierDetailScreen {...props} />);

    expect(await screen.findByLabelText('Supplier name')).toBeTruthy();
    expect(screen.getByLabelText('Supplier name').props.value).toBe('AgriChem Traders');

    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(mockUpdateSupplier).toHaveBeenCalledWith('sup-1', {
      name: 'AgriChem Traders',
      contact: '+923001111111',
      productsSupplied: 'Fertilizers, Pesticides',
      notes: 'Reliable, weekly delivery',
      status: 'active',
    });
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows a failed load as an error with Try again', async () => {
    mockFetchSupplierById.mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValue(supplier);
    const props = makeProps('sup-1');
    await renderWithQuery(<SupplierDetailScreen {...props} />);
    expect(await screen.findByText("Couldn't load this supplier")).toBeTruthy();

    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByLabelText('Supplier name')).toBeTruthy();
  });

  it('asks before removing the supplier, then removes it', async () => {
    mockFetchSupplierById.mockResolvedValue(supplier);
    mockDeleteSupplier.mockResolvedValue(undefined);
    const props = makeProps('sup-1');
    await renderWithQuery(<SupplierDetailScreen {...props} />);
    await screen.findByLabelText('Supplier name');

    await fireEvent.press(screen.getByRole('button', { name: 'Remove supplier' }));
    expect(await screen.findByText('Remove AgriChem Traders?')).toBeTruthy();
    expect(mockDeleteSupplier).not.toHaveBeenCalled();

    await fireEvent.press(within(screen.getByLabelText('Remove AgriChem Traders?')).getByRole('button', { name: 'Remove supplier' }));
    expect(mockDeleteSupplier).toHaveBeenCalledWith('sup-1');
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows a save failure on the screen, not in an alert, and keeps the form', async () => {
    mockCreateSupplier.mockRejectedValue(new Error('Network request failed'));
    const props = makeProps();
    await renderWithQuery(<SupplierDetailScreen {...props} />);
    await fireEvent.changeText(screen.getByLabelText('Supplier name'), 'AgriChem Traders');
    await fireEvent.press(screen.getByRole('button', { name: 'Add supplier' }));

    expect(await screen.findByText("Couldn't save the supplier")).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(props.navigation.goBack).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Supplier name').props.value).toBe('AgriChem Traders');
  });
});
