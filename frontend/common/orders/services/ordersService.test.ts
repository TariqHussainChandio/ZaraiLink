import { apiFetch } from '../../../services/api/client';
import type { CartItem } from '../../../state/cartStore';
import {
  checkout,
  fetchOrderById,
  fetchOrderStatusHistory,
  fetchOrdersForUser,
  updateOrderStatus,
} from './ordersService';

jest.mock('../../../services/api/client');

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const cartItems: CartItem[] = [
  { listingId: 'listing-1', sellerId: 'seller-1', title: 'Wheat', price: 100, unit: 'kg', image: null, quantity: 2 },
  { listingId: 'listing-2', sellerId: 'seller-2', title: 'Rice', price: 200, unit: 'kg', image: null, quantity: 1 },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('checkout', () => {
  it('sends only listingId/quantity per cart item — never price or sellerId', async () => {
    mockApiFetch.mockResolvedValue([]);
    await checkout(cartItems, { 'seller-1': 50 });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/orders/checkout', {
      method: 'POST',
      body: {
        cart_items: [
          { listing_id: 'listing-1', quantity: 2 },
          { listing_id: 'listing-2', quantity: 1 },
        ],
        delivery_charge_by_seller: { 'seller-1': 50 },
      },
      idempotencyKey: expect.stringMatching(/^zl-/),
    });
  });

  it('a retry of the same cart reuses the Idempotency-Key, a different cart or a later order gets a new one', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('lost')).mockResolvedValue([]);
    await expect(checkout(cartItems)).rejects.toThrow('lost');
    await checkout(cartItems); // the retry: same key as the lost attempt
    await checkout(cartItems); // the key was released on success, so this is a new order
    await checkout(cartItems.slice(0, 1)); // a different cart
    const keys = mockApiFetch.mock.calls.map(call => call[1]?.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(keys[3]).not.toBe(keys[2]);
  });

  it('defaults delivery_charge_by_seller to an empty object', async () => {
    mockApiFetch.mockResolvedValue([]);
    await checkout(cartItems);
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/orders/checkout',
      expect.objectContaining({ body: expect.objectContaining({ delivery_charge_by_seller: {} }) }),
    );
  });

  it('returns whatever orders the backend created', async () => {
    const orders = [{ id: 'order-1' }, { id: 'order-2' }];
    mockApiFetch.mockResolvedValue(orders);
    const result = await checkout(cartItems);
    expect(result).toEqual(orders);
  });
});

describe('fetchOrdersForUser', () => {
  it('passes the buyer/seller segment as a query param', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchOrdersForUser('buyer');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/orders', { query: { as: 'buyer' } });
  });

  it('supports the seller segment too', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchOrdersForUser('seller');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/orders', { query: { as: 'seller' } });
  });
});

describe('fetchOrderById / fetchOrderStatusHistory', () => {
  it('fetches a single order', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchOrderById('order-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/orders/order-1');
  });

  it('fetches the status history', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchOrderStatusHistory('order-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/orders/order-1/status-history');
  });
});

describe('updateOrderStatus', () => {
  it('PATCHes only the requested destination state, no "from" or actor', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await updateOrderStatus('order-1', 'confirmed');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/orders/order-1/status', {
      method: 'PATCH',
      body: { to: 'confirmed' },
    });
  });
});
