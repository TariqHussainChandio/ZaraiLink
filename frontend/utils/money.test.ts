import { formatRs } from './money';

describe('formatRs', () => {
  it.each([
    [950, 'Rs 950'],
    [12450, 'Rs 12,450'],
    [124500, 'Rs 124,500'],
    [0, 'Rs 0'],
    [1499.6, 'Rs 1,500'],
  ])('formats %p as %p', (amount, expected) => {
    expect(formatRs(amount)).toBe(expected);
  });
});
