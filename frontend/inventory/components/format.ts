import type { StatusOf } from '../../common/constants/status';

// How the inventory system writes numbers and dates. Quantities can be fractional (kg of seed), so up to two decimals.
// Money too: a cost price is stored to the paisa (numeric(12, 2)), and the app's formatRs rounds to whole rupees, which
// showed a cost of 3200.55 as "Rs 3,201" and put the valuation out by the sum of the roundings (B5 decision). Whole
// amounts read exactly as formatRs writes them ("Rs 3,200"); only an amount with paisa shows them ("Rs 3,200.55").
const QUANTITY = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 });
const RUPEES = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
const RUPEES_AND_PAISA = new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DATE_TIME = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
// DATE_TIME and DATE read a moment (a timestamp) in the phone's own time zone. A calendar date with no time
// ("2026-10-19", a purchase's day) is written as it is, in UTC, so no offset can move it to the day before (A8 run).
const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const CALENDAR_DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const CALENDAR_DAY_MONTH = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' });
const CALENDAR_ONLY = /^\d{4}-\d{2}-\d{2}$/;
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

/** A timestamp's date in the phone's time zone, or a calendar date ("2026-10-19") as it is. */
export function formatDate(iso: string): string {
  return CALENDAR_ONLY.test(iso) ? CALENDAR_DATE.format(new Date(iso)) : DATE.format(new Date(iso));
}

/** A calendar date as words for a screen reader: "2 October" (a chart's day, not "2"). */
export function formatSpokenDay(isoDate: string): string {
  return CALENDAR_DAY_MONTH.format(new Date(isoDate));
}

/** The phone's own date today, "YYYY-MM-DD": the day a purchase is entered on, as the dealer sees it. The server would
 * otherwise date it by UTC, and a purchase at 04:50 in Pakistan read as bought the day before (A8 run). */
export function localIsoDate(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The day of the month of a trend point's date ("2026-10-11"), for the chart's labels. */
export function formatDay(isoDate: string): string {
  return DAY.format(new Date(isoDate));
}

/** A short day and month ("11/10") for a report chart's bars: unique across a whole year, unlike the day alone. */
export function formatDayMonth(isoDate: string): string {
  return DAY_MONTH.format(new Date(isoDate));
}

/** The inclusive days a report covers: "12 Sept 2026 – 11 Oct 2026 (UTC days)". The API counts reports in whole UTC
 * days, so the label says so: around midnight in Pakistan they differ from the phone's dates (A8 run). */
export function formatReportRange(from: string, to: string): string {
  const start = REPORT_DAY.format(new Date(from));
  const end = REPORT_DAY.format(new Date(to));
  return `${start === end ? start : `${start} – ${end}`} (UTC days)`;
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

/** A count with its noun: "1 line", "3 lines" (never "1 lines"; A8 run). */
export function formatCount(count: number, one: string, many: string): string {
  return `${QUANTITY.format(count)} ${count === 1 ? one : many}`;
}
