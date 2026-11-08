import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { OrderCard } from './OrderCard';
import type { OrderWithItems } from '../types/orders';

const item = (n: number, title = `Seed ${n}`) => ({
  id: `item-${n}`,
  order_id: 'order-1',
  listing_id: `listing-${n}`,
  quantity: n,
  unit_price: 250,
  created_at: '2026-01-01T12:00:00.000Z',
  listing: { title, unit: 'kg' },
});

const order = (overrides: Partial<OrderWithItems> = {}): OrderWithItems =>
  ({
    id: 'order-1',
    buyer_id: 'buyer-1',
    seller_id: 'seller-1',
    status: 'pending',
    product_subtotal: 500,
    delivery_charge: 0,
    total: 500,
    created_at: '2026-01-01T12:00:00.000Z',
    updated_at: '2026-01-01T12:00:00.000Z',
    order_items: [item(2, 'Wheat seeds')],
    buyer: { id: 'buyer-1', full_name: 'Ali Khan' },
    seller: { id: 'seller-1', full_name: 'Green Farms' },
    ...overrides,
  }) as OrderWithItems;

describe('OrderCard', () => {
  it('renders who it is with, what was bought, the day, the total and the status', async () => {
    await render(<OrderCard order={order()} counterpartyName="Green Farms" onPress={() => {}} />);
    expect(screen.getByText('Green Farms')).toBeTruthy();
    // The day follows the app's format ("1 Jan", with the year when it is not this one), never the phone's locale.
    expect(screen.getByText(/^2 × Wheat seeds · 1 Jan/)).toBeTruthy();
    expect(screen.getByText('Rs 500')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('lists up to two items and counts the rest', async () => {
    await render(<OrderCard order={order({ order_items: [item(1), item(2), item(3), item(4)] as never })} counterpartyName="Green Farms" onPress={() => {}} />);
    expect(screen.getByText(/^1 × Seed 1, 2 × Seed 2 and 2 more · /)).toBeTruthy();
  });

  it('names a removed listing instead of leaving a blank', async () => {
    const removed = { ...item(1), listing_id: null, listing: null };
    await render(<OrderCard order={order({ order_items: [removed] as never })} counterpartyName="Green Farms" onPress={() => {}} />);
    expect(screen.getByText(/^1 × Listing removed · /)).toBeTruthy();
  });

  it('reads the total and the status aloud from the row, in the status word', async () => {
    await render(<OrderCard order={order({ status: 'payment_failed' })} counterpartyName="Green Farms" onPress={() => {}} />);
    // No label overrides the row, so TalkBack reads every text inside it: name, items, total and status.
    expect(screen.getByRole('button').props.accessibilityLabel).toBeUndefined();
    expect(screen.getByText('Rs 500')).toBeTruthy();
    expect(screen.getByText('Payment failed')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<OrderCard order={order()} counterpartyName="Green Farms" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Green Farms'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
