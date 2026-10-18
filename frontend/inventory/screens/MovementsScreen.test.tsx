import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, type MockedInventoryApi } from '../testUtils/api';
import { apiError, movement, product, screenProps, signInApprovedDealer } from '../testUtils/fixtures';
import { INVENTORY_ROUTES } from '../types/navigation';
import { MovementsScreen } from './MovementsScreen';

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;

async function renderMovements(productId?: string) {
  await renderWithProviders(
    <MovementsScreen {...screenProps<typeof INVENTORY_ROUTES.Movements>(productId ? { productId } : undefined, {})} />,
  );
}

/** The filters of the most recent movements request. */
function lastFilters() {
  const calls = api.fetchMovements.mock.calls;
  return calls[calls.length - 1]?.[0];
}

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  api.fetchProducts.mockResolvedValue([product(), product({ id: 'p-dap', name: 'DAP 50kg', sku: 'DAP-50' })]);
  await signInApprovedDealer();
});

describe('MovementsScreen and MovementHistory (SRDS §22, §25)', () => {
  it('shows each ledger line: source, product, location, signed quantity and the stock after it', async () => {
    api.fetchMovements.mockResolvedValue([
      movement({ id: 'm1', source: 'LOCAL_SALE', direction: 'out', quantity: 3, quantity_after: 17, reason: 'Walk-in' }),
      movement({ id: 'm2', source: 'ZARAILINK_ORDER', direction: 'out', quantity: 2, quantity_after: 15 }),
    ]);
    await renderMovements();
    expect(await screen.findByText('−3')).toBeTruthy();
    expect(screen.getByText('Now 17')).toBeTruthy();
    expect(screen.getAllByText(/^Main shop · .* · Walk-in$/)).toHaveLength(1);
    // The source badge names it in the SRDS words.
    expect(screen.getAllByText('Local sale').length).toBeGreaterThan(0);
  });

  it('starts at the last 30 days for every product and source', async () => {
    await renderMovements();
    await waitFor(() => expect(api.fetchMovements).toHaveBeenCalled());
    // A date, as the API's `from` is (a timestamp was refused with a 422 on the emulator).
    expect(lastFilters()).toEqual({ sources: undefined, productId: undefined, from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('filters by source (several at once), product and period, each on the server', async () => {
    await renderMovements();
    await screen.findByText('Urea 50kg');
    await fireEvent.press(screen.getByRole('button', { name: 'Damage' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Expiry' }));
    await waitFor(() => expect(lastFilters()?.sources).toEqual(['DAMAGE', 'EXPIRY']));

    await fireEvent.press(screen.getByRole('button', { name: 'Product, All products' }));
    await fireEvent.press(await screen.findByText('DAP 50kg'));
    await waitFor(() => expect(lastFilters()?.productId).toBe('p-dap'));

    await fireEvent.press(screen.getByText('All time'));
    await waitFor(() => expect(lastFilters()?.from).toBeUndefined());

    // Pressing a source again takes it off.
    await fireEvent.press(screen.getByRole('button', { name: 'Damage' }));
    await waitFor(() => expect(lastFilters()?.sources).toEqual(['EXPIRY']));
  });

  it('counts the period back from the new UTC day once midnight passes (B5 verification)', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-18T23:59:55Z'), advanceTimers: true });
    try {
      await renderMovements();
      await waitFor(() => expect(lastFilters()?.from).toBe('2026-09-18'));
      await act(async () => jest.advanceTimersByTime(10_000));
      await waitFor(() => expect(lastFilters()?.from).toBe('2026-09-19'));
    } finally {
      jest.useRealTimers();
    }
  });

  it('opens filtered to one product when reached from a product', async () => {
    await renderMovements('p-dap');
    await waitFor(() => expect(lastFilters()?.productId).toBe('p-dap'));
  });

  it('says when nothing matches the filters', async () => {
    api.fetchMovements.mockResolvedValue([]);
    await renderMovements();
    expect(await screen.findByText('No movements')).toBeTruthy();
  });

  it('shows a failed load with Retry', async () => {
    api.fetchMovements.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderMovements();
    expect(await screen.findByText("Couldn't load the movements")).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('+10')).toBeTruthy();
  });
});
