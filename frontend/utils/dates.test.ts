import { formatAgo, formatDay, formatMonth, formatTime, formatWhen, UNKNOWN_DATE } from './dates';

// A fixed clock and zone, so the tests read the same on any machine: 12 Nov 2025, 2:05 pm in Pakistan (UTC+5).
const timeZone = 'Asia/Karachi';
const now = new Date('2025-11-12T09:05:00Z');
const at = (iso: string) => new Date(iso);

describe('formatDay', () => {
  it('gives the day and month this year, and adds the year otherwise', () => {
    expect(formatDay(at('2025-11-03T06:00:00Z'), { now, timeZone })).toBe('3 Nov');
    expect(formatDay('2024-11-12T06:00:00Z', { now, timeZone })).toBe('12 Nov 2024');
  });

  it('counts the day in the given zone, not in UTC', () => {
    // 11 Nov 21:30 UTC is already 12 Nov 2:30 am in Pakistan.
    expect(formatDay('2025-11-11T21:30:00Z', { now, timeZone })).toBe('12 Nov');
  });

  it('never shows "Invalid Date"', () => {
    expect(formatDay('not a date', { now, timeZone })).toBe(UNKNOWN_DATE);
  });
});

describe('formatTime', () => {
  it('reads as a 12-hour clock with a lower-case period', () => {
    expect(formatTime(now, { timeZone })).toBe('2:05 pm');
    expect(formatTime('2025-11-12T03:40:00Z', { timeZone })).toBe('8:40 am');
  });
});

describe('formatWhen', () => {
  it('says Today and Yesterday with the time, and the day before that', () => {
    expect(formatWhen('2025-11-12T04:00:00Z', { now, timeZone })).toBe('Today, 9:00 am');
    expect(formatWhen('2025-11-11T09:05:00Z', { now, timeZone })).toBe('Yesterday, 2:05 pm');
    expect(formatWhen('2025-11-10T09:05:00Z', { now, timeZone })).toBe('10 Nov');
    expect(formatWhen('2024-12-31T09:05:00Z', { now, timeZone })).toBe('31 Dec 2024');
  });

  it('takes epoch milliseconds as well as dates and strings', () => {
    expect(formatWhen(now.getTime(), { now, timeZone })).toBe('Today, 2:05 pm');
  });
});

describe('formatAgo', () => {
  it('counts minutes and hours within a day, then gives the day', () => {
    expect(formatAgo('2025-11-12T09:04:30Z', { now, timeZone })).toBe('Just now');
    expect(formatAgo('2025-11-12T08:50:00Z', { now, timeZone })).toBe('15 min ago');
    expect(formatAgo('2025-11-12T07:05:00Z', { now, timeZone })).toBe('2 h ago');
    expect(formatAgo('2025-11-10T07:05:00Z', { now, timeZone })).toBe('10 Nov');
  });

  it('reads a time ahead of the phone clock as just now, never as a negative count', () => {
    expect(formatAgo('2025-11-12T09:10:00Z', { now, timeZone })).toBe('Just now');
  });
});

describe('formatMonth', () => {
  it('names the month of a date or of a "2025-11" month key, whatever the zone', () => {
    expect(formatMonth('2025-11', { timeZone })).toBe('Nov');
    expect(formatMonth('2025-01', { timeZone: 'America/Los_Angeles' })).toBe('Jan');
    expect(formatMonth(now, { timeZone })).toBe('Nov');
  });
});
