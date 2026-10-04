import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CartScreen } from './CartScreen';
import { useCartStore, type CartItem } from '../../../state/cartStore';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

const item = (overrides: Partial<CartItem> = {}): CartItem => ({
  listingId: 'listing-1',
  sellerId: 'seller-1',
  title: 'Wheat seeds',
  price: 100,
  unit: 'kg',
  image: null,
  quantity: 2,
  ...overrides,
});

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as MarketplaceScreenProps<'Cart'>['navigation'];
}

beforeEach(() => {
  useCartStore.setState({ items: [] });
});

describe('CartScreen', () => {
  it('shows an empty state when the cart has no items', async () => {
    await render(<CartScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByText('Your cart is empty')).toBeTruthy();
  });

  it('lists items and shows the running total', async () => {
    useCartStore.setState({
      items: [item({ price: 100, quantity: 2 }), item({ listingId: 'listing-2', title: 'Rice seeds', price: 50, quantity: 3 })],
    });
    await render(<CartScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByText('Wheat seeds')).toBeTruthy();
    expect(screen.getByText('Rice seeds')).toBeTruthy();
    expect(screen.getByText('Rs 350')).toBeTruthy();
  });

  it('increments, decrements, and removes items through the store', async () => {
    useCartStore.setState({ items: [item({ quantity: 2 })] });
    await render(<CartScreen navigation={makeNavigation()} route={{} as never} />);

    await fireEvent.press(screen.getByText('+'));
    expect(useCartStore.getState().items[0]?.quantity).toBe(3);

    await fireEvent.press(screen.getByText('−'));
    expect(useCartStore.getState().items[0]?.quantity).toBe(2);

    await fireEvent.press(screen.getByText('Remove'));
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('navigates to Checkout', async () => {
    useCartStore.setState({ items: [item()] });
    const navigation = makeNavigation();
    await render(<CartScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByText('Checkout'));
    expect(navigation.navigate).toHaveBeenCalledWith(MARKETPLACE_ROUTES.Checkout);
  });
});
