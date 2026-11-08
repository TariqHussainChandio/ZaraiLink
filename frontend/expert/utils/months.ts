/** One month of the analytics API: `month` is "YYYY-MM". */
interface MonthlyPoint {
  month: string;
  value: number;
}

/** "2026-03" as a number of months, so a range of months is a range of integers. */
const toIndex = (key: string) => Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1);
const toKey = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

const MAX_MONTHS = 6;

/** The analytics API sends only the months that had a consultation. A chart that skips them draws March beside May as
 * if nothing sat between, so this fills every month from the first one with data up to the current month with 0, and
 * keeps the latest six (the span the API itself caps at). */
export function withEmptyMonths(points: MonthlyPoint[], now: Date = new Date()): MonthlyPoint[] {
  if (points.length === 0) return [];
  const byKey = new Map(points.map(point => [point.month, point.value]));
  const first = Math.min(...points.map(point => toIndex(point.month)));
  const current = now.getFullYear() * 12 + now.getMonth();
  const last = Math.max(current, ...points.map(point => toIndex(point.month)));
  const from = Math.max(first, last - (MAX_MONTHS - 1));
  const filled: MonthlyPoint[] = [];
  for (let index = from; index <= last; index += 1) {
    const month = toKey(index);
    filled.push({ month, value: byKey.get(month) ?? 0 });
  }
  return filled;
}
