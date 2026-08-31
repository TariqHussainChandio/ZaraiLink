import { apiFetch } from '../../api/client';
import type { CartItem } from '../../../store/cartStore';
import {
  checkout,
  fetchOrderById,
  fetchOrderStatusHistory,
  fetchOrdersForUser,
  updateOrderStatus,
} from './ordersService';

jest.mock('../../api/client');

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
    });
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
