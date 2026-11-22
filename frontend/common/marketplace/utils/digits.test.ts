import { digitsOnly, parseWhole } from './digits';

describe('digitsOnly', () => {
  it.each([
    ['1,500', '1500'],
    ['Rs 1500', '1500'],
    ['1 500', '1500'],
    ['abc', ''],
    ['', ''],
  ])('keeps the digits of "%s"', (typed, expected) => {
    expect(digitsOnly(typed)).toBe(expected);
  });
});

describe('parseWhole', () => {
  it('reads "1,500" as 1500, never as 0 or NaN (MK-04, MK-10)', () => {
    expect(parseWhole('1,500')).toBe(1500);
  });

  it('is null, not 0, when nothing numeric was typed', () => {
    expect(parseWhole('')).toBeNull();
    expect(parseWhole('Rs')).toBeNull();
  });

  it('keeps a typed zero as zero', () => {
    expect(parseWhole('0')).toBe(0);
  });
});
