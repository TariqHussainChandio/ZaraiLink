import { formatQuantity, stockLevel } from './stock';

describe('stockLevel', () => {
  it('is out of stock at zero, low at or under the threshold, otherwise in stock', () => {
    expect(stockLevel({ stock_quantity: 0, min_stock_threshold: 0 })).toBe('out_of_stock');
    expect(stockLevel({ stock_quantity: 5, min_stock_threshold: 5 })).toBe('low_stock');
    expect(stockLevel({ stock_quantity: 6, min_stock_threshold: 5 })).toBe('in_stock');
  });
});

describe('formatQuantity', () => {
  it('pluralises a unit word, groups thousands, and leaves abbreviations alone', () => {
    expect(formatQuantity(12, 'bag')).toBe('12 bags');
    expect(formatQuantity(1, 'bag')).toBe('1 bag');
    expect(formatQuantity(1200, 'kg')).toBe('1,200 kg');
    expect(formatQuantity(3, 'Bags')).toBe('3 bags');
  });
});
