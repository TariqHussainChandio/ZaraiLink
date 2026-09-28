import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { OrderCard } from './OrderCard';
import type { OrderWithItems } from '../types/orders';

const order = (overrides: Partial<OrderWithItems> = {}): OrderWithItems =>
  ({
    id: 'order-1',
    buyer_id: 'buyer-1',
    seller_id: 'seller-1',
    status: 'pending',
    product_subtotal: 500,
    delivery_charge: 0,
    total: 500,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    order_items: [{ id: 'item-1', order_id: 'order-1', listing_id: 'listing-1', quantity: 2, unit_price: 250, created_at: '2026-01-01T00:00:00.000Z', listing: { title: 'Wheat seeds', unit: 'kg' } }],
    buyer: { id: 'buyer-1', full_name: 'Ali Khan' },
    seller: { id: 'seller-1', full_name: 'Green Farms' },
    ...overrides,
  }) as OrderWithItems;

describe('OrderCard', () => {
  it('renders the counterparty name, item count, total, and status', async () => {
    await render(<OrderCard order={order()} counterpartyName="Green Farms" onPress={() => {}} />);
    expect(screen.getByText('Green Farms')).toBeTruthy();
    expect(screen.getByText('1 item · Rs. 500')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('pluralizes the item count for multiple items', async () => {
    await render(
      <OrderCard
        order={order({
          order_items: [
            { id: 'item-1', order_id: 'order-1', listing_id: 'listing-1', quantity: 2, unit_price: 250, created_at: '2026-01-01T00:00:00.000Z', listing: { title: 'Wheat seeds', unit: 'kg' } },
            { id: 'item-2', order_id: 'order-1', listing_id: 'listing-2', quantity: 1, unit_price: 100, created_at: '2026-01-01T00:00:00.000Z', listing: { title: 'Rice seeds', unit: 'kg' } },
          ] as never,
        })}
        counterpartyName="Green Farms"
        onPress={() => {}}
      />,
    );
    expect(screen.getByText('2 items · Rs. 500')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<OrderCard order={order()} counterpartyName="Green Farms" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Green Farms'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
