import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, type MockedInventoryApi } from '../testUtils/api';
import { apiError, dashboard, movement, purchase, screenProps, signInApprovedDealer } from '../testUtils/fixtures';
import { INVENTORY_ROUTES } from '../types/navigation';
import { DashboardScreen } from './DashboardScreen';

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;
const navigate = jest.fn();

async function renderDashboard() {
  await renderWithProviders(<DashboardScreen {...screenProps<typeof INVENTORY_ROUTES.Dashboard>(undefined, { navigate })} />);
}

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  await signInApprovedDealer();
});

describe('DashboardScreen (SRDS §18)', () => {
  it('shows the totals the API computed, each under its own label', async () => {
    await renderDashboard();
    expect(await screen.findByLabelText('Products: 3')).toBeTruthy();
    expect(screen.getByLabelText('Stock units: 42.5')).toBeTruthy();
    expect(screen.getByLabelText('Low stock: 1')).toBeTruthy();
    expect(screen.getByLabelText('Out of stock: 2')).toBeTruthy();
    expect(screen.getByLabelText(/^Stock value at cost: Rs/)).toBeTruthy();
  });

  it('lists the alerts and the recent movements by product and location name', async () => {
    await renderDashboard();
    expect(await screen.findByText('DAP 50kg')).toBeTruthy();
    expect(screen.getByText('2 bag · reorder at 5')).toBeTruthy();
    // The movement row carries only ids; the screen names the product and location from the cached lists.
    expect(await screen.findByText('Urea 50kg')).toBeTruthy();
    expect(screen.getByText('+10')).toBeTruthy();
    expect(screen.getByText('Now 20')).toBeTruthy();
    await fireEvent.press(screen.getByText('DAP 50kg'));
    expect(navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.ProductDetail, { productId: 'prod-dap' });
  });

  it('says so when nothing has moved and every product is above its level', async () => {
    // A quiet month: thirty days of zeros draw the empty message, not empty bars (found on the emulator).
    const quiet = Array.from({ length: 30 }, (_, day) => ({ date: `2026-09-${String(day + 1).padStart(2, '0')}`, in: 0, out: 0 }));
    api.fetchDashboard.mockResolvedValue(dashboard({ alerts: [], recent_movements: [], trend: quiet }));
    await renderDashboard();
    expect(await screen.findByText('Every product is above its reorder level.')).toBeTruthy();
    expect(screen.getByText('No stock has moved yet.')).toBeTruthy();
    expect(screen.getByText('No stock came in')).toBeTruthy();
    expect(screen.getByText('No stock went out')).toBeTruthy();
  });

  it('shows adjustments, restocks and purchases in their own sections', async () => {
    api.fetchDashboard.mockResolvedValue(
      dashboard({
        recent_adjustments: [movement({ id: 'adj', source: 'MANUAL_ADJUSTMENT', direction: 'out', quantity: 1, reason: 'Count' })],
        recent_purchases: [purchase({ reference: 'INV-778', status: 'received' })],
      }),
    );
    await renderDashboard();
    expect(await screen.findByText('−1')).toBeTruthy();
    await fireEvent.press(screen.getByText('INV-778'));
    expect(navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.PurchaseDetail, { purchaseId: 'pur-1' });
  });

  it('opens each stock operation from the quick actions', async () => {
    await renderDashboard();
    // "Stock in" and "Stock out" also title the trend charts; the actions are the buttons.
    await fireEvent.press(await screen.findByRole('button', { name: 'Stock in' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Stock out' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Adjust' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Transfer' }));
    expect(navigate.mock.calls.map(call => call[1].operation)).toEqual(['in', 'out', 'adjust', 'transfer']);
  });

  it('shows the error with Retry when the first load fails, and recovers', async () => {
    api.fetchDashboard.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderDashboard();
    expect(await screen.findByText("Couldn't load your inventory")).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByLabelText('Products: 3')).toBeTruthy();
  });

  it('offers to retry failed dispatches and reports how many applied in a toast', async () => {
    api.fetchDashboard.mockResolvedValue(dashboard({ sync_failures: 2 }));
    api.retrySync.mockResolvedValue({ applied: 2 });
    await renderDashboard();
    expect(await screen.findByText('2 marketplace dispatches could not be applied to your stock.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry failed dispatches'));
    expect(await screen.findByText('2 dispatches applied to your stock')).toBeTruthy();
  });

  it('shows a failed retry as an error toast, not an alert', async () => {
    api.fetchDashboard.mockResolvedValue(dashboard({ sync_failures: 1 }));
    api.retrySync.mockRejectedValue(apiError(0, 'network', 'offline'));
    await renderDashboard();
    await fireEvent.press(await screen.findByText('Retry failed dispatches'));
    expect(await screen.findByText('No internet connection. Check your connection and try again.')).toBeTruthy();
  });

  it('refetches when it comes back into view (a dispatch may have changed stock)', async () => {
    await renderDashboard();
    await waitFor(() => expect(api.fetchDashboard).toHaveBeenCalled());
  });
});
