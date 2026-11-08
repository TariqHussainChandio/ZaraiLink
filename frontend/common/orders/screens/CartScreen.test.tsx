import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { CartScreen } from './CartScreen';
import { fetchListingById } from '../../marketplace/services/listingsService';
import { useCartStore, type CartItem } from '../../../state/cartStore';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

jest.mock('../../marketplace/services/listingsService', () => ({
  fetchListingById: jest.fn(),
}));

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

/** What the API returns for a cart item's listing: its seller, town and today's price. */
const listingFor = (cartItem: CartItem, overrides: object = {}) => ({
  id: cartItem.listingId,
  owner_id: cartItem.sellerId,
  title: cartItem.title,
  price: cartItem.price,
  unit: cartItem.unit,
  images: [],
  owner: { id: cartItem.sellerId, full_name: cartItem.sellerId === 'seller-1' ? 'Chaudhry Seeds' : 'Nadia Batool', avatar_url: null },
  location: { country: 'Pakistan', province: 'Punjab', city: cartItem.sellerId === 'seller-1' ? 'Sargodha' : 'Okara' },
  ...overrides,
});

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as MarketplaceScreenProps<'Cart'>['navigation'];
}

beforeEach(() => {
  useCartStore.setState({ items: [] });
  mockFetchListingById.mockReset();
  mockFetchListingById.mockImplementation(async (id: string) => {
    const found = useCartStore.getState().items.find(candidate => candidate.listingId === id);
    return listingFor(found ?? item());
  });
});

describe('CartScreen', () => {
  it('shows an empty state with a next step when the cart has no items', async () => {
    const navigation = makeNavigation();
    await renderWithQuery(<CartScreen navigation={navigation} route={{} as never} />);
    expect(screen.getByText('Your cart is empty')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Browse the market' }));
    expect(navigation.navigate).toHaveBeenCalledWith(MARKETPLACE_ROUTES.Browse);
  });

  it('groups the cart by seller, as checkout will, with line totals and the products sum', async () => {
    useCartStore.setState({
      items: [
        item({ price: 100, quantity: 2 }),
        item({ listingId: 'listing-2', sellerId: 'seller-2', title: 'Rice seeds', price: 50, quantity: 3 }),
      ],
    });
    await renderWithQuery(<CartScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByText('Chaudhry Seeds · Sargodha')).toBeTruthy();
    expect(await screen.findByText('Nadia Batool · Okara')).toBeTruthy();
    expect(screen.getByText('Wheat seeds')).toBeTruthy();
    expect(screen.getByText('Rice seeds')).toBeTruthy();
    // Line totals, then the sum labelled "Products": delivery is agreed per seller at checkout.
    expect(screen.getByText('Rs 200')).toBeTruthy();
    expect(screen.getByText('Rs 150')).toBeTruthy();
    expect(screen.getByLabelText('Products Rs 350')).toBeTruthy();
    expect(screen.getByText('Delivery is agreed with each seller. You enter the charge at checkout.')).toBeTruthy();
  });

  it("charges today's price, not the one saved when the item was added", async () => {
    useCartStore.setState({ items: [item({ price: 100, quantity: 2 })] });
    mockFetchListingById.mockResolvedValue(listingFor(item(), { price: 120 }));
    await renderWithQuery(<CartScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByText('Rs 120 per kg')).toBeTruthy();
    expect(screen.getByText('Was Rs 100 when you added it')).toBeTruthy();
    expect(screen.getByLabelText('Products Rs 240')).toBeTruthy();
  });

  it('still shows the cart, from what it saved, when a listing cannot be loaded', async () => {
    useCartStore.setState({ items: [item()] });
    mockFetchListingById.mockRejectedValue(new Error('offline'));
    await renderWithQuery(<CartScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByText('Wheat seeds')).toBeTruthy();
    expect(screen.getByText('Seller')).toBeTruthy();
    expect(screen.getByLabelText('Products Rs 200')).toBeTruthy();
  });

  it('sets any quantity through the store, and stops at 1 instead of deleting the line', async () => {
    useCartStore.setState({ items: [item({ quantity: 2 })] });
    await renderWithQuery(<CartScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Chaudhry Seeds · Sargodha');

    await fireEvent.press(screen.getByRole('button', { name: 'One more kg' }));
    expect(useCartStore.getState().items[0]?.quantity).toBe(3);

    await fireEvent.press(screen.getByRole('button', { name: '3 kgs' }));
    const box = screen.getByLabelText('Number of kgs');
    await fireEvent.changeText(box, '50');
    await fireEvent(box, 'submitEditing');
    expect(useCartStore.getState().items[0]?.quantity).toBe(50);
  });

  it('removes a line with "Removed" and Undo, which brings it back with its quantity (MK-16)', async () => {
    useCartStore.setState({ items: [item({ quantity: 4 })] });
    await renderWithQuery(<CartScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Chaudhry Seeds · Sargodha');

    await fireEvent.press(screen.getByRole('button', { name: 'Remove Wheat seeds from the cart' }));
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(await screen.findByText('Wheat seeds removed')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(useCartStore.getState().items).toEqual([expect.objectContaining({ listingId: 'listing-1', quantity: 4 })]);
  });

  it('goes to checkout', async () => {
    useCartStore.setState({ items: [item()] });
    const navigation = makeNavigation();
    await renderWithQuery(<CartScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Go to checkout' }));
    expect(navigation.navigate).toHaveBeenCalledWith(MARKETPLACE_ROUTES.Checkout);
  });
});
