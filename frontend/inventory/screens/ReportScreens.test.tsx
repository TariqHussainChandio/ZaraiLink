import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, type MockedInventoryApi } from '../testUtils/api';
import { apiError, screenProps, signInApprovedDealer } from '../testUtils/fixtures';
import { REPORTS } from '../testUtils/reports';
import type { PeriodReportName, ReconciliationReport } from '../types/inventory';
import { INVENTORY_ROUTES } from '../types/navigation';
import { ReconciliationScreen } from './ReconciliationScreen';
import { ReportsScreen } from './ReportsScreen';

// B5: the reports and reconciliation as the dealer reads them. The server computes every figure (reports.py); these
// check the pickers send dates, each report lands under its labels, and the states a dealer can meet.

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
  api.fetchReport.mockImplementation(async (report: PeriodReportName) => REPORTS[report] as never);
  api.fetchReconciliationReport.mockResolvedValue(reconciliation());
  await signInApprovedDealer();
});

describe('ReportsScreen (renders now; B5 owns its reports)', () => {
  it('shows the stock summary for the last 30 days by default, with the export button', async () => {
    await renderWithProviders(<ReportsScreen {...screenProps<typeof INVENTORY_ROUTES.Reports>(undefined, navigation)} />);
    expect(await screen.findByLabelText('Stock on hand: 32')).toBeTruthy();
    expect(screen.getByText('UREA-50 · Main shop · in 42 · out 10')).toBeTruthy();
    expect(screen.getByText('Export CSV')).toBeTruthy();
    // Dates, not timestamps (the B4 D3 lesson).
    expect(api.fetchReport).toHaveBeenCalledWith('stock-summary', {
      from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('opens reconciliation, and switches to the movement history', async () => {
    await renderWithProviders(<ReportsScreen {...screenProps<typeof INVENTORY_ROUTES.Reports>(undefined, navigation)} />);
    await fireEvent.press(await screen.findByText('Reconciliation'));
    expect(navigation.navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.Reconciliation);
    await fireEvent.press(screen.getByRole('button', { name: 'Report, Stock summary' }));
    await fireEvent.press(await screen.findByText('Movement history'));
    await waitFor(() => expect(api.fetchMovements).toHaveBeenCalled());
  });

  it('shows a failed report with Retry, and recovers', async () => {
    api.fetchReport.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderWithProviders(<ReportsScreen {...screenProps<typeof INVENTORY_ROUTES.Reports>(undefined, navigation)} />);
    expect(await screen.findByText("Couldn't load this report")).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByLabelText('Stock on hand: 32')).toBeTruthy();
  });

  it('lays every period out without a sideways scroll, so "Last month" is never off screen (B5 walk)', async () => {
    await renderWithProviders(<ReportsScreen {...screenProps<typeof INVENTORY_ROUTES.Reports>(undefined, navigation)} />);
    await screen.findByLabelText('Stock on hand: 32');
    let node = screen.getByRole('button', { name: 'Last month' }).parent;
    while (node && !node.props.horizontal) node = node.parent;
    expect(node).toBeNull();
  });

  it('asks for this month and for last month as whole calendar months', async () => {
    await renderWithProviders(<ReportsScreen {...screenProps<typeof INVENTORY_ROUTES.Reports>(undefined, navigation)} />);
    await screen.findByLabelText('Stock on hand: 32');
    await fireEvent.press(screen.getByText('Last month'));
    await waitFor(() => {
      const range = api.fetchReport.mock.calls[api.fetchReport.mock.calls.length - 1]?.[1];
      expect(range?.from).toMatch(/^\d{4}-\d{2}-01$/);
      expect(new Date(`${range?.to}T00:00:00Z`).getUTCDate()).toBeGreaterThanOrEqual(28);
    });
    await fireEvent.press(screen.getByText('This month'));
    await waitFor(() => expect(api.fetchReport.mock.calls[api.fetchReport.mock.calls.length - 1]?.[1].from).toMatch(/-01$/));
  });

  it.each([
    ['Stock value', 'valuation', 'Stock value at cost: Rs 102,417.60'],
    ['Movements by source', 'movements-by-source', 'Movements: 6'],
    ['Low and out of stock', 'low-out-of-stock', 'Out of stock: 1'],
    ['Purchases by supplier', 'supplier-purchases', 'Cost: Rs 37,200'],
    ['Marketplace and local sales', 'sales-split', 'Local units: 4'],
  ] as const)('opens "%s" and shows its figures', async (label, report, tile) => {
    await renderWithProviders(<ReportsScreen {...screenProps<typeof INVENTORY_ROUTES.Reports>(undefined, navigation)} />);
    await screen.findByLabelText('Stock on hand: 32');
    await fireEvent.press(screen.getByRole('button', { name: 'Report, Stock summary' }));
    await fireEvent.press(await screen.findByText(label));
    await waitFor(() => expect(api.fetchReport).toHaveBeenCalledWith(report, expect.anything()));
    expect(await screen.findByLabelText(tile)).toBeTruthy();
  });

  it('opens best sellers and movers', async () => {
    await renderWithProviders(<ReportsScreen {...screenProps<typeof INVENTORY_ROUTES.Reports>(undefined, navigation)} />);
    await screen.findByLabelText('Stock on hand: 32');
    await fireEvent.press(screen.getByRole('button', { name: 'Report, Stock summary' }));
    await fireEvent.press(await screen.findByText('Best sellers and movers'));
    expect(await screen.findByText('0.32 a day')).toBeTruthy();
    expect(screen.getByText('Best sellers')).toBeTruthy();
  });

  it('says so for a quiet period instead of empty charts', async () => {
    api.fetchReport.mockResolvedValue({ ...REPORTS['stock-summary'], total_quantity: 0, rows: [] } as never);
    await renderWithProviders(<ReportsScreen {...screenProps<typeof INVENTORY_ROUTES.Reports>(undefined, navigation)} />);
    expect(await screen.findByText('No products hold stock.')).toBeTruthy();
    expect(screen.getByText('No stock at any location')).toBeTruthy();
  });
});

describe('ReportsScreen across UTC midnight (B5 verification)', () => {
  afterEach(() => jest.useRealTimers());

  it('moves "to" on to the new day when the screen stays open past UTC midnight', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-18T23:59:55Z'), advanceTimers: true });
    await renderWithProviders(<ReportsScreen {...screenProps<typeof INVENTORY_ROUTES.Reports>(undefined, navigation)} />);
    await waitFor(() => expect(api.fetchReport).toHaveBeenCalledWith('stock-summary', { from: '2026-09-19', to: '2026-10-18' }));

    await act(async () => jest.advanceTimersByTime(10_000));
    await waitFor(() => expect(api.fetchReport).toHaveBeenCalledWith('stock-summary', { from: '2026-09-20', to: '2026-10-19' }));
  });
});

describe('ReconciliationScreen (SRDS §25)', () => {
  it('shows each product’s terms adding up to its stock', async () => {
    await renderWithProviders(<ReconciliationScreen {...screenProps<typeof INVENTORY_ROUTES.Reconciliation>(undefined, navigation)} />);
    expect(await screen.findByText('Every product’s movements add up to its stock on hand.')).toBeTruthy();
    expect(screen.getByText('Balanced')).toBeTruthy();
    expect(screen.queryByText(/^Out by/)).toBeNull();
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
    // Two fewer on hand than the movements explain.
    expect(screen.getByText('Out by −2 bag')).toBeTruthy();
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
