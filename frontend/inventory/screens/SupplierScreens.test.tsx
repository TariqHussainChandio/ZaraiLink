import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, lastByText, type MockedInventoryApi } from '../testUtils/api';
import { apiError, screenProps, signInApprovedDealer, supplier } from '../testUtils/fixtures';
import { INVENTORY_ROUTES } from '../types/navigation';
import { SupplierFormScreen } from './SupplierFormScreen';
import { SupplierListScreen } from './SupplierListScreen';

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;
const navigation = { navigate: jest.fn(), goBack: jest.fn() };

async function renderList() {
  await renderWithProviders(<SupplierListScreen {...screenProps<typeof INVENTORY_ROUTES.Suppliers>(undefined, navigation)} />);
}

async function renderForm(supplierId?: string) {
  await renderWithProviders(
    <SupplierFormScreen {...screenProps<typeof INVENTORY_ROUTES.SupplierForm>({ supplierId }, navigation)} />,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  await signInApprovedDealer();
});

describe('SupplierListScreen', () => {
  it('lists suppliers with contact and products, inactive ones marked', async () => {
    api.fetchSuppliers.mockResolvedValue([supplier(), supplier({ id: 'sup-2', name: 'Fauji', contact: null, products_supplied: null, is_active: false })]);
    await renderList();
    expect(await screen.findByText('0300 1234567 · Urea, DAP')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
    await fireEvent.press(screen.getByText('Fauji'));
    expect(navigation.navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.SupplierForm, { supplierId: 'sup-2' });
  });

  it('invites the first supplier', async () => {
    api.fetchSuppliers.mockResolvedValue([]);
    await renderList();
    expect(await screen.findByText('No suppliers yet')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add supplier'));
    expect(navigation.navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.SupplierForm, {});
  });

  it('shows a failed load with Retry', async () => {
    api.fetchSuppliers.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderList();
    expect(await screen.findByText("Couldn't load your suppliers")).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Engro Fertilizers')).toBeTruthy();
  });
});

describe('SupplierFormScreen', () => {
  it('adds a supplier, empty fields sent as null', async () => {
    api.createSupplier.mockResolvedValue(supplier({ id: 'sup-new' }));
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Supplier name'), 'Fatima Fertilizer');
    await fireEvent.changeText(screen.getByLabelText('Contact'), '0301 7654321');
    await fireEvent.press(screen.getByText('Add supplier'));
    await waitFor(() =>
      expect(api.createSupplier).toHaveBeenCalledWith({
        name: 'Fatima Fertilizer',
        contact: '0301 7654321',
        products_supplied: null,
        notes: null,
        is_active: true,
      }),
    );
    expect(await screen.findByText('Supplier saved')).toBeTruthy();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('validates the name and the API’s length caps', async () => {
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Contact'), '1'.repeat(121));
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'n'.repeat(1001));
    await fireEvent.press(screen.getByText('Add supplier'));
    expect(await screen.findByText('Enter the supplier’s name')).toBeTruthy();
    expect(screen.getByText('Use at most 120 characters')).toBeTruthy();
    expect(screen.getByText('Use at most 1000 characters')).toBeTruthy();
    expect(api.createSupplier).not.toHaveBeenCalled();
  });

  it('edits a supplier from its saved values, and can mark it inactive', async () => {
    api.updateSupplier.mockResolvedValue(supplier({ is_active: false }));
    await renderForm('sup-1');
    expect(await screen.findByDisplayValue('Engro Fertilizers')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Status, Active' }));
    await fireEvent.press(await screen.findByText('Inactive'));
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(api.updateSupplier).toHaveBeenCalledWith('sup-1', expect.objectContaining({ is_active: false })));
  });

  it('removes a supplier only after the sheet confirms, and shows a refusal', async () => {
    api.removeSupplier.mockRejectedValue(apiError(503, 'service_unavailable', 'down'));
    await renderForm('sup-1');
    await fireEvent.press(await screen.findByText('Remove supplier'));
    await fireEvent.press(lastByText('Remove supplier'));
    await waitFor(() => expect(api.removeSupplier).toHaveBeenCalledWith('sup-1'));
    expect(await screen.findByText('The service is not available right now. Please try again shortly.')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
