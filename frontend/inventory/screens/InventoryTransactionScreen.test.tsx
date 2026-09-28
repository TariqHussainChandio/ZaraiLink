import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { InventoryTransactionScreen } from './InventoryTransactionScreen';
import {
  fetchInventoryById,
  fetchInventoryTransactions,
  adjustStock,
} from '../services/inventoryService';
import { useAuthStore } from '../../state/authStore';
import type { InventoryItemWithListing, InventoryTransaction } from '../types/dealer';
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

// Covers both this screen's own calls and the call made by the StockAdjustModal it mounts
// (adjustStock) — same module, one mock factory.
jest.mock('../services/inventoryService', () => ({
  fetchInventoryById: jest.fn(),
  fetchInventoryTransactions: jest.fn(),
  adjustStock: jest.fn(),
}));

const mockFetchInventoryById = fetchInventoryById as jest.Mock;
const mockFetchInventoryTransactions = fetchInventoryTransactions as jest.Mock;
const mockAdjustStock = adjustStock as jest.Mock;

const invItem: InventoryItemWithListing = {
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

const tx = (overrides: Partial<InventoryTransaction> = {}): InventoryTransaction => ({
  id: 'tx-1',
  inventory_id: 'inv-1',
  type: 'restock',
  quantity: 10,
  actor: 'dealer-1',
  notes: null,
  created_at: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

function makeProps() {
  return {
    navigation: {} as never,
    route: { params: { inventoryId: 'inv-1' } },
  } as unknown as HomeScreenProps<'InventoryTransactions'>;
}

beforeEach(() => {
  mockFetchInventoryById.mockReset();
  mockFetchInventoryTransactions.mockReset();
  mockAdjustStock.mockReset();
  useAuthStore.setState({ user: { id: 'dealer-1' } as never });
});

describe('InventoryTransactionScreen', () => {
  it('renders the stock summary and transaction history', async () => {
    mockFetchInventoryById.mockResolvedValue(invItem);
    mockFetchInventoryTransactions.mockResolvedValue([tx({ notes: 'Weekly restock' })]);
    await renderWithQuery(<InventoryTransactionScreen {...makeProps()} />);

    expect(await screen.findByText('DAP Fertilizer')).toBeTruthy();
    expect(screen.getByText('20 bag currently in stock')).toBeTruthy();
    expect(screen.getByText('Restock')).toBeTruthy();
    expect(screen.getByText('+10 bag')).toBeTruthy();
    expect(screen.getByText('Weekly restock')).toBeTruthy();
  });

  it('shows an empty state when there are no transactions', async () => {
    mockFetchInventoryById.mockResolvedValue(invItem);
    mockFetchInventoryTransactions.mockResolvedValue([]);
    await renderWithQuery(<InventoryTransactionScreen {...makeProps()} />);
    expect(await screen.findByText('No stock movements yet')).toBeTruthy();
  });

  it('shows an error state with retry when loading fails', async () => {
    mockFetchInventoryById.mockRejectedValueOnce(new Error('network down')).mockResolvedValue(invItem);
    mockFetchInventoryTransactions.mockResolvedValue([]);
    await renderWithQuery(<InventoryTransactionScreen {...makeProps()} />);
    expect(await screen.findByText("Couldn't load stock history")).toBeTruthy();

    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('DAP Fertilizer')).toBeTruthy();
  });

  it('records a stock movement through the adjust modal', async () => {
    mockFetchInventoryById.mockResolvedValue(invItem);
    mockFetchInventoryTransactions.mockResolvedValue([]);
    mockAdjustStock.mockResolvedValue(invItem);
    await renderWithQuery(<InventoryTransactionScreen {...makeProps()} />);
    await screen.findByText('DAP Fertilizer');

    await fireEvent.press(screen.getByText('Record Stock Movement'));
    await fireEvent.changeText(screen.getByTestId('stock-adjust-quantity'), '15');
    await fireEvent.press(screen.getByText('Save'));

    expect(mockAdjustStock).toHaveBeenCalledWith('inv-1', 'addition', 15, null);
  });
});
