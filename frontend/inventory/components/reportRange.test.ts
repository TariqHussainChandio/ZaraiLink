import { formatMoney } from './format';
import { RANGE_PRESETS, rangeFor } from './reportRange';

// The API's `from` and `to` are inclusive UTC days, "YYYY-MM-DD" (the B4 D3 lesson: a timestamp is refused with 422).
const DAY = /^\d{4}-\d{2}-\d{2}$/;

describe('rangeFor', () => {
  const midOctober = new Date('2026-10-18T09:00:00Z');

  it.each(RANGE_PRESETS.map(preset => preset.value))('gives %s as two dates, never timestamps', preset => {
    const range = rangeFor(preset, midOctober);
    expect(range.from).toMatch(DAY);
    expect(range.to).toMatch(DAY);
    expect(range.from <= range.to).toBe(true);
  });

  it('counts rolling days inclusively, ending today', () => {
    expect(rangeFor('7', midOctober)).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(rangeFor('30', midOctober)).toEqual({ from: '2026-09-19', to: '2026-10-18' });
    expect(rangeFor('90', midOctober)).toEqual({ from: '2026-07-21', to: '2026-10-18' });
  });

  it('gives this month to date and the whole of last month', () => {
    expect(rangeFor('this-month', midOctober)).toEqual({ from: '2026-10-01', to: '2026-10-18' });
    expect(rangeFor('last-month', midOctober)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('rolls last month back over the new year, and knows February', () => {
    expect(rangeFor('last-month', new Date('2027-01-05T12:00:00Z'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(rangeFor('last-month', new Date('2028-03-10T12:00:00Z'))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('uses the UTC day, as the server does, even after midnight in Pakistan', () => {
    // 02:00 on 1 November in Karachi is still 31 October on the server.
    const earlyKarachi = new Date('2026-10-31T21:00:00Z');
    expect(rangeFor('this-month', earlyKarachi)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
});

describe('formatMoney (B5: paisa where the amount has them)', () => {
  it('writes whole rupees as the rest of the app does', () => {
    expect(formatMoney(3200)).toBe('Rs 3,200');
    expect(formatMoney(125000)).toBe('Rs 125,000');
  });

  it('keeps the paisa of a cost price instead of rounding them away', () => {
    expect(formatMoney(3200.55)).toBe('Rs 3,200.55');
    expect(formatMoney(118420.35)).toBe('Rs 118,420.35');
    expect(formatMoney(0.5)).toBe('Rs 0.50');
  });
});
