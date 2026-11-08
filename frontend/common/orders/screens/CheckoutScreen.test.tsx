import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../testUtils/renderWithProviders';
import { CheckoutScreen } from './CheckoutScreen';
import { checkout } from '../services/ordersService';
import { initiatePayment } from '../../payments/services/paymentsService';
import { fetchListingById } from '../../marketplace/services/listingsService';
import { useAuthStore } from '../../../state/authStore';
import { useCartStore, type CartItem } from '../../../state/cartStore';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

jest.mock('../services/ordersService', () => ({
  checkout: jest.fn(),
}));
jest.mock('../../payments/services/paymentsService', () => ({
  initiatePayment: jest.fn(),
}));
jest.mock('../../marketplace/services/listingsService', () => ({
  fetchListingById: jest.fn(),
}));

const mockCheckout = checkout as jest.Mock;
const mockInitiatePayment = initiatePayment as jest.Mock;
const mockFetchListingById = fetchListingById as jest.Mock;

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

const SELLERS: Record<string, { name: string; city: string }> = {
  'seller-1': { name: 'Chaudhry Seeds', city: 'Sargodha' },
  'seller-2': { name: 'Nadia Batool', city: 'Okara' },
};

function makeNavigation() {
  return { popToTop: jest.fn(), navigate: jest.fn() } as unknown as MarketplaceScreenProps<'Checkout'>['navigation'];
}

const placed = (id: string, sellerId: string, total: number) => ({ id, seller_id: sellerId, total, status: 'pending' });

beforeEach(() => {
  mockCheckout.mockReset();
  mockInitiatePayment.mockReset().mockResolvedValue({ id: 'payment-1' });
  mockFetchListingById.mockReset();
  mockFetchListingById.mockImplementation(async (id: string) => {
    const found = useCartStore.getState().items.find(candidate => candidate.listingId === id) ?? item();
    const seller = SELLERS[found.sellerId]!;
    return {
      id,
      owner_id: found.sellerId,
      price: found.price,
      unit: found.unit,
      title: found.title,
      owner: { id: found.sellerId, full_name: seller.name, avatar_url: null },
      location: { country: 'Pakistan', province: 'Punjab', city: seller.city },
    };
  });
  useAuthStore.setState({ user: { id: 'user-1' } as never });
  useCartStore.setState({ items: [item()] });
});

describe('CheckoutScreen', () => {
  it('titles each section with the seller and town, and puts the grand total on the plate', async () => {
    useCartStore.setState({
      items: [
        item({ price: 100, quantity: 2 }),
        item({ listingId: 'listing-2', sellerId: 'seller-2', title: 'Rice seeds', price: 50, quantity: 1 }),
      ],
    });
    await renderWithProviders(<CheckoutScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByText('Chaudhry Seeds · Sargodha')).toBeTruthy();
    expect(await screen.findByText('Nadia Batool · Okara')).toBeTruthy();
    expect(screen.getByText('2 kg × Wheat seeds')).toBeTruthy();
    expect(screen.getByText('1 kg × Rice seeds')).toBeTruthy();
    expect(screen.getByLabelText('Rs 250, Total with delivery')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Place 2 orders' })).toBeTruthy();
  });

  it('shows delivery as its own line with who is paid (BR-09, BR-11)', async () => {
    await renderWithProviders(<CheckoutScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Chaudhry Seeds · Sargodha');

    expect(screen.getByLabelText('Products Rs 200')).toBeTruthy();
    expect(screen.getByLabelText('Delivery charge Rs 0')).toBeTruthy();
    expect(screen.getByText('You pay Chaudhry Seeds directly. ZaraiLink does not hold your money.')).toBeTruthy();
  });

  it('asks for the delivery charge with an Rs prefix and says what to enter', async () => {
    await renderWithProviders(<CheckoutScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Chaudhry Seeds · Sargodha');
    expect(screen.getAllByText('Rs').length).toBeGreaterThan(0);
    expect(screen.getByText('What you agreed with Chaudhry Seeds. Leave empty if you collect.')).toBeTruthy();
  });

  it('reads a delivery charge of "1,500" as 1500, never as 0 (MK-04)', async () => {
    await renderWithProviders(<CheckoutScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Chaudhry Seeds · Sargodha');

    await fireEvent.changeText(screen.getByLabelText('Delivery charge'), '1,500');

    expect(screen.getByDisplayValue('1500')).toBeTruthy();
    expect(screen.getByLabelText('Delivery charge Rs 1,500')).toBeTruthy();
    expect(screen.getByLabelText('Rs 1,700, Total with delivery')).toBeTruthy();
  });

  it('offers Cash on delivery as chosen, and Bank transfer disabled with its reason (MK-05)', async () => {
    await renderWithProviders(<CheckoutScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Chaudhry Seeds · Sargodha');

    expect(screen.getByLabelText('How will you pay Chaudhry Seeds?').props.accessibilityRole).toBe('radiogroup');
    const cash = screen.getByRole('radio', { name: /^Cash on delivery/ });
    expect(cash.props.accessibilityState).toMatchObject({ checked: true });
    const bank = screen.getByRole('radio', { name: /^Bank transfer/ });
    expect(bank.props.accessibilityState).toMatchObject({ checked: false, disabled: true });
    expect(screen.getByText('Not offered by this seller yet')).toBeTruthy();
  });

  it("charges today's price, not the one saved in the cart", async () => {
    mockFetchListingById.mockResolvedValue({
      id: 'listing-1',
      owner_id: 'seller-1',
      price: 120,
      unit: 'kg',
      title: 'Wheat seeds',
      owner: { id: 'seller-1', full_name: 'Chaudhry Seeds', avatar_url: null },
      location: null,
    });
    await renderWithProviders(<CheckoutScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByLabelText('Rs 240, Total with delivery')).toBeTruthy();
  });

  it('places the order with the typed delivery charge, starts its payment, and shows where each order is', async () => {
    mockCheckout.mockResolvedValue([placed('order-1', 'seller-1', 1700)]);
    const navigation = makeNavigation();
    await renderWithProviders(<CheckoutScreen navigation={navigation} route={{} as never} />);
    await screen.findByText('Chaudhry Seeds · Sargodha');
    await fireEvent.changeText(screen.getByLabelText('Delivery charge'), '1500');

    await fireEvent.press(screen.getByRole('button', { name: 'Place order' }));

    expect(await screen.findByText('Order placed')).toBeTruthy();
    expect(mockCheckout).toHaveBeenCalledWith([item()], { 'seller-1': 1500 });
    // Payment is part of checkout now: no separate "Pay now" step afterwards.
    expect(mockInitiatePayment).toHaveBeenCalledWith('order-1', 'cod');
    expect(useCartStore.getState().items).toEqual([]);
    expect(screen.getByText('Chaudhry Seeds')).toBeTruthy();
    expect(screen.getByText('Rs 1,700 · Cash on delivery')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Continue shopping' }));
    expect(navigation.popToTop).toHaveBeenCalledTimes(1);
  });

  it('sends no delivery charge as 0 when the box is left empty', async () => {
    mockCheckout.mockResolvedValue([placed('order-1', 'seller-1', 200)]);
    await renderWithProviders(<CheckoutScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Chaudhry Seeds · Sargodha');
    await fireEvent.press(screen.getByRole('button', { name: 'Place order' }));
    await screen.findByText('Order placed');
    expect(mockCheckout).toHaveBeenCalledWith([item()], { 'seller-1': 0 });
  });

  it('keeps the order, and says to choose how to pay, when only the payment could not be started', async () => {
    mockCheckout.mockResolvedValue([placed('order-1', 'seller-1', 200)]);
    mockInitiatePayment.mockRejectedValue(new Error('Payment service down'));
    await renderWithProviders(<CheckoutScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Chaudhry Seeds · Sargodha');
    await fireEvent.press(screen.getByRole('button', { name: 'Place order' }));

    expect(await screen.findByText('Order placed')).toBeTruthy();
    expect(screen.getByText('Rs 200 · Choose how to pay in the order')).toBeTruthy();
  });

  it('shows a Banner and keeps the cart when checkout rejects, with no payment started', async () => {
    mockCheckout.mockRejectedValue(new Error('Listing sold out'));
    const navigation = makeNavigation();
    await renderWithProviders(<CheckoutScreen navigation={navigation} route={{} as never} />);
    await screen.findByText('Chaudhry Seeds · Sargodha');
    await fireEvent.press(screen.getByRole('button', { name: 'Place order' }));

    expect(await screen.findByText("Couldn't place your order")).toBeTruthy();
    expect(screen.getByText('Listing sold out')).toBeTruthy();
    expect(useCartStore.getState().items).toEqual([item()]);
    expect(mockInitiatePayment).not.toHaveBeenCalled();
    expect(navigation.popToTop).not.toHaveBeenCalled();
  });

  it('offers no Place order for an emptied cart, instead of "Total Rs 0" with a live button', async () => {
    useCartStore.setState({ items: [] });
    const navigation = makeNavigation();
    await renderWithProviders(<CheckoutScreen navigation={navigation} route={{} as never} />);

    expect(screen.getByText('Your cart is empty')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Place/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Browse the market' }));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith(MARKETPLACE_ROUTES.Browse));
  });
});
