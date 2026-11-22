import type { PeriodReports } from '../types/inventory';

// The seven period reports as the API returns them (backend/app/inventory/reports.py) for one scripted October:
// Urea 50kg at the Main shop, cost Rs 3,200.55 a bag: 30 restocked, 12 bought from Engro at Rs 3,100, 4 sold locally,
// 3 sold on the marketplace, 1 written off by adjustment and 2 damaged, leaving 32. DAP 50kg is out of stock.

const PERIOD = { from: '2026-10-01', to: '2026-10-31', generated_at: '2026-10-31T18:00:00Z' };

export const REPORTS: PeriodReports = {
  'stock-summary': {
    ...PERIOD,
    total_quantity: 32,
    rows: [
      {
        product_id: 'prod-urea',
        location_id: 'loc-shop',
        location_name: 'Main shop',
        name: 'Urea 50kg',
        sku: 'UREA-50',
        unit: 'bag',
        quantity: 32,
        period_in: 42,
        period_out: 10,
      },
    ],
  },
  valuation: {
    ...PERIOD,
    total_value: 102417.6,
    products_without_cost: 1,
    rows: [
      {
        product_id: 'prod-urea',
        name: 'Urea 50kg',
        sku: 'UREA-50',
        unit: 'bag',
        quantity: 32,
        cost_price: 3200.55,
        value: 102417.6,
        period_in: 42,
        period_out: 10,
      },
      {
        product_id: 'prod-dap',
        name: 'DAP 50kg',
        sku: 'DAP-50',
        unit: 'bag',
        quantity: 0,
        cost_price: null,
        value: null,
        period_in: 0,
        period_out: 0,
      },
    ],
  },
  'movements-by-source': {
    ...PERIOD,
    rows: [
      { source: 'RESTOCK', movements: 1, in: 30, out: 0, net: 30 },
      { source: 'PURCHASE', movements: 1, in: 12, out: 0, net: 12 },
      { source: 'LOCAL_SALE', movements: 1, in: 0, out: 4, net: -4 },
      { source: 'ZARAILINK_ORDER', movements: 1, in: 0, out: 3, net: -3 },
      { source: 'MANUAL_ADJUSTMENT', movements: 1, in: 0, out: 1, net: -1 },
      { source: 'DAMAGE', movements: 1, in: 0, out: 2, net: -2 },
      { source: 'EXPIRY', movements: 0, in: 0, out: 0, net: 0 },
      { source: 'TRANSFER', movements: 0, in: 0, out: 0, net: 0 },
      { source: 'OTHER', movements: 0, in: 0, out: 0, net: 0 },
    ],
  },
  'low-out-of-stock': {
    ...PERIOD,
    low_stock: 0,
    out_of_stock: 1,
    rows: [
      {
        product_id: 'prod-dap',
        name: 'DAP 50kg',
        sku: 'DAP-50',
        unit: 'bag',
        location_id: 'loc-shop',
        quantity: 0,
        reorder_threshold: 5,
        status: 'out_of_stock',
        daily_out: 0,
        period_out: 0,
        days_of_cover: null,
      },
    ],
  },
  'supplier-purchases': {
    ...PERIOD,
    total_purchases: 1,
    total_quantity: 12,
    total_cost: 37200,
    rows: [{ supplier_id: 'sup-1', supplier_name: 'Engro Fertilizers', purchases: 1, quantity: 12, cost: 37200, lines_without_cost: 0 }],
  },
  'sales-split': {
    ...PERIOD,
    marketplace_total: 3,
    local_total: 4,
    by_day: [
      { date: '2026-10-10', marketplace: 0, local: 4 },
      { date: '2026-10-20', marketplace: 3, local: 0 },
    ],
    by_product: [{ product_id: 'prod-urea', name: 'Urea 50kg', sku: 'UREA-50', marketplace: 3, local: 4, total: 7 }],
  },
  analytics: {
    ...PERIOD,
    trend: [
      { date: '2026-10-02', in: 30, out: 0 },
      { date: '2026-10-10', in: 0, out: 4 },
    ],
    best_sellers: [{ product_id: 'prod-urea', name: 'Urea 50kg', sku: 'UREA-50', quantity: 7 }],
    fast_movers: [{ product_id: 'prod-urea', name: 'Urea 50kg', sku: 'UREA-50', out_quantity: 10, daily_out: 0.32 }],
    slow_movers: [{ product_id: 'prod-dap', name: 'DAP 50kg', sku: 'DAP-50', out_quantity: 0, daily_out: 0 }],
  },
};
