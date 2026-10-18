import type { BarChartDatum } from '../../common/components';
import { statusMeta } from '../../common/constants/status';
import type { AnalyticsReport, PeriodReportName, PeriodReports } from '../types/inventory';
import { formatDayMonth, formatMoney, formatNet, formatQuantity } from './format';

// Each period report (B5) reduced to what the Reports tab draws: headline totals, charts, and tables of rows. The
// server computes every figure; this only chooses which ones to show and words them.

/** Which theme colour a chart's bars take: the scope's accent, stock coming in, or a warning. */
export type ChartTone = 'accent' | 'in' | 'warning';

export interface ReportChart {
  title: string;
  data: BarChartDatum[];
  tone: ChartTone;
  /** Rupee values (formatted as money), otherwise quantities. */
  money?: boolean;
  empty: string;
}

interface ReportTotal {
  label: string;
  value: string;
}

export interface ReportRow {
  key: string;
  title: string;
  meta?: string;
  /** The row's one number, set in the figure face so columns line up. */
  figure: string;
  /** For the low and out of stock report: the SRDS §24 status, shown as a StatusBadge. */
  stock?: 'low_stock' | 'out_of_stock';
}

interface ReportSection {
  title: string;
  rows: ReportRow[];
  empty: string;
}

export interface ReportView {
  totals: ReportTotal[];
  /** A caveat about the figures, such as products left out of a total for having no cost price. */
  note?: string;
  charts: ReportChart[];
  sections: ReportSection[];
}

export const REPORT_OPTIONS: { id: PeriodReportName; label: string }[] = [
  { id: 'stock-summary', label: 'Stock summary' },
  { id: 'valuation', label: 'Stock value' },
  { id: 'movements-by-source', label: 'Movements by source' },
  { id: 'low-out-of-stock', label: 'Low and out of stock' },
  { id: 'supplier-purchases', label: 'Purchases by supplier' },
  { id: 'sales-split', label: 'Marketplace and local sales' },
  { id: 'analytics', label: 'Best sellers and movers' },
];

// A chart stays readable on a phone at about a dozen bars; longer series are added up into that many groups.
const MAX_BARS = 12;
// A ranked chart (value, cost) shows the top few; the table below lists them all.
const TOP_BARS = 6;

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');
const plural = (count: number, one: string, many: string) => `${formatQuantity(count)} ${count === 1 ? one : many}`;

/** A daily series added up into at most MAX_BARS groups, each labelled by its first day. */
function grouped<T extends { date: string }>(points: T[], value: (point: T) => number): BarChartDatum[] {
  const size = Math.max(1, Math.ceil(points.length / MAX_BARS));
  const bars: BarChartDatum[] = [];
  for (let start = 0; start < points.length; start += size) {
    const group = points.slice(start, start + size);
    const [first] = group;
    if (first) bars.push({ label: formatDayMonth(first.date), value: group.reduce((sum, point) => sum + value(point), 0) });
  }
  return bars;
}

/** The highest few by a value, for a ranked chart; a zero value is left out (it draws no bar). */
function top<T>(rows: T[], value: (row: T) => number, label: (row: T) => string): BarChartDatum[] {
  return rows
    .filter(row => value(row) > 0)
    .sort((a, b) => value(b) - value(a))
    .slice(0, TOP_BARS)
    .map(row => ({ label: label(row), value: value(row) }));
}

function stockSummary(report: PeriodReports['stock-summary']): ReportView {
  const byLocation = new Map<string, number>();
  for (const row of report.rows) byLocation.set(row.location_name, (byLocation.get(row.location_name) ?? 0) + row.quantity);
  return {
    totals: [{ label: 'Stock on hand', value: formatQuantity(report.total_quantity) }],
    charts: [
      {
        title: 'Stock by location',
        data: [...byLocation].map(([label, value]) => ({ label, value })),
        tone: 'accent',
        empty: 'No stock at any location',
      },
    ],
    sections: [
      {
        title: 'Products',
        empty: 'No products hold stock.',
        rows: report.rows.map(row => ({
          key: `${row.product_id}-${row.location_id}`,
          title: row.name,
          meta: join(row.sku, row.location_name, `in ${formatQuantity(row.period_in)}`, `out ${formatQuantity(row.period_out)}`),
          figure: formatQuantity(row.quantity, row.unit),
        })),
      },
    ],
  };
}

function valuation(report: PeriodReports['valuation']): ReportView {
  const missing = report.products_without_cost;
  return {
    totals: [{ label: 'Stock value at cost', value: formatMoney(report.total_value) }],
    note:
      missing > 0
        ? `${plural(missing, 'product has', 'products have')} no cost price and ${missing === 1 ? 'is' : 'are'} left out of the total.`
        : undefined,
    charts: [
      {
        title: 'Highest value',
        data: top(report.rows, row => row.value ?? 0, row => row.sku),
        tone: 'accent',
        money: true,
        empty: 'No product has a value yet',
      },
    ],
    sections: [
      {
        title: 'Products',
        empty: 'No products hold stock.',
        rows: report.rows.map(row => ({
          key: row.product_id,
          title: row.name,
          meta: join(
            row.sku,
            formatQuantity(row.quantity, row.unit),
            row.cost_price != null ? `at ${formatMoney(row.cost_price)}` : 'no cost price',
          ),
          figure: row.value != null ? formatMoney(row.value) : 'No cost',
        })),
      },
    ],
  };
}

function movementsBySource(report: PeriodReports['movements-by-source']): ReportView {
  const used = report.rows.filter(row => row.movements > 0);
  return {
    totals: [{ label: 'Movements', value: formatQuantity(report.rows.reduce((sum, row) => sum + row.movements, 0)) }],
    charts: [
      {
        title: 'Movements by source',
        data: used.map(row => ({ label: statusMeta('movement', row.source).label, value: row.movements })),
        tone: 'accent',
        empty: 'No stock moved in this period',
      },
    ],
    sections: [
      {
        title: 'Sources',
        empty: 'No stock moved in this period.',
        rows: report.rows.map(row => ({
          key: row.source,
          title: statusMeta('movement', row.source).label,
          meta: join(plural(row.movements, 'movement', 'movements'), `in ${formatQuantity(row.in)}`, `out ${formatQuantity(row.out)}`),
          figure: formatNet(row.net),
        })),
      },
    ],
  };
}

function lowOutOfStock(report: PeriodReports['low-out-of-stock']): ReportView {
  return {
    totals: [
      { label: 'Low stock', value: formatQuantity(report.low_stock) },
      { label: 'Out of stock', value: formatQuantity(report.out_of_stock) },
    ],
    charts: [
      {
        title: 'Products needing stock',
        data:
          report.low_stock + report.out_of_stock > 0
            ? [
                { label: 'Low', value: report.low_stock },
                { label: 'Out', value: report.out_of_stock },
              ]
            : [],
        tone: 'warning',
        empty: 'Every product is above its reorder level',
      },
    ],
    sections: [
      {
        title: 'Products',
        empty: 'Every product is above its reorder level.',
        rows: report.rows.map(row => ({
          key: `${row.product_id}-${row.location_id ?? 'all'}`,
          title: row.name,
          meta: join(
            row.sku,
            `reorder at ${formatQuantity(row.reorder_threshold)}`,
            row.days_of_cover != null ? `about ${formatQuantity(row.days_of_cover)} days left` : null,
          ),
          figure: formatQuantity(row.quantity, row.unit),
          stock: row.status,
        })),
      },
    ],
  };
}

function supplierPurchases(report: PeriodReports['supplier-purchases']): ReportView {
  return {
    totals: [
      { label: 'Purchases received', value: formatQuantity(report.total_purchases) },
      { label: 'Units', value: formatQuantity(report.total_quantity) },
      { label: 'Cost', value: formatMoney(report.total_cost) },
    ],
    charts: [
      {
        title: 'Cost by supplier',
        data: top(report.rows, row => row.cost, row => row.supplier_name),
        tone: 'accent',
        money: true,
        empty: 'No costed purchases in this period',
      },
    ],
    sections: [
      {
        title: 'Suppliers',
        empty: 'No purchases were received in this period.',
        rows: report.rows.map(row => ({
          key: row.supplier_id ?? row.supplier_name,
          title: row.supplier_name,
          meta: join(
            plural(row.purchases, 'purchase', 'purchases'),
            `${formatQuantity(row.quantity)} units`,
            row.lines_without_cost > 0 ? plural(row.lines_without_cost, 'line without a cost', 'lines without a cost') : null,
          ),
          figure: formatMoney(row.cost),
        })),
      },
    ],
  };
}

function salesSplit(report: PeriodReports['sales-split']): ReportView {
  const sold = report.marketplace_total + report.local_total;
  return {
    totals: [
      { label: 'Marketplace units', value: formatQuantity(report.marketplace_total) },
      { label: 'Local units', value: formatQuantity(report.local_total) },
    ],
    charts: [
      {
        title: 'Units sold by channel',
        data:
          sold > 0
            ? [
                { label: 'Marketplace', value: report.marketplace_total },
                { label: 'Local', value: report.local_total },
              ]
            : [],
        tone: 'accent',
        empty: 'Nothing sold in this period',
      },
      {
        title: 'Units sold over time',
        data: sold > 0 ? grouped(report.by_day, day => day.marketplace + day.local) : [],
        tone: 'accent',
        empty: 'Nothing sold in this period',
      },
    ],
    sections: [
      {
        title: 'Products',
        empty: 'Nothing sold in this period.',
        rows: report.by_product.map(row => ({
          key: row.product_id,
          title: row.name,
          meta: join(row.sku, `marketplace ${formatQuantity(row.marketplace)}`, `local ${formatQuantity(row.local)}`),
          figure: formatQuantity(row.total),
        })),
      },
    ],
  };
}

function analytics(report: AnalyticsReport): ReportView {
  const moved = report.trend.some(point => point.in > 0 || point.out > 0);
  const moverRows = (rows: AnalyticsReport['fast_movers']): ReportRow[] =>
    rows.map(row => ({
      key: row.product_id,
      title: row.name,
      meta: join(row.sku, `${formatQuantity(row.out_quantity)} out`),
      figure: `${formatQuantity(row.daily_out)} a day`,
    }));
  return {
    totals: [],
    charts: [
      {
        title: 'Stock in',
        data: moved ? grouped(report.trend, point => point.in) : [],
        tone: 'in',
        empty: 'No stock came in',
      },
      {
        title: 'Stock out',
        data: moved ? grouped(report.trend, point => point.out) : [],
        tone: 'accent',
        empty: 'No stock went out',
      },
    ],
    sections: [
      {
        title: 'Best sellers',
        empty: 'Nothing sold in this period.',
        rows: report.best_sellers.map(row => ({
          key: row.product_id,
          title: row.name,
          meta: row.sku,
          figure: formatQuantity(row.quantity),
        })),
      },
      { title: 'Fast movers', empty: 'No product went out in this period.', rows: moverRows(report.fast_movers) },
      { title: 'Slow movers', empty: 'No active products.', rows: moverRows(report.slow_movers) },
    ],
  };
}

/** The view of any period report, picked by its name. */
export function buildReportView<R extends PeriodReportName>(report: R, data: PeriodReports[R]): ReportView {
  // Each case narrows `data` by the report's name; TypeScript cannot follow a generic through a switch, hence the casts.
  switch (report) {
    case 'stock-summary':
      return stockSummary(data as PeriodReports['stock-summary']);
    case 'valuation':
      return valuation(data as PeriodReports['valuation']);
    case 'movements-by-source':
      return movementsBySource(data as PeriodReports['movements-by-source']);
    case 'low-out-of-stock':
      return lowOutOfStock(data as PeriodReports['low-out-of-stock']);
    case 'supplier-purchases':
      return supplierPurchases(data as PeriodReports['supplier-purchases']);
    case 'sales-split':
      return salesSplit(data as PeriodReports['sales-split']);
    default:
      return analytics(data as AnalyticsReport);
  }
}
