import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, type MockedInventoryApi } from '../testUtils/api';
import { apiError, screenProps, signInApprovedDealer } from '../testUtils/fixtures';
import type { ReconciliationReport } from '../types/inventory';
import { INVENTORY_ROUTES } from '../types/navigation';
import { ReconciliationScreen } from './ReconciliationScreen';
import { ReportsScreen } from './ReportsScreen';

// B5 owns the reports' figures, the month presets and the export; B4 checks only that both screens render what the
// API sends and reach their neighbours.

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;
const navigation = { navigate: jest.fn() };

const reconciliation = (overrides: Partial<ReconciliationReport> = {}): ReconciliationReport => ({
  generated_at: '2026-10-15T09:30:00Z',
  unbalanced: 0,
  rows: [
    {
      product_id: 'prod-urea',
      name: 'Urea 50kg',
      sku: 'UREA-50',
      marketplace_sales: -4,
      local_sales: -3,
      adjustments: -1,
      restocks_and_purchases: 28,
      losses: 0,
      transfers: 0,
      other: 0,
      ledger_total: 20,
      current_stock: 20,
      balanced: true,
    },
  ],
  ...overrides,
});

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  api.fetchReport.mockResolvedValue({
    from: '2026-09-16',
    to: '2026-10-15',
    generated_at: '2026-10-15T09:30:00Z',
    total_quantity: 20,
    rows: [
      {
        product_id: 'prod-urea',
        location_id: 'loc-shop',
        location_name: 'Main shop',
        name: 'Urea 50kg',
        sku: 'UREA-50',
        unit: 'bag',
        quantity: 20,
        period_in: 28,
        period_out: 8,
      },
    ],
  } as never);
  api.fetchReconciliationReport.mockResolvedValue(reconciliation());
  await signInApprovedDealer();
});

describe('ReportsScreen (renders now; B5 owns its reports)', () => {
  it('shows the stock summary for the last 30 days by default, with the export button', async () => {
    await renderWithProviders(<ReportsScreen {...screenProps<typeof INVENTORY_ROUTES.Reports>(undefined, navigation)} />);
    expect(await screen.findByLabelText('Stock on hand: 20')).toBeTruthy();
    expect(screen.getByText('UREA-50 · Main shop · in 28 · out 8')).toBeTruthy();
    expect(screen.getByText('Export CSV')).toBeTruthy();
    expect(api.fetchReport).toHaveBeenCalledWith('stock-summary', expect.objectContaining({ from: expect.any(String) }));
  });

  it('opens reconciliation, and switches to the movement history', async () => {
    await renderWithProviders(<ReportsScreen {...screenProps<typeof INVENTORY_ROUTES.Reports>(undefined, navigation)} />);
    await fireEvent.press(await screen.findByText('Reconciliation'));
    expect(navigation.navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.Reconciliation);
    await fireEvent.press(screen.getByRole('button', { name: 'Report, Stock summary' }));
    await fireEvent.press(await screen.findByText('Movement history'));
    await waitFor(() => expect(api.fetchMovements).toHaveBeenCalled());
  });

  it('shows a failed report with Retry', async () => {
    api.fetchReport.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderWithProviders(<ReportsScreen {...screenProps<typeof INVENTORY_ROUTES.Reports>(undefined, navigation)} />);
    expect(await screen.findByText("Couldn't load this report")).toBeTruthy();
  });
});

describe('ReconciliationScreen (SRDS §25)', () => {
  it('shows each product’s terms adding up to its stock', async () => {
    await renderWithProviders(<ReconciliationScreen {...screenProps<typeof INVENTORY_ROUTES.Reconciliation>(undefined, navigation)} />);
    expect(await screen.findByText('Every product’s movements add up to its stock on hand.')).toBeTruthy();
    expect(screen.getByText('Balanced')).toBeTruthy();
    expect(screen.getByText('+28')).toBeTruthy();
    expect(screen.getByText('−4')).toBeTruthy();
  });

  it('puts a product that does not add up forward, with a way to its history', async () => {
    api.fetchReconciliationReport.mockResolvedValue(
      reconciliation({
        unbalanced: 1,
        rows: [{ ...reconciliation().rows[0]!, current_stock: 18, balanced: false }],
      }),
    );
    await renderWithProviders(<ReconciliationScreen {...screenProps<typeof INVENTORY_ROUTES.Reconciliation>(undefined, navigation)} />);
    expect(await screen.findByText('1 of 1 products does not add up. Check its movement history.')).toBeTruthy();
    expect(screen.getByText('Does not add up')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('See movement history of Urea 50kg'));
    expect(navigation.navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.Movements, { productId: 'prod-urea' });
  });

  it('says when there is nothing to reconcile', async () => {
    api.fetchReconciliationReport.mockResolvedValueOnce(reconciliation({ rows: [] }));
    await renderWithProviders(<ReconciliationScreen {...screenProps<typeof INVENTORY_ROUTES.Reconciliation>(undefined, navigation)} />);
    expect(await screen.findByText('Nothing to reconcile')).toBeTruthy();
  });

  it('shows a failed load with Retry', async () => {
    api.fetchReconciliationReport.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderWithProviders(<ReconciliationScreen {...screenProps<typeof INVENTORY_ROUTES.Reconciliation>(undefined, navigation)} />);
    expect(await screen.findByText("Couldn't load the reconciliation")).toBeTruthy();
  });
});
