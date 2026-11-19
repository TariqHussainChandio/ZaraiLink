import { withEmptyMonths } from './months';

const NOW = new Date(2026, 10, 8); // 8 Nov 2026

describe('withEmptyMonths', () => {
  it('fills the months in between and up to now with zero', () => {
    expect(
      withEmptyMonths(
        [
          { month: '2026-08', value: 3 },
          { month: '2026-10', value: 5 },
        ],
        NOW,
      ),
    ).toEqual([
      { month: '2026-08', value: 3 },
      { month: '2026-09', value: 0 },
      { month: '2026-10', value: 5 },
      { month: '2026-11', value: 0 },
    ]);
  });

  it('crosses a year boundary', () => {
    expect(withEmptyMonths([{ month: '2025-12', value: 1 }], new Date(2026, 1, 3)).map(point => point.month)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('keeps only the latest six months', () => {
    const months = withEmptyMonths([{ month: '2026-01', value: 1 }], NOW);
    expect(months).toHaveLength(6);
    expect(months[0]?.month).toBe('2026-06');
    expect(months[5]?.month).toBe('2026-11');
  });

  it('draws nothing when there is no data, so the chart can say so', () => {
    expect(withEmptyMonths([], NOW)).toEqual([]);
  });
});
