import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { InventoryScreen } from './InventoryScreen';
import { deleteInventoryItem, fetchDealerListings, fetchInventory } from '../services/inventoryService';
import { useAuthStore } from '../../state/authStore';
import { HOME_ROUTES } from '../../common/constants/routes';
import type { InventoryItemWithListing } from '../types/dealer';
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

// One mock factory covers the screen's own calls and the ones made by the sheets it opens.
jest.mock('../services/inventoryService', () => ({
  fetchInventory: jest.fn(),
  fetchDealerListings: jest.fn(),
  createInventoryItem: jest.fn(),
  updateInventoryItem: jest.fn(),
  deleteInventoryItem: jest.fn(),
  adjustStock: jest.fn(),
}));

const mockFetchInventory = fetchInventory as jest.Mock;
const mockFetchDealerListings = fetchDealerListings as jest.Mock;
const mockDeleteInventoryItem = deleteInventoryItem as jest.Mock;

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

const renderScreen = (navigation = makeNavigation()) =>
  renderWithQuery(<InventoryScreen navigation={navigation} route={{} as never} />);

beforeEach(() => {
  mockFetchInventory.mockReset();
  mockFetchDealerListings.mockReset();
  mockDeleteInventoryItem.mockReset();
  mockFetchDealerListings.mockResolvedValue([{ id: 'l1', title: 'DAP Fertilizer' }]);
  useAuthStore.setState({ user: { id: 'dealer-1' } as never });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('InventoryScreen', () => {
  it('shows an empty state when there are no stock items', async () => {
    mockFetchInventory.mockResolvedValue([]);
    await renderScreen();
    expect(await screen.findByText('No stock items yet')).toBeTruthy();
  });

  it('lists stock items with their quantity and where they stand', async () => {
    mockFetchInventory.mockResolvedValue([item({ stock_quantity: 2 })]);
    await renderScreen();
    expect(await screen.findByText('DAP Fertilizer')).toBeTruthy();
    expect(screen.getByText('2 bags')).toBeTruthy();
    expect(screen.getByText('Low stock')).toBeTruthy();
  });

  it('shows a failed load as an error with Try again, never as an empty list', async () => {
    mockFetchInventory.mockRejectedValue(new Error('Network request failed'));
    await renderScreen();
    expect(await screen.findByText("Couldn't load your stock")).toBeTruthy();
    expect(screen.queryByText('No stock items yet')).toBeNull();

    mockFetchInventory.mockResolvedValue([]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('No stock items yet')).toBeTruthy();
  });

  it('counts All, Low and Out, and narrows the list by chip and by search', async () => {
    mockFetchInventory.mockResolvedValue([
      item({ id: 'a', stock_quantity: 20, listing: { id: 'l1', title: 'DAP Fertilizer' } }),
      item({ id: 'b', stock_quantity: 3, listing: { id: 'l2', title: 'Urea' } }),
      item({ id: 'c', stock_quantity: 4, listing: { id: 'l3', title: 'Potash' } }),
      item({ id: 'd', stock_quantity: 0, listing: { id: 'l4', title: 'Glyphosate' } }),
    ]);
    await renderScreen();
    await screen.findByText('DAP Fertilizer');
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();

    await fireEvent.press(screen.getByText('Out'));
    expect(screen.getByText('Glyphosate')).toBeTruthy();
    expect(screen.queryByText('Urea')).toBeNull();

    await fireEvent.press(screen.getByText('Low'));
    expect(screen.getByText('Urea')).toBeTruthy();
    expect(screen.getByText('Potash')).toBeTruthy();
    expect(screen.queryByText('Glyphosate')).toBeNull();

    await fireEvent.press(screen.getByText('All'));
    await fireEvent.changeText(screen.getByLabelText('Find an item'), 'pot');
    expect(screen.getByText('Potash')).toBeTruthy();
    expect(screen.queryByText('Urea')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Find an item'), 'zzz');
    expect(screen.getByText('No items match')).toBeTruthy();
  });

  it('opens an empty sheet from the sticky Add item button', async () => {
    mockFetchInventory.mockResolvedValue([]);
    await renderScreen();
    await screen.findByText('No stock items yet');
    await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));
    expect(await screen.findByText('Add stock item')).toBeTruthy();
  });

  it('opens an item to edit it', async () => {
    mockFetchInventory.mockResolvedValue([item()]);
    await renderScreen();
    await screen.findByText('DAP Fertilizer');
    await fireEvent.press(screen.getByText('DAP Fertilizer'));
    expect(await screen.findByText('Edit DAP Fertilizer')).toBeTruthy();
  });

  it('asks before removing an item, then removes it', async () => {
    mockFetchInventory.mockResolvedValue([item()]);
    mockDeleteInventoryItem.mockResolvedValue(undefined);
    await renderScreen();
    await screen.findByText('DAP Fertilizer');

    await fireEvent.press(screen.getByText('DAP Fertilizer'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove item' }));
    expect(await screen.findByText('Remove DAP Fertilizer?')).toBeTruthy();
    expect(mockDeleteInventoryItem).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Remove item' }));
    expect(mockDeleteInventoryItem).toHaveBeenCalledWith('inv-1');
    expect(await screen.findByText('Item removed')).toBeTruthy();
  });

  it('keeps the item when the person goes back from the confirmation', async () => {
    mockFetchInventory.mockResolvedValue([item()]);
    await renderScreen();
    await screen.findByText('DAP Fertilizer');
    await fireEvent.press(screen.getByText('DAP Fertilizer'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove item' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Keep item' }));
    expect(mockDeleteInventoryItem).not.toHaveBeenCalled();
  });

  it('opens Record stock from a row, naming the item', async () => {
    mockFetchInventory.mockResolvedValue([item()]);
    await renderScreen();
    await screen.findByText('DAP Fertilizer');

    await fireEvent.press(screen.getByRole('button', { name: 'Record stock for DAP Fertilizer' }));
    expect(await screen.findByText('Record stock · DAP Fertilizer')).toBeTruthy();
    // Once on the row behind the sheet, once as "In stock now".
    expect(screen.getAllByText('20 bags')).toHaveLength(2);
  });

  it('navigates to stock history from a row', async () => {
    mockFetchInventory.mockResolvedValue([item()]);
    const navigation = makeNavigation();
    await renderScreen(navigation);
    await screen.findByText('DAP Fertilizer');

    await fireEvent.press(screen.getByRole('button', { name: 'See stock history for DAP Fertilizer' }));
    expect(navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.InventoryTransactions, { inventoryId: 'inv-1' });
  });
});
