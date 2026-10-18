import type { StatusOf } from '../../common/constants/status';

// How the inventory system writes numbers and dates. Quantities can be fractional (kg of seed), so up to two decimals.
// Money too: a cost price is stored to the paisa (numeric(12, 2)), and the app's formatRs rounds to whole rupees, which
// showed a cost of 3200.55 as "Rs 3,201" and put the valuation out by the sum of the roundings (B5 decision). Whole
// amounts read exactly as formatRs writes them ("Rs 3,200"); only an amount with paisa shows them ("Rs 3,200.55").
const QUANTITY = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 });
const RUPEES = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
const RUPEES_AND_PAISA = new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DATE_TIME = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', timeZone: 'UTC' });
const DAY_MONTH = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
// A report's days are UTC dates ("2026-10-11"), so they are written in UTC or a negative offset would show the day before.
const REPORT_DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function formatQuantity(quantity: number, unit?: string): string {
  return unit ? `${QUANTITY.format(quantity)} ${unit}` : QUANTITY.format(quantity);
}

/** A signed quantity for a ledger line: "+12" in, "−3" out. */
export function formatSigned(quantity: number, direction: 'in' | 'out'): string {
  return `${direction === 'in' ? '+' : '−'}${QUANTITY.format(quantity)}`;
}

/** A net figure that can go either way: "+12", "−3", "0". */
export function formatNet(quantity: number): string {
  if (quantity === 0) return QUANTITY.format(0);
  return `${quantity > 0 ? '+' : '−'}${QUANTITY.format(Math.abs(quantity))}`;
}

export function formatMoney(amount: number): string {
  const paisa = Math.round(amount * 100) % 100 !== 0;
  return `Rs ${(paisa ? RUPEES_AND_PAISA : RUPEES).format(amount)}`;
}

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

/** The day of the month of a trend point's date ("2026-10-11"), for the chart's labels. */
export function formatDay(isoDate: string): string {
  return DAY.format(new Date(isoDate));
}

/** A short day and month ("11/10") for a report chart's bars: unique across a whole year, unlike the day alone. */
export function formatDayMonth(isoDate: string): string {
  return DAY_MONTH.format(new Date(isoDate));
}

/** The inclusive days a report covers: "12 Sept 2026 – 11 Oct 2026". */
export function formatReportRange(from: string, to: string): string {
  const start = REPORT_DAY.format(new Date(from));
  const end = REPORT_DAY.format(new Date(to));
  return start === end ? start : `${start} – ${end}`;
}

/** A product's stock status by the SRDS §24 rule: nothing left is out; at or under its reorder threshold is low. For a
 * product as a whole, pass its default-location quantity (`productStatus`), as the alerts do. */
export function stockStatus(quantity: number, reorderThreshold: number): StatusOf<'stock'> {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= reorderThreshold) return 'low_stock';
  return 'in_stock';
}

/**
 * A product's status as the alert centre and the marketplace judge it: by the stock at the default location, the one
 * dispatch draws from (backend/app/inventory/alerts.py, D8), not the total over every location. Judging by the total
 * once showed "In stock" on a product while the header counted it as needing attention (B4 verification F3).
 */
export function productStatus(product: {
  default_location_quantity: number;
  reorder_threshold: number;
}): StatusOf<'stock'> {
  return stockStatus(product.default_location_quantity, product.reorder_threshold);
}
