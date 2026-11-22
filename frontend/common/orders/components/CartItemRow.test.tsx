import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { lightTheme } from '../../../theme';
import { CartItemRow } from './CartItemRow';
import type { CartItem } from '../../../state/cartStore';

const item: CartItem = {
  listingId: 'listing-1',
  sellerId: 'seller-1',
  title: 'Wheat seeds',
  price: 100,
  unit: 'kg',
  image: null,
  quantity: 2,
};

const base = { item, price: 100, onQuantityChange: () => {}, onRemove: () => {} };

describe('CartItemRow', () => {
  it('renders the title, price per unit, quantity and the line total', async () => {
    await render(<CartItemRow {...base} />);
    expect(screen.getByText('Wheat seeds')).toBeTruthy();
    expect(screen.getByText('Rs 100 per kg')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Rs 200')).toBeTruthy();
  });

  it("shows today's price, and what it was when the item was added", async () => {
    await render(<CartItemRow {...base} price={120} />);
    expect(screen.getByText('Rs 120 per kg')).toBeTruthy();
    expect(screen.getByText('Was Rs 100 when you added it')).toBeTruthy();
    expect(screen.getByText('Rs 240')).toBeTruthy();
  });

  it('says nothing about a price that did not change', async () => {
    await render(<CartItemRow {...base} />);
    expect(screen.queryByText(/when you added it/)).toBeNull();
  });

  it('names the stepper buttons and Remove for TalkBack', async () => {
    await render(<CartItemRow {...base} />);
    expect(screen.getByRole('button', { name: 'One more kg' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'One fewer kg' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Wheat seeds from the cart' })).toBeTruthy();
  });

  it('gives Remove a full 48 dp target', async () => {
    await render(<CartItemRow {...base} />);
    const remove = screen.getByRole('button', { name: 'Remove Wheat seeds from the cart' });
    expect(StyleSheet.flatten(remove.props.style).width).toBe(lightTheme.size.touchMin);
  });

  it('sets any quantity: + adds one, and a typed 50 is 50 (MK-02)', async () => {
    const onQuantityChange = jest.fn();
    await render(<CartItemRow {...base} onQuantityChange={onQuantityChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'One more kg' }));
    expect(onQuantityChange).toHaveBeenLastCalledWith(3);
    await fireEvent.press(screen.getByRole('button', { name: '2 kgs' }));
    const box = screen.getByLabelText('Number of kgs');
    await fireEvent.changeText(box, '50');
    await fireEvent(box, 'submitEditing');
    expect(onQuantityChange).toHaveBeenLastCalledWith(50);
  });

  it('stops at 1 instead of deleting the line', async () => {
    const onQuantityChange = jest.fn();
    await render(<CartItemRow {...base} item={{ ...item, quantity: 1 }} onQuantityChange={onQuantityChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'One fewer kg' }));
    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  it('calls onRemove when Remove is pressed', async () => {
    const onRemove = jest.fn();
    await render(<CartItemRow {...base} onRemove={onRemove} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Wheat seeds from the cart' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
