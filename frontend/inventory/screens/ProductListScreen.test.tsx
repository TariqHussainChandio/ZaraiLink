import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, type MockedInventoryApi } from '../testUtils/api';
import { apiError, product, screenProps, signInApprovedDealer } from '../testUtils/fixtures';
import { INVENTORY_ROUTES } from '../types/navigation';
import { ProductListScreen } from './ProductListScreen';

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;
const navigate = jest.fn();

async function renderList() {
  await renderWithProviders(<ProductListScreen {...screenProps<typeof INVENTORY_ROUTES.Products>(undefined, { navigate })} />);
}

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  await signInApprovedDealer();
});

describe('ProductListScreen', () => {
  it('lists each product with its SKU, total stock and status, inactive ones marked', async () => {
    api.fetchProducts.mockResolvedValue([
      product(),
      product({ id: 'p2', name: 'DAP 50kg', sku: 'DAP-50', total_quantity: 3, default_location_quantity: 3, reorder_threshold: 5 }),
      product({ id: 'p3', name: 'Zinc', sku: 'ZN-1', total_quantity: 0, default_location_quantity: 0 }),
      product({ id: 'p4', name: 'Old seed', sku: 'OLD', is_active: false }),
    ]);
    await renderList();
    expect(await screen.findByText('UREA-50 · 20 bag at default · 20 in total')).toBeTruthy();
    expect(screen.getByText('In stock')).toBeTruthy();
    expect(screen.getByText('Low stock')).toBeTruthy();
    expect(screen.getByText('Out of stock')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
    // Inactive products are asked for, so the dealer can find and reactivate them.
    expect(api.fetchProducts).toHaveBeenCalledWith(true);
  });

  // B4 verification F3: the header counted a product as needing attention while the list said "In stock". The badge
  // now goes by the default location, as the alerts do, with the total beside it.
  it('judges a product by its default-location stock, as the alerts do, and shows the total beside it', async () => {
    api.fetchProducts.mockResolvedValue([product({ total_quantity: 20, default_location_quantity: 0 })]);
    await renderList();
    expect(await screen.findByText('UREA-50 · 0 bag at default · 20 in total')).toBeTruthy();
    expect(screen.getByText('Out of stock')).toBeTruthy();
    expect(screen.queryByText('In stock')).toBeNull();
  });

  it('searches by name or SKU, and says when nothing matches', async () => {
    api.fetchProducts.mockResolvedValue([product(), product({ id: 'p2', name: 'DAP 50kg', sku: 'DAP-50' })]);
    await renderList();
    await screen.findByText('Urea 50kg');
    await fireEvent.changeText(screen.getByLabelText('Search products'), 'dap-5');
    expect(screen.queryByText('Urea 50kg')).toBeNull();
    expect(screen.getByText('DAP 50kg')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search products'), 'potash');
    expect(screen.getByText('No product matches')).toBeTruthy();
  });

  it('invites the first product when there are none', async () => {
    api.fetchProducts.mockResolvedValue([]);
    await renderList();
    expect(await screen.findByText('No products yet')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add product'));
    expect(navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.ProductForm, {});
  });

  it('opens a product', async () => {
    await renderList();
    await fireEvent.press(await screen.findByText('Urea 50kg'));
    expect(navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.ProductDetail, { productId: 'prod-urea' });
  });

  it('shows the error with Retry, keeping the search box', async () => {
    api.fetchProducts.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderList();
    expect(await screen.findByText("Couldn't load your products")).toBeTruthy();
    expect(screen.getByLabelText('Search products')).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Urea 50kg')).toBeTruthy();
  });
});
