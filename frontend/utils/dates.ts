// Dates in the design system's format (D15, Rate Board: "Content", "Dates"): "12 Nov", "12 Nov 2025" for another year,
// "Today, 2:05 pm", "Yesterday, 2:05 pm", "2 h ago". Every date the app shows goes through here, never through
// `toLocaleString()`, whose output changes with the phone's language and Android version.
//
// The words come from en-PK `Intl` (Hermes ships it on Android); the time is assembled from its parts, so it reads
// "2:05 pm" whether the phone's ICU separates the period with a space or a narrow no-break space, and in whatever case.
// `timeZone` defaults to the phone's own; tests pass one so they never depend on the machine they run on.

const LOCALE = 'en-PK';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** What every formatter accepts: a Date, an ISO string from the API, or epoch milliseconds. */
export type DateInput = Date | string | number;

export interface DateOptions {
  /** "Now" for Today/Yesterday and "ago"; the current time by default. */
  now?: Date;
  /** An IANA zone such as "Asia/Karachi"; the phone's zone by default. */
  timeZone?: string;
}

/** Shown in place of a date the app could not read: never "Invalid Date". */
export const UNKNOWN_DATE = '—';

function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parts(date: Date, options: Intl.DateTimeFormatOptions, timeZone?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat(LOCALE, { ...options, timeZone }).formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}

/** The calendar day in the zone, as "2025-11-12", so two instants compare by the day a person sees on the wall. */
function dayKey(date: Date, timeZone?: string): string {
  const p = parts(date, { year: 'numeric', month: '2-digit', day: '2-digit' }, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "12 Nov", or "12 Nov 2025" when the year is not this one. */
export function formatDay(value: DateInput, { now = new Date(), timeZone }: DateOptions = {}): string {
  const date = toDate(value);
  if (!date) return UNKNOWN_DATE;
  const p = parts(date, { day: 'numeric', month: 'short', year: 'numeric' }, timeZone);
  const thisYear = parts(now, { year: 'numeric' }, timeZone).year;
  return p.year === thisYear ? `${p.day} ${p.month}` : `${p.day} ${p.month} ${p.year}`;
}

/** "2:05 pm". */
export function formatTime(value: DateInput, { timeZone }: Pick<DateOptions, 'timeZone'> = {}): string {
  const date = toDate(value);
  if (!date) return UNKNOWN_DATE;
  const p = parts(date, { hour: 'numeric', minute: '2-digit', hour12: true }, timeZone);
  return `${p.hour}:${p.minute} ${(p.dayPeriod ?? '').toLowerCase()}`.trim();
}

/** "Today, 2:05 pm", "Yesterday, 2:05 pm", otherwise the day ("12 Nov", "12 Nov 2025"). For a message, an order step,
 * a notification: anything where the time of day matters while it is recent. */
export function formatWhen(value: DateInput, options: DateOptions = {}): string {
  const date = toDate(value);
  if (!date) return UNKNOWN_DATE;
  const now = options.now ?? new Date();
  const day = dayKey(date, options.timeZone);
  if (day === dayKey(now, options.timeZone)) return `Today, ${formatTime(date, options)}`;
  if (day === dayKey(new Date(now.getTime() - DAY), options.timeZone)) return `Yesterday, ${formatTime(date, options)}`;
  return formatDay(date, { ...options, now });
}

/** "Just now", "5 min ago", "2 h ago" within a day; after that the day itself ("12 Nov"). A date in the future (a phone
 * whose clock runs slow) reads as "Just now", never "-3 min ago". */
export function formatAgo(value: DateInput, options: DateOptions = {}): string {
  const date = toDate(value);
  if (!date) return UNKNOWN_DATE;
  const now = options.now ?? new Date();
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return 'Just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  return formatDay(date, { ...options, now });
}

/** A month's short name for a chart axis: "Nov". Accepts a date or a "2025-11" month key, as the analytics API sends. */
export function formatMonth(value: DateInput, { timeZone }: Pick<DateOptions, 'timeZone'> = {}): string {
  // "2025-11" alone is read as UTC midnight on the 1st, which is the previous month west of Greenwich; the 15th is the
  // same month in every zone.
  const date = typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) ? toDate(`${value}-15T12:00:00Z`) : toDate(value);
  if (!date) return UNKNOWN_DATE;
  return parts(date, { month: 'short' }, timeZone).month ?? UNKNOWN_DATE;
}
