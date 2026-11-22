import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { useNetworkStore } from '../../state/networkStore';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, lastByText, type MockedInventoryApi } from '../testUtils/api';
import { apiError, product, screenProps, signInApprovedDealer } from '../testUtils/fixtures';
import { INVENTORY_ROUTES } from '../types/navigation';
import { ProductFormScreen } from './ProductFormScreen';

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;
const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), popToTop: jest.fn() };

async function renderForm(productId?: string) {
  await renderWithProviders(
    <ProductFormScreen {...screenProps<typeof INVENTORY_ROUTES.ProductForm>({ productId }, navigation)} />,
  );
}

async function fillNew(overrides: Partial<Record<string, string>> = {}) {
  const values = { name: 'Potash 50kg', sku: 'SOP-50', unit: 'bag', cost: '2900.5', threshold: '4', ...overrides };
  await fireEvent.changeText(screen.getByLabelText('Product name'), values.name);
  await fireEvent.changeText(screen.getByLabelText('SKU'), values.sku);
  await fireEvent.changeText(screen.getByLabelText('Unit'), values.unit);
  await fireEvent.changeText(screen.getByLabelText('Cost price'), values.cost);
  await fireEvent.changeText(screen.getByLabelText('Reorder threshold'), values.threshold);
}

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  await signInApprovedDealer();
});

describe('ProductFormScreen', () => {
  it('adds a product, sends numbers and nulls as the API wants, then opens it', async () => {
    api.createProduct.mockResolvedValue(product({ id: 'prod-new' }));
    await renderForm();
    await fillNew();
    await fireEvent.press(screen.getByText('Add product'));
    await waitFor(() =>
      expect(api.createProduct).toHaveBeenCalledWith({
        name: 'Potash 50kg',
        sku: 'SOP-50',
        unit: 'bag',
        cost_price: 2900.5,
        selling_price: null,
        reorder_threshold: 4,
        is_active: true,
      }),
    );
    expect(await screen.findByText('Product added')).toBeTruthy();
    expect(navigation.replace).toHaveBeenCalledWith(INVENTORY_ROUTES.ProductDetail, { productId: 'prod-new' });
  });

  it('refuses a third decimal and a non-number before sending', async () => {
    await renderForm();
    await fillNew({ cost: '12.345', threshold: 'ten' });
    await fireEvent.press(screen.getByText('Add product'));
    expect(await screen.findAllByText('Enter a number, such as 12 or 12.5 (at most two decimals)')).toHaveLength(2);
    expect(api.createProduct).not.toHaveBeenCalled();
  });

  it('refuses a name or SKU over 120 characters and a unit over 40, as the API caps them', async () => {
    await renderForm();
    await fillNew({ name: 'n'.repeat(121), sku: 's'.repeat(121), unit: 'u'.repeat(41) });
    await fireEvent.press(screen.getByText('Add product'));
    expect(await screen.findAllByText('Use at most 120 characters')).toHaveLength(2);
    expect(screen.getByText('Use at most 40 characters')).toBeTruthy();
    expect(api.createProduct).not.toHaveBeenCalled();
  });

  it('asks for the required fields', async () => {
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Unit'), '');
    await fireEvent.press(screen.getByText('Add product'));
    expect(await screen.findByText('Enter the product name')).toBeTruthy();
    expect(screen.getByText('Enter a SKU or code for this product')).toBeTruthy();
    expect(screen.getByText('Enter the unit you count it in, such as bag or kg')).toBeTruthy();
  });

  it('shows a duplicate SKU (409) and a server field error in plain words', async () => {
    api.createProduct.mockRejectedValueOnce(apiError(409, 'conflict', 'This already exists'));
    await renderForm();
    await fillNew();
    await fireEvent.press(screen.getByText('Add product'));
    expect(await screen.findByText('This already exists')).toBeTruthy();

    api.createProduct.mockRejectedValueOnce(
      apiError(422, 'validation_failed', 'Validation failed', [
        { loc: ['body', 'selling_price'], msg: 'Value error, Use at most two decimals' },
      ]),
    );
    await fireEvent.press(screen.getByText('Add product'));
    expect(await screen.findByText('Selling price: Use at most two decimals')).toBeTruthy();
  });

  it('says so offline and saves nothing', async () => {
    useNetworkStore.getState().setOffline(true);
    await renderForm();
    await fillNew();
    await fireEvent.press(screen.getByText('Add product'));
    expect(await screen.findByText("You're offline — this change wasn't saved.")).toBeTruthy();
    expect(api.createProduct).not.toHaveBeenCalled();
    useNetworkStore.getState().setOffline(false);
  });

  it('edits a product from its saved values and goes back', async () => {
    api.updateProduct.mockResolvedValue(product({ name: 'Urea 50kg (Sona)' }));
    await renderForm('prod-urea');
    expect(await screen.findByDisplayValue('Urea 50kg')).toBeTruthy();
    expect(screen.getByDisplayValue('3200')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Product name'), 'Urea 50kg (Sona)');
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() =>
      expect(api.updateProduct).toHaveBeenCalledWith('prod-urea', expect.objectContaining({ name: 'Urea 50kg (Sona)' })),
    );
    expect(await screen.findByText('Product saved')).toBeTruthy();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('removes a product only after the sheet confirms', async () => {
    api.removeProduct.mockResolvedValue(undefined);
    await renderForm('prod-urea');
    await fireEvent.press(await screen.findByText('Remove product'));
    expect(screen.getByText('Remove this product?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Not now'));
    expect(api.removeProduct).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Remove product'));
    await fireEvent.press(lastByText('Remove product'));
    await waitFor(() => expect(api.removeProduct).toHaveBeenCalledWith('prod-urea'));
    expect(await screen.findByText('Product removed')).toBeTruthy();
    expect(navigation.popToTop).toHaveBeenCalled();
  });

  it('shows a product that could not load', async () => {
    api.fetchProduct.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderForm('prod-urea');
    expect(await screen.findByText("Couldn't load this product")).toBeTruthy();
  });
});
