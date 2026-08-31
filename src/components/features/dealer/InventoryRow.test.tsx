import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { InventoryRow } from './InventoryRow';
import type { InventoryItemWithListing } from '../../../types/dealer';

const baseItem: InventoryItemWithListing = {
  id: 'i1',
  dealer_id: 'd1',
  listing_id: 'l1',
  stock_quantity: 50,
  unit: 'bag',
  purchase_cost: 400,
  selling_price: 500,
  min_stock_threshold: 10,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  listing: { id: 'l1', title: 'DAP Fertilizer' },
};

describe('InventoryRow', () => {
  it('renders the listing title, stock, and selling price', async () => {
    await render(<InventoryRow item={baseItem} onPress={() => {}} onAdjust={() => {}} onHistory={() => {}} />);
    expect(screen.getByText('DAP Fertilizer')).toBeTruthy();
    expect(screen.getByText('50 bag in stock')).toBeTruthy();
    expect(screen.getByText('Selling price: Rs. 500')).toBeTruthy();
  });

  it('falls back to "Unlinked stock item" when there is no linked listing', async () => {
    await render(
      <InventoryRow item={{ ...baseItem, listing: null }} onPress={() => {}} onAdjust={() => {}} onHistory={() => {}} />,
    );
    expect(screen.getByText('Unlinked stock item')).toBeTruthy();
  });

  it('shows a low stock badge when stock is at or below the threshold', async () => {
    await render(
      <InventoryRow
        item={{ ...baseItem, stock_quantity: 5 }}
        onPress={() => {}}
        onAdjust={() => {}}
        onHistory={() => {}}
      />,
    );
    expect(screen.getByText('Low stock')).toBeTruthy();
  });

  it('does not show a low stock badge when stock is above the threshold', async () => {
    await render(<InventoryRow item={baseItem} onPress={() => {}} onAdjust={() => {}} onHistory={() => {}} />);
    expect(screen.queryByText('Low stock')).toBeNull();
  });

  it('calls onPress, onAdjust, and onHistory independently', async () => {
    const onPress = jest.fn();
    const onAdjust = jest.fn();
    const onHistory = jest.fn();
    await render(<InventoryRow item={baseItem} onPress={onPress} onAdjust={onAdjust} onHistory={onHistory} />);
    await fireEvent.press(screen.getByText('DAP Fertilizer'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Adjust Stock'));
    expect(onAdjust).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('History'));
    expect(onHistory).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
