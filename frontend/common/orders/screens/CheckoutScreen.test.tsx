import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { CheckoutScreen } from './CheckoutScreen';
import { checkout } from '../services/ordersService';
import { ApiError } from '../../../services/api/errors';
import { useAuthStore } from '../../../state/authStore';
import { useCartStore, type CartItem } from '../../../state/cartStore';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

jest.mock('../services/ordersService', () => ({
  checkout: jest.fn(),
}));

const mockCheckout = checkout as jest.Mock;

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
  return {
    popToTop: jest.fn(),
  } as unknown as MarketplaceScreenProps<'Checkout'>['navigation'];
}

beforeEach(() => {
  mockCheckout.mockReset();
  useAuthStore.setState({ user: { id: 'user-1' } as never });
  useCartStore.setState({ items: [item()] });
});

describe('CheckoutScreen', () => {
  it('groups items by seller and shows the grand total', async () => {
    useCartStore.setState({
      items: [
        item({ price: 100, quantity: 2 }),
        item({
          listingId: 'listing-2',
          sellerId: 'seller-2',
          title: 'Rice seeds',
          price: 50,
          quantity: 1,
        }),
      ],
    });
    await renderWithQuery(
      <CheckoutScreen navigation={makeNavigation()} route={{} as never} />,
    );
    expect(screen.getByText('2 × Wheat seeds')).toBeTruthy();
    expect(screen.getByText('1 × Rice seeds')).toBeTruthy();
    expect(screen.getByText('Rs 250')).toBeTruthy();
  });

  it('adds a delivery charge into the total for that seller', async () => {
    await renderWithQuery(
      <CheckoutScreen navigation={makeNavigation()} route={{} as never} />,
    );
    await fireEvent.changeText(
      screen.getByLabelText('Delivery charge (optional)'),
      '50',
    );
    expect(screen.getByText('Rs 250')).toBeTruthy();
  });

  it('checks out, clears the cart, and pops to top on success', async () => {
    mockCheckout.mockResolvedValue([{ id: 'order-1' }]);
    const navigation = makeNavigation();
    await renderWithQuery(
      <CheckoutScreen navigation={navigation} route={{} as never} />,
    );
    await fireEvent.press(screen.getByText('Place Order'));

    expect(mockCheckout).toHaveBeenCalledWith([item()], { 'seller-1': 0 });
    expect(useCartStore.getState().items).toEqual([]);
    expect(await screen.findByText('Order placed')).toBeTruthy();
    expect(navigation.popToTop).toHaveBeenCalledTimes(1);
  });

  it('tells the buyer the quantity is short, keeps the cart, and never shows a stock figure', async () => {
    // The server's refusal names the listing, never the dealer's figure (SRDS §15); the app shows the message for the
    // stable code, so no number could reach the screen even if one were sent.
    mockCheckout.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'insufficient_stock',
        kind: 'validation',
        message: 'Not enough stock for Wheat seeds.',
      }),
    );
    const navigation = makeNavigation();
    await renderWithQuery(
      <CheckoutScreen navigation={navigation} route={{} as never} />,
    );
    await fireEvent.press(screen.getByText('Place Order'));

    expect(
      await screen.findByText('That quantity is not available.'),
    ).toBeTruthy();
    expect(useCartStore.getState().items).toEqual([item()]);
    expect(navigation.popToTop).not.toHaveBeenCalled();
  });
});
