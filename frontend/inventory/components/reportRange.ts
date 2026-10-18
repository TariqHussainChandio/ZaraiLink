import type { ReportRange } from '../types/inventory';

/** The periods a dealer picks a report by: rolling days, or a calendar month. */
export type RangePreset = '7' | '30' | '90' | 'this-month' | 'last-month';

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/**
 * The inclusive days of a preset. The API counts whole UTC days (backend/app/inventory/reports.py, report_period), so
 * "today" here is the UTC date too: between midnight and 05:00 in Pakistan the local date is a day ahead of the
 * server's, and a local "today" would ask for a day that has not started on the server. `Date.UTC` rolls a month of
 * -1 or a day of 0 back into the previous month or year, which gives last month's first and last days.
 */
export function rangeFor(preset: RangePreset, now: Date = new Date()): ReportRange {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const today = Date.UTC(year, month, now.getUTCDate());
  switch (preset) {
    case 'this-month':
      return { from: isoDay(Date.UTC(year, month, 1)), to: isoDay(today) };
    case 'last-month':
      return { from: isoDay(Date.UTC(year, month - 1, 1)), to: isoDay(Date.UTC(year, month, 0)) };
    default:
      return { from: isoDay(today - (Number(preset) - 1) * DAY_MS), to: isoDay(today) };
  }
}
