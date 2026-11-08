import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../testUtils/renderWithProviders';
import { queryKeys } from '../../hooks/keys';
import { StockItemSheet } from './StockItemSheet';
import { useAuthStore } from '../../state/authStore';
import { createInventoryItem, fetchDealerListings, updateInventoryItem } from '../services/inventoryService';
import type { InventoryItemWithListing } from '../types/dealer';

jest.mock('../services/inventoryService', () => ({
  fetchDealerListings: jest.fn(),
  createInventoryItem: jest.fn(),
  updateInventoryItem: jest.fn(),
}));

const mockFetchListings = fetchDealerListings as jest.Mock;
const mockCreate = createInventoryItem as jest.Mock;
const mockUpdate = updateInventoryItem as jest.Mock;

const item: InventoryItemWithListing = {
  id: 'inv-1',
  dealer_id: 'dealer-1',
  listing_id: 'l1',
  stock_quantity: 20,
  unit: 'bag',
  purchase_cost: 400,
  selling_price: 500,
  min_stock_threshold: 5,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  listing: { id: 'l1', title: 'DAP Fertilizer' },
};

async function renderSheet(props: Partial<React.ComponentProps<typeof StockItemSheet>> = {}) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.referenceData.units(), [
    { id: 'u1', code: 'bag', label: 'Bag', applies_to: 'quantity' },
    { id: 'u2', code: 'kg', label: 'Kilogram', applies_to: 'weight' },
  ]);
  const onClose = jest.fn();
  const onRemove = jest.fn();
  await renderWithQuery(<StockItemSheet item={null} onClose={onClose} onRemove={onRemove} {...props} />, queryClient);
  return { onClose, onRemove };
}

beforeEach(() => {
  mockFetchListings.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockFetchListings.mockResolvedValue([{ id: 'l1', title: 'DAP Fertilizer' }]);
  useAuthStore.setState({ user: { id: 'dealer-1' } as never });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('StockItemSheet', () => {
  it('asks for a unit inline and sends nothing until one is chosen', async () => {
    const { onClose } = await renderSheet();
    await screen.findByText('Add stock item');
    await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));
    expect(await screen.findByText('Choose a unit')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('adds an item with a unit from the admin list, parsing numbers exactly', async () => {
    mockCreate.mockResolvedValue(item);
    const { onClose } = await renderSheet();
    await screen.findByText('Add stock item');

    await fireEvent.press(screen.getByRole('button', { name: /^Unit/ }));
    await fireEvent.press(await screen.findByText('Bag'));
    await fireEvent.changeText(screen.getByLabelText('Opening stock'), '20');
    await fireEvent.changeText(screen.getByLabelText('Selling price'), '9800.50');
    await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));

    expect(mockCreate).toHaveBeenCalledWith({
      listingId: null,
      unit: 'bag',
      purchaseCost: null,
      sellingPrice: 9800.5,
      minStockThreshold: 0,
      stockQuantity: 20,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('flags a typo in a number instead of turning it into zero', async () => {
    await renderSheet({ item });
    await screen.findByText('Edit DAP Fertilizer');
    await fireEvent.changeText(screen.getByLabelText('Low-stock level'), '5x');
    await fireEvent.changeText(screen.getByLabelText('Selling price'), '12,5');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Enter a whole number, like 5')).toBeTruthy();
    expect(screen.getAllByText('Enter an amount, like 9800').length).toBeGreaterThan(0);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('prefills an edit, shows the price with Rs and the unit, and saves the changes', async () => {
    mockUpdate.mockResolvedValue(item);
    const { onClose } = await renderSheet({ item });
    await screen.findByText('Edit DAP Fertilizer');
    expect(screen.getByLabelText('Selling price').props.value).toBe('500');
    expect(screen.getAllByText('Rs').length).toBe(2);
    expect(screen.getAllByText('per bag').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Opening stock')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(mockUpdate).toHaveBeenCalledWith('inv-1', {
      listingId: 'l1',
      unit: 'bag',
      purchaseCost: 400,
      sellingPrice: 500,
      minStockThreshold: 5,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a save failure in the sheet with the typed values kept, never in an alert', async () => {
    mockUpdate.mockRejectedValue(new Error('Network request failed'));
    const { onClose } = await renderSheet({ item });
    await screen.findByText('Edit DAP Fertilizer');
    await fireEvent.changeText(screen.getByLabelText('Selling price'), '650');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText("Couldn't save the changes")).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Selling price').props.value).toBe('650');
  });

  it('hands off to the screen to confirm when the person chooses Remove item', async () => {
    const { onRemove } = await renderSheet({ item });
    await screen.findByText('Edit DAP Fertilizer');
    await fireEvent.press(screen.getByRole('button', { name: 'Remove item' }));
    expect(onRemove).toHaveBeenCalledWith(item);
  });
});
