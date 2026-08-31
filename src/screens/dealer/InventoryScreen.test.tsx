import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { InventoryScreen } from './InventoryScreen';
import {
  createInventoryItem,
  deleteInventoryItem,
  fetchDealerListings,
  fetchInventory,
  updateInventoryItem,
  adjustStock,
} from '../../services/modules/dealer/inventoryService';
import { useAuthStore } from '../../store/authStore';
import { HOME_ROUTES } from '../../constants/routes';
import type { InventoryItemWithListing } from '../../types/dealer';
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

// Covers both InventoryScreen's own calls and the calls made by the StockAdjustModal it
// mounts (adjustStock) — same module, one mock factory.
jest.mock('../../services/modules/dealer/inventoryService', () => ({
  fetchInventory: jest.fn(),
  fetchDealerListings: jest.fn(),
  createInventoryItem: jest.fn(),
  updateInventoryItem: jest.fn(),
  deleteInventoryItem: jest.fn(),
  adjustStock: jest.fn(),
}));

const mockFetchInventory = fetchInventory as jest.Mock;
const mockFetchDealerListings = fetchDealerListings as jest.Mock;
const mockCreateInventoryItem = createInventoryItem as jest.Mock;
const mockUpdateInventoryItem = updateInventoryItem as jest.Mock;
const mockDeleteInventoryItem = deleteInventoryItem as jest.Mock;
const mockAdjustStock = adjustStock as jest.Mock;

const item = (overrides: Partial<InventoryItemWithListing> = {}): InventoryItemWithListing => ({
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
  ...overrides,
});

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as HomeScreenProps<'Inventory'>['navigation'];
}

beforeEach(() => {
  mockFetchInventory.mockReset();
  mockFetchDealerListings.mockReset();
  mockCreateInventoryItem.mockReset();
  mockUpdateInventoryItem.mockReset();
  mockDeleteInventoryItem.mockReset();
  mockAdjustStock.mockReset();
  mockFetchDealerListings.mockResolvedValue([{ id: 'l1', title: 'DAP Fertilizer' }]);
  useAuthStore.setState({ user: { id: 'dealer-1' } as never });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('InventoryScreen', () => {
  it('shows an empty state when there are no stock items', async () => {
    mockFetchInventory.mockResolvedValue([]);
    await render(<InventoryScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText('No stock items yet')).toBeTruthy();
  });

  it('lists stock items with their quantity and a low-stock badge', async () => {
    mockFetchInventory.mockResolvedValue([item({ stock_quantity: 2 })]);
    await render(<InventoryScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText('DAP Fertilizer')).toBeTruthy();
    expect(screen.getByText('2 bag in stock')).toBeTruthy();
    expect(screen.getByText('Low stock')).toBeTruthy();
  });

  it('shows an error state with retry when inventory fails to load', async () => {
    mockFetchInventory.mockRejectedValue(new Error('network down'));
    await render(<InventoryScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText("Couldn't load inventory")).toBeTruthy();

    mockFetchInventory.mockResolvedValue([]);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('No stock items yet')).toBeTruthy();
  });

  it('creates a new stock item through the sheet', async () => {
    mockFetchInventory.mockResolvedValueOnce([]).mockResolvedValueOnce([item()]);
    mockCreateInventoryItem.mockResolvedValue(item());
    await render(<InventoryScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('No stock items yet');

    await fireEvent.press(screen.getByText('+ Add Item'));
    expect(screen.getByText('New Stock Item')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));

    expect(mockCreateInventoryItem).toHaveBeenCalledWith({
      listingId: null,
      unit: 'unit',
      purchaseCost: null,
      sellingPrice: null,
      minStockThreshold: 0,
      stockQuantity: 0,
    });
    expect(await screen.findByText('DAP Fertilizer')).toBeTruthy();
  });

  it('edits an existing item, prefilling the sheet', async () => {
    mockFetchInventory.mockResolvedValue([item()]);
    mockUpdateInventoryItem.mockResolvedValue(item());
    await render(<InventoryScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('DAP Fertilizer');

    await fireEvent.press(screen.getByText('DAP Fertilizer'));
    expect(screen.getByText('Edit Stock Item')).toBeTruthy();
    expect(screen.getByLabelText('Unit').props.value).toBe('bag');

    await fireEvent.press(screen.getByText('Save'));
    expect(mockUpdateInventoryItem).toHaveBeenCalledWith('inv-1', {
      listingId: 'l1',
      unit: 'bag',
      purchaseCost: 400,
      sellingPrice: 500,
      minStockThreshold: 5,
    });
  });

  it('deletes an item after confirming the alert', async () => {
    mockFetchInventory.mockResolvedValue([item()]);
    mockDeleteInventoryItem.mockResolvedValue(undefined);
    (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
      buttons?.find((b: { text: string }) => b.text === 'Delete')?.onPress?.();
    });
    await render(<InventoryScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('DAP Fertilizer');

    await fireEvent.press(screen.getByText('DAP Fertilizer'));
    await fireEvent.press(screen.getByText('Remove Item'));

    expect(mockDeleteInventoryItem).toHaveBeenCalledWith('inv-1');
  });

  it('opens the stock adjust modal from a row', async () => {
    mockFetchInventory.mockResolvedValue([item()]);
    await render(<InventoryScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('DAP Fertilizer');

    await fireEvent.press(screen.getByText('Adjust Stock'));
    expect(screen.getByTestId('stock-adjust-quantity')).toBeTruthy();
  });

  it('navigates to stock history from a row', async () => {
    mockFetchInventory.mockResolvedValue([item()]);
    const navigation = makeNavigation();
    await render(<InventoryScreen navigation={navigation} route={{} as never} />);
    await screen.findByText('DAP Fertilizer');

    await fireEvent.press(screen.getByText('History'));
    expect(navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.InventoryTransactions, {
      inventoryId: 'inv-1',
    });
  });
});
