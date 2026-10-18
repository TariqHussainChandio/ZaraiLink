import { REPORTS } from '../testUtils/reports';
import { buildReportView, REPORT_OPTIONS } from './reportView';

// Each report reduced to what the Reports tab draws. The server computes every figure; these check that the right one
// goes under the right label, in the right unit, with paisa where an amount has them (B5).

describe('buildReportView', () => {
  it('has a view for every report the picker offers', () => {
    for (const { id } of REPORT_OPTIONS) {
      const view = buildReportView(id, REPORTS[id]);
      expect(view.sections.length).toBeGreaterThan(0);
    }
  });

  it('stock summary: stock on hand, by location, each product with its period in and out', () => {
    const view = buildReportView('stock-summary', REPORTS['stock-summary']);
    expect(view.totals).toEqual([{ label: 'Stock on hand', value: '32' }]);
    expect(view.charts[0]?.data).toEqual([{ label: 'Main shop', value: 32 }]);
    expect(view.sections[0]?.rows[0]).toMatchObject({
      title: 'Urea 50kg',
      meta: 'UREA-50 · Main shop · in 42 · out 10',
      figure: '32 bag',
    });
  });

  it('valuation: the value at cost to the paisa, and products without a cost named, not valued at zero', () => {
    const view = buildReportView('valuation', REPORTS.valuation);
    expect(view.totals).toEqual([{ label: 'Stock value at cost', value: 'Rs 102,417.60' }]);
    expect(view.note).toBe('1 product has no cost price and is left out of the total.');
    expect(view.sections[0]?.rows[0]).toMatchObject({ meta: 'UREA-50 · 32 bag · at Rs 3,200.55', figure: 'Rs 102,417.60' });
    expect(view.sections[0]?.rows[1]).toMatchObject({ meta: 'DAP-50 · 0 bag · no cost price', figure: 'No cost' });
    expect(view.charts[0]?.money).toBe(true);
  });

  it('movements by source: the SRDS source names, signed nets, and only used sources charted', () => {
    const view = buildReportView('movements-by-source', REPORTS['movements-by-source']);
    expect(view.totals).toEqual([{ label: 'Movements', value: '6' }]);
    expect(view.charts[0]?.data.map(bar => bar.label)).toEqual([
      'Restock',
      'Purchase',
      'Local sale',
      'Marketplace order',
      'Adjustment',
      'Damage',
    ]);
    const local = view.sections[0]?.rows.find(row => row.key === 'LOCAL_SALE');
    expect(local).toMatchObject({ title: 'Local sale', meta: '1 movement · in 0 · out 4', figure: '−4' });
  });

  it('low and out of stock: counts and each product with its status', () => {
    const view = buildReportView('low-out-of-stock', REPORTS['low-out-of-stock']);
    expect(view.totals).toEqual([
      { label: 'Low stock', value: '0' },
      { label: 'Out of stock', value: '1' },
    ]);
    expect(view.sections[0]?.rows[0]).toMatchObject({ title: 'DAP 50kg', figure: '0 bag', stock: 'out_of_stock' });
  });

  it('gives days of cover for a low product only, never "0 days left" for an empty one (B5 walk)', () => {
    const base = REPORTS['low-out-of-stock'].rows[0]!;
    const view = buildReportView('low-out-of-stock', {
      ...REPORTS['low-out-of-stock'],
      rows: [
        { ...base, days_of_cover: 0 },
        { ...base, product_id: 'prod-urea', name: 'Urea 50kg', sku: 'UREA-50', quantity: 3, status: 'low_stock', days_of_cover: 4.5 },
      ],
    });
    expect(view.sections[0]?.rows[0]?.meta).toBe('DAP-50 · reorder at 5');
    expect(view.sections[0]?.rows[1]?.meta).toBe('UREA-50 · reorder at 5 · about 4.5 days left');
  });

  it('supplier purchases: purchases, units and cost per supplier', () => {
    const view = buildReportView('supplier-purchases', REPORTS['supplier-purchases']);
    expect(view.totals).toEqual([
      { label: 'Purchases received', value: '1' },
      { label: 'Units', value: '12' },
      { label: 'Cost', value: 'Rs 37,200' },
    ]);
    expect(view.sections[0]?.rows[0]).toMatchObject({ title: 'Engro Fertilizers', meta: '1 purchase · 12 units', figure: 'Rs 37,200' });
  });

  it('sales split: marketplace and local units, by product', () => {
    const view = buildReportView('sales-split', REPORTS['sales-split']);
    expect(view.totals).toEqual([
      { label: 'Marketplace units', value: '3' },
      { label: 'Local units', value: '4' },
    ]);
    expect(view.sections[0]?.rows[0]).toMatchObject({ meta: 'UREA-50 · marketplace 3 · local 4', figure: '7' });
  });

  it('analytics: best sellers, fast and slow movers with a daily rate', () => {
    const view = buildReportView('analytics', REPORTS.analytics);
    expect(view.sections.map(section => section.title)).toEqual(['Best sellers', 'Fast movers', 'Slow movers']);
    expect(view.sections[1]?.rows[0]).toMatchObject({ meta: 'UREA-50 · 10 out', figure: '0.32 a day' });
  });

  it('says what an empty period means instead of drawing empty charts', () => {
    const quiet = { ...REPORTS['sales-split'], marketplace_total: 0, local_total: 0, by_day: [], by_product: [] };
    const view = buildReportView('sales-split', quiet);
    expect(view.charts.every(chart => chart.data.length === 0)).toBe(true);
    expect(view.charts[0]?.empty).toBe('Nothing sold in this period');
    expect(view.sections[0]?.rows).toEqual([]);
    expect(view.sections[0]?.empty).toBe('Nothing sold in this period.');
  });

  it('groups a long daily series into at most a dozen bars, keeping the total', () => {
    const days = Array.from({ length: 90 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 6, 21 + index)).toISOString().slice(0, 10),
      in: 1,
      out: 0,
    }));
    const view = buildReportView('analytics', { ...REPORTS.analytics, trend: days });
    const bars = view.charts[0]?.data ?? [];
    expect(bars.length).toBeLessThanOrEqual(12);
    expect(bars.reduce((sum, bar) => sum + bar.value, 0)).toBe(90);
  });
});
