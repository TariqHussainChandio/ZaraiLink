import { act } from '@testing-library/react-native';
import { cartItemCount, cartTotal, useCartStore, type CartItem } from './cartStore';

const listing = (overrides: Partial<CartItem> = {}): Omit<CartItem, 'quantity'> => ({
  listingId: 'listing-1',
  sellerId: 'seller-1',
  title: 'Wheat seeds',
  price: 100,
  unit: 'kg',
  image: null,
  ...overrides,
});

beforeEach(() => {
  act(() => {
    useCartStore.setState({ items: [] });
  });
});

describe('useCartStore', () => {
  it('adds a new item with the default quantity of 1', () => {
    act(() => {
      useCartStore.getState().addItem(listing());
    });
    expect(useCartStore.getState().items).toEqual([{ ...listing(), quantity: 1 }]);
  });

  it('adds an item with an explicit quantity', () => {
    act(() => {
      useCartStore.getState().addItem(listing(), 3);
    });
    expect(useCartStore.getState().items[0].quantity).toBe(3);
  });

  it('merges quantities when the same listing is added again', () => {
    act(() => {
      useCartStore.getState().addItem(listing(), 2);
      useCartStore.getState().addItem(listing(), 3);
    });
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(5);
  });

  it('keeps distinct listings as separate line items', () => {
    act(() => {
      useCartStore.getState().addItem(listing());
      useCartStore.getState().addItem(listing({ listingId: 'listing-2', title: 'Rice seeds' }));
    });
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('removes an item by listingId', () => {
    act(() => {
      useCartStore.getState().addItem(listing());
      useCartStore.getState().removeItem('listing-1');
    });
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('updates the quantity of an existing item', () => {
    act(() => {
      useCartStore.getState().addItem(listing());
      useCartStore.getState().updateQuantity('listing-1', 7);
    });
    expect(useCartStore.getState().items[0].quantity).toBe(7);
  });

  it('removes the item when updateQuantity is called with 0 or less', () => {
    act(() => {
      useCartStore.getState().addItem(listing());
      useCartStore.getState().updateQuantity('listing-1', 0);
    });
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('clears all items', () => {
    act(() => {
      useCartStore.getState().addItem(listing());
      useCartStore.getState().addItem(listing({ listingId: 'listing-2' }));
      useCartStore.getState().clear();
    });
    expect(useCartStore.getState().items).toEqual([]);
  });
});

describe('cartTotal', () => {
  it('sums price * quantity across items', () => {
    const items: CartItem[] = [
      { ...listing(), price: 100, quantity: 2 },
      { ...listing({ listingId: 'listing-2' }), price: 50, quantity: 3 },
    ];
    expect(cartTotal(items)).toBe(350);
  });

  it('returns 0 for an empty cart', () => {
    expect(cartTotal([])).toBe(0);
  });
});

describe('cartItemCount', () => {
  it('sums quantities across items', () => {
    const items: CartItem[] = [
      { ...listing(), quantity: 2 },
      { ...listing({ listingId: 'listing-2' }), quantity: 3 },
    ];
    expect(cartItemCount(items)).toBe(5);
  });

  it('returns 0 for an empty cart', () => {
    expect(cartItemCount([])).toBe(0);
  });
});
