import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { InventoryRow } from './InventoryRow';
import type { InventoryItemWithListing } from '../types/dealer';

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

const noop = () => {};

describe('InventoryRow', () => {
  it('renders the name, the quantity, and the price per unit', async () => {
    await render(<InventoryRow item={baseItem} onPress={noop} onAdjust={noop} onHistory={noop} />);
    expect(screen.getByText('DAP Fertilizer')).toBeTruthy();
    expect(screen.getByText('50 bags')).toBeTruthy();
    expect(screen.getByText('Rs 500 per bag')).toBeTruthy();
    expect(screen.getByText('In stock')).toBeTruthy();
  });

  it('falls back to "Unlinked stock item" when there is no linked listing', async () => {
    await render(<InventoryRow item={{ ...baseItem, listing: null }} onPress={noop} onAdjust={noop} onHistory={noop} />);
    expect(screen.getByText('Unlinked stock item')).toBeTruthy();
  });

  it('shows Low stock at or below the threshold and Out of stock at zero', async () => {
    const { rerender } = await render(
      <InventoryRow item={{ ...baseItem, stock_quantity: 5 }} onPress={noop} onAdjust={noop} onHistory={noop} />,
    );
    expect(screen.getByText('Low stock')).toBeTruthy();
    await rerender(<InventoryRow item={{ ...baseItem, stock_quantity: 0 }} onPress={noop} onAdjust={noop} onHistory={noop} />);
    expect(screen.getByText('Out of stock')).toBeTruthy();
    expect(screen.queryByText('Low stock')).toBeNull();
  });

  it('names the item on each button, as a screen reader hears them', async () => {
    await render(<InventoryRow item={baseItem} onPress={noop} onAdjust={noop} onHistory={noop} />);
    expect(screen.getByRole('button', { name: 'Record stock for DAP Fertilizer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'See stock history for DAP Fertilizer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit DAP Fertilizer, 50 bags, In stock' })).toBeTruthy();
  });

  it('calls onPress, onAdjust, and onHistory independently', async () => {
    const onPress = jest.fn();
    const onAdjust = jest.fn();
    const onHistory = jest.fn();
    await render(<InventoryRow item={baseItem} onPress={onPress} onAdjust={onAdjust} onHistory={onHistory} />);
    await fireEvent.press(screen.getByText('DAP Fertilizer'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Record stock'));
    expect(onAdjust).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('See history'));
    expect(onHistory).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
