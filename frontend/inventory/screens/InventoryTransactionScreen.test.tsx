import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { InventoryTransactionScreen } from './InventoryTransactionScreen';
import { fetchInventoryById, fetchInventoryTransactions, adjustStock } from '../services/inventoryService';
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

// One mock factory covers this screen's own calls and the call made by the Record stock sheet it opens.
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
  type: 'addition',
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
  it('shows the stock now and each movement with its signed change and the balance after it', async () => {
    mockFetchInventoryById.mockResolvedValue(invItem);
    // Newest first, as the API sends them: stock was 15, then 10 came in (25), then 5 went out (20).
    mockFetchInventoryTransactions.mockResolvedValue([
      tx({ id: 't2', type: 'reduction', quantity: -5, notes: 'Shop sale', created_at: '2026-01-03T00:00:00.000Z' }),
      tx({ id: 't1', type: 'addition', quantity: 10, notes: 'Bought from a supplier', created_at: '2026-01-02T00:00:00.000Z' }),
    ]);
    await renderWithQuery(<InventoryTransactionScreen {...makeProps()} />);

    expect(await screen.findByText('DAP Fertilizer')).toBeTruthy();
    expect(screen.getByText('In stock')).toBeTruthy();
    expect(screen.getAllByText('20 bags').length).toBeGreaterThan(0);
    // Once as the button, once as the ledger row.
    expect(screen.getAllByText('Stock out')).toHaveLength(2);
    expect(screen.getByText('−5 bags')).toBeTruthy();
    expect(screen.getByText('Balance 20 bags')).toBeTruthy();
    expect(screen.getByText('+10 bags')).toBeTruthy();
    expect(screen.getByText('Balance 25 bags')).toBeTruthy();
    expect(screen.getByText(/Bought from a supplier/)).toBeTruthy();
    // 25 - 10 = 15 was on the shelf before the first record.
    expect(screen.getByText('Opening stock')).toBeTruthy();
    expect(screen.getByText('Balance 15 bags')).toBeTruthy();
  });

  it('shows a marketplace dispatch as "Marketplace order" without its raw id', async () => {
    mockFetchInventoryById.mockResolvedValue(invItem);
    mockFetchInventoryTransactions.mockResolvedValue([
      tx({ type: 'sale', quantity: -3, notes: 'Order 3f2a9c1e-0000-4000-8000-000000000000 dispatched' }),
    ]);
    await renderWithQuery(<InventoryTransactionScreen {...makeProps()} />);

    expect(await screen.findByText('Marketplace order')).toBeTruthy();
    expect(screen.queryByText(/3f2a9c1e/)).toBeNull();
    expect(screen.queryByText('Sale')).toBeNull();
  });

  it('shows an empty state when there are no movements', async () => {
    mockFetchInventoryById.mockResolvedValue(invItem);
    mockFetchInventoryTransactions.mockResolvedValue([]);
    await renderWithQuery(<InventoryTransactionScreen {...makeProps()} />);
    expect(await screen.findByText('No stock movements yet')).toBeTruthy();
  });

  it('shows a failed load as an error with Try again', async () => {
    mockFetchInventoryById.mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValue(invItem);
    mockFetchInventoryTransactions.mockResolvedValue([]);
    await renderWithQuery(<InventoryTransactionScreen {...makeProps()} />);
    expect(await screen.findByText("Couldn't load this item")).toBeTruthy();

    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('DAP Fertilizer')).toBeTruthy();
  });

  it('offers Stock in, Stock out and Count, each naming the item, and records one', async () => {
    mockFetchInventoryById.mockResolvedValue(invItem);
    mockFetchInventoryTransactions.mockResolvedValue([]);
    mockAdjustStock.mockResolvedValue(invItem);
    await renderWithQuery(<InventoryTransactionScreen {...makeProps()} />);
    await screen.findByText('DAP Fertilizer');

    expect(screen.getByRole('button', { name: 'Stock out for DAP Fertilizer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Count for DAP Fertilizer' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Stock in for DAP Fertilizer' }));
    await fireEvent.changeText(await screen.findByLabelText('Quantity'), '15');
    await fireEvent.press(screen.getByRole('button', { name: 'Add 15 bags' }));

    expect(mockAdjustStock).toHaveBeenCalledWith('inv-1', 'addition', 15, 'Bought from a supplier');
  });
});
