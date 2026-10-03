import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PriceBreakdown } from './PriceBreakdown';

describe('PriceBreakdown', () => {
  it('shows products, the delivery charge and the total on their own lines (BR-09)', async () => {
    await render(<PriceBreakdown itemsLabel="Products (3 bags of urea)" subtotal={14250} delivery={800} />);
    expect(screen.getByLabelText('Products (3 bags of urea) Rs 14,250')).toBeTruthy();
    expect(screen.getByLabelText('Delivery charge Rs 800')).toBeTruthy();
    expect(screen.getByLabelText('Total Rs 15,050')).toBeTruthy();
    // Each line is its own accessible stop, so Android keeps its label (a layout-only view is flattened away).
    expect(screen.getByLabelText('Delivery charge Rs 800').props.accessible).toBe(true);
    expect(screen.getByLabelText('Total Rs 15,050').props.accessible).toBe(true);
  });

  it('keeps the delivery line when the charge is zero', async () => {
    await render(<PriceBreakdown subtotal={2500} delivery={0} />);
    expect(screen.getByLabelText('Delivery charge Rs 0')).toBeTruthy();
    expect(screen.getByLabelText('Total Rs 2,500')).toBeTruthy();
  });

  it('shows the total the order records when it is given', async () => {
    await render(<PriceBreakdown subtotal={2500} delivery={300} total={2750} />);
    expect(screen.getByLabelText('Total Rs 2,750')).toBeTruthy();
  });

  it('names who is paid, directly', async () => {
    await render(<PriceBreakdown subtotal={2500} delivery={300} payTo="Pay the seller directly, in cash on delivery" />);
    expect(screen.getByText('Pay the seller directly, in cash on delivery')).toBeTruthy();
  });
});
