import { cappedText, optionalNumber, positiveNumber, toNumberOrNull, toTextOrNull } from './formValues';
import { formatNet, formatSigned, stockStatus } from './format';

// The forms check on the phone what the API checks (backend/app/inventory/schemas.py): two decimals, below
// numeric(12, 2)'s limit, and the text caps.
describe('formValues', () => {
  it.each(['0', '12', '12.5', '12.55', ' 3 '])('optionalNumber accepts %p', value => {
    expect(optionalNumber.safeParse(value).success).toBe(true);
  });

  it.each(['12.555', '-1', '1e3', 'ten', '10000000000'])('optionalNumber refuses %p', value => {
    expect(optionalNumber.safeParse(value).success).toBe(false);
  });

  it('optionalNumber allows an empty field', () => {
    expect(optionalNumber.safeParse('').success).toBe(true);
  });

  it.each(['', '0', '0.00', '1.234', '10000000000'])('positiveNumber refuses %p', value => {
    expect(positiveNumber.safeParse(value).success).toBe(false);
  });

  it('positiveNumber accepts a fractional quantity', () => {
    expect(positiveNumber.safeParse('0.25').success).toBe(true);
  });

  it('cappedText counts what is left after trimming', () => {
    expect(cappedText(5).safeParse('  abcde  ').success).toBe(true);
    expect(cappedText(5).safeParse('abcdef').success).toBe(false);
  });

  it('turns typed text into what the API wants', () => {
    expect(toNumberOrNull(' 2.5 ')).toBe(2.5);
    expect(toNumberOrNull('  ')).toBeNull();
    expect(toTextOrNull('  shop ')).toBe('shop');
    expect(toTextOrNull('')).toBeNull();
  });
});

describe('format', () => {
  it('signs a ledger line and a net figure', () => {
    expect(formatSigned(3, 'in')).toBe('+3');
    expect(formatSigned(2.5, 'out')).toBe('−2.5');
    expect(formatNet(0)).toBe('0');
    expect(formatNet(-4)).toBe('−4');
  });

  it('gives a stock status by the SRDS §24 rule', () => {
    expect(stockStatus(0, 5)).toBe('out_of_stock');
    expect(stockStatus(5, 5)).toBe('low_stock');
    expect(stockStatus(6, 5)).toBe('in_stock');
  });
});
