import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, type MockedInventoryApi } from '../testUtils/api';
import { apiError, product, screenProps, signInApprovedDealer, stockLevel } from '../testUtils/fixtures';
import { INVENTORY_ROUTES } from '../types/navigation';
import { StockScreen } from './StockScreen';

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;
const navigate = jest.fn();

async function renderStock() {
  await renderWithProviders(<StockScreen {...screenProps<typeof INVENTORY_ROUTES.Stock>(undefined, { navigate })} />);
}

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  await signInApprovedDealer();
});

describe('StockScreen', () => {
  it('lists the stock at the chosen location, sorted by product name, with each status', async () => {
    api.fetchProducts.mockResolvedValue([product(), product({ id: 'p-dap', name: 'DAP 50kg', sku: 'DAP-50', reorder_threshold: 5 })]);
    api.fetchStock.mockResolvedValue([stockLevel(), stockLevel({ product_id: 'p-dap', quantity: 0 })]);
    await renderStock();
    expect(await screen.findByText('Stock at Main shop')).toBeTruthy();
    expect(await screen.findByText('DAP 50kg')).toBeTruthy();
    expect(screen.getByText('Out of stock')).toBeTruthy();
    expect(screen.getByText('20 bag')).toBeTruthy();
    expect(api.fetchStock).toHaveBeenCalledWith({ locationId: 'loc-shop' });
    const names = screen.getAllByText(/^(DAP|Urea) 50kg$/).map(node => node.props.children);
    expect(names).toEqual(['DAP 50kg', 'Urea 50kg']);
  });

  it('says when nothing is stocked here yet', async () => {
    api.fetchStock.mockResolvedValue([]);
    await renderStock();
    expect(await screen.findByText('Nothing stocked here yet')).toBeTruthy();
  });

  it('asks for a location first when the dealer has none (rather than loading for ever)', async () => {
    api.fetchLocations.mockResolvedValue([]);
    await renderStock();
    expect(await screen.findByText('No location yet')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add location'));
    expect(navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.LocationForm, {});
    expect(api.fetchStock).not.toHaveBeenCalled();
  });

  it('shows the error with Retry', async () => {
    api.fetchStock.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderStock();
    expect(await screen.findByText("Couldn't load the stock")).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Urea 50kg')).toBeTruthy();
  });

  it('opens the operations and a product', async () => {
    await renderStock();
    await fireEvent.press(await screen.findByRole('button', { name: 'Transfer' }));
    expect(navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.Operation, { operation: 'transfer' });
    await fireEvent.press(await screen.findByText('Urea 50kg'));
    expect(navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.ProductDetail, { productId: 'prod-urea' });
  });
});
