import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, type MockedInventoryApi } from '../testUtils/api';
import { apiError, screenProps, signInApprovedDealer, syncEntry } from '../testUtils/fixtures';
import { INVENTORY_ROUTES } from '../types/navigation';
import { SyncLogScreen } from './SyncLogScreen';

jest.mock('../services/inventoryService');
// The order in the sheet comes from the orders module's own read of the dealer's sales (the network edge, faked).
jest.mock('../../common/orders/services/ordersService', () => ({
  fetchOrdersForUser: jest.fn().mockResolvedValue([
    {
      id: '3f2a9c1b-1111-4222-8333-444455556666',
      status: 'dispatched',
      total: 10800,
      created_at: '2026-10-15T08:28:00Z',
      buyer: { id: 'buyer-1', full_name: 'Bilal Buyer' },
      seller: { id: 'dealer-a', full_name: 'Ali Traders' },
      order_items: [{ id: 'item-1', quantity: 3, listing: { title: 'Urea bags, Multan', unit: 'bag' } }],
    },
  ]),
}));

const mockRootNavigate = jest.fn();
// The order opens in the marketplace's Orders tab, through the root stack; the screen asks its navigation for it.
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockRootNavigate }),
}));

const api = service as MockedInventoryApi;

async function renderLog() {
  await renderWithProviders(<SyncLogScreen {...screenProps<typeof INVENTORY_ROUTES.SyncLog>(undefined, {})} />);
}

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  await signInApprovedDealer();
});

describe('SyncLogScreen (B3, verification N5)', () => {
  it('names each line’s listing and order, with its status and attempts', async () => {
    await renderLog();
    expect(await screen.findByText('Urea bags, Multan')).toBeTruthy();
    expect(screen.getByText(/^Order 3F2A9C1B · /)).toBeTruthy();
    expect(screen.getByText('Applied')).toBeTruthy();
    expect(screen.getByText('1 attempt')).toBeTruthy();
  });

  it('shows the order in a sheet inside the inventory system; closing it stays on the log (F5)', async () => {
    await renderLog();
    await fireEvent.press(await screen.findByLabelText('View order 3F2A9C1B'));
    expect(await screen.findByText('Bilal Buyer')).toBeTruthy();
    expect(screen.getByText('Dispatched')).toBeTruthy();
    expect(screen.getByText('3 bag')).toBeTruthy();
    expect(mockRootNavigate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByLabelText('Close')[0]!);
    expect(screen.queryByText('Bilal Buyer')).toBeNull();
    expect(screen.getByText(/^Order 3F2A9C1B · /)).toBeTruthy();
  });

  it('offers the full order in ZaraiLink’s Orders tab from the sheet, said to leave the inventory system', async () => {
    await renderLog();
    await fireEvent.press(await screen.findByLabelText('View order 3F2A9C1B'));
    await fireEvent.press(
      await screen.findByLabelText('Open order 3F2A9C1B in ZaraiLink Orders, leaving the inventory system'),
    );
    expect(mockRootNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Orders',
      params: { screen: 'OrderDetail', params: { orderId: '3f2a9c1b-1111-4222-8333-444455556666' }, initial: false },
    });
  });

  it('says so for a listing the dealer no longer owns, and offers no order link without an order', async () => {
    api.fetchSyncLog.mockResolvedValue([syncEntry({ listing_id: 'listing-gone', order_id: null })]);
    await renderLog();
    expect(await screen.findByText('A listing no longer yours')).toBeTruthy();
    expect(screen.queryByText('View order')).toBeNull();
  });

  it('shows why a line failed and retries the failed ones, reporting in a toast', async () => {
    api.fetchSyncLog.mockResolvedValue([
      syncEntry({ status: 'failed', attempts: 2, error: 'Inventory was unavailable at dispatch; retry' }),
      syncEntry({ id: 'sync-2', status: 'skipped_duplicate' }),
    ]);
    api.retrySync.mockResolvedValue({ applied: 1 });
    await renderLog();
    expect(await screen.findByText('Inventory was unavailable at dispatch; retry')).toBeTruthy();
    expect(screen.getByText('Already applied')).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry failed (1)'));
    expect(await screen.findByText('1 dispatch applied to your stock')).toBeTruthy();
    await waitFor(() => expect(api.retrySync).toHaveBeenCalledTimes(1));
  });

  it('explains the log when nothing was dispatched yet', async () => {
    api.fetchSyncLog.mockResolvedValue([]);
    await renderLog();
    expect(await screen.findByText('No marketplace dispatches yet')).toBeTruthy();
    expect(screen.queryByText(/^Retry failed/)).toBeNull();
  });

  it('shows a failed load with Retry', async () => {
    api.fetchSyncLog.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderLog();
    expect(await screen.findByText("Couldn't load marketplace sync")).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Urea bags, Multan')).toBeTruthy();
  });
});
