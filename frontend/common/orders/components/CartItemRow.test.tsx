import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
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

describe('CartItemRow', () => {
  it('renders the title, price, and quantity', async () => {
    await render(<CartItemRow item={item} onIncrement={() => {}} onDecrement={() => {}} onRemove={() => {}} />);
    expect(screen.getByText('Wheat seeds')).toBeTruthy();
    expect(screen.getByText('Rs. 100 / kg')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('calls onIncrement when + is pressed', async () => {
    const onIncrement = jest.fn();
    await render(<CartItemRow item={item} onIncrement={onIncrement} onDecrement={() => {}} onRemove={() => {}} />);
    fireEvent.press(screen.getByText('+'));
    expect(onIncrement).toHaveBeenCalledTimes(1);
  });

  it('calls onDecrement when − is pressed', async () => {
    const onDecrement = jest.fn();
    await render(<CartItemRow item={item} onIncrement={() => {}} onDecrement={onDecrement} onRemove={() => {}} />);
    fireEvent.press(screen.getByText('−'));
    expect(onDecrement).toHaveBeenCalledTimes(1);
  });

  it('calls onRemove when Remove is pressed', async () => {
    const onRemove = jest.fn();
    await render(<CartItemRow item={item} onIncrement={() => {}} onDecrement={() => {}} onRemove={onRemove} />);
    fireEvent.press(screen.getByText('Remove'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
