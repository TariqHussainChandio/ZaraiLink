import { apiFetch } from '../../api/client';
import { idempotencyKeyFor, releaseIdempotencyKey } from '../../api/idempotency';
import type { CartItem } from '../../../store/cartStore';
import type { Order, OrderStatus, OrderStatusHistoryEntry, OrderWithItems } from '../../../types/orders';

/**
 * Cart validation, stock validation, listing-status validation, seller grouping, subtotal
 * pricing, and order/order_items/status-history creation all now live server-side
 * (`backend/app/services/orders_service.py`) — this is a thin wrapper only. Notably, the
 * request body carries only `listingId`/`quantity` per cart item (no price, no sellerId): the
 * backend prices every order from the listing's own current price and derives the seller from
 * the listing's actual owner, never from anything this client sends. No `buyerId` param either
 * — derived from the session token.
 */
export async function checkout(
  cartItems: CartItem[],
  deliveryChargeBySeller: Record<string, number> = {},
): Promise<Order[]> {
  const body = {
    cart_items: cartItems.map(item => ({ listing_id: item.listingId, quantity: item.quantity })),
    delivery_charge_by_seller: deliveryChargeBySeller,
  };
  // The same cart submitted again (a retry after a lost response) sends the same key, so the server returns the
  // orders it already created instead of making a second set. Released on success: the next order is a new one.
  const orders = await apiFetch<Order[]>('/api/v1/orders/checkout', {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKeyFor('checkout', body),
  });
  releaseIdempotencyKey('checkout', body);
  return orders;
}

// No userId param — always the caller's own orders.
export async function fetchOrdersForUser(as: 'buyer' | 'seller'): Promise<OrderWithItems[]> {
  return apiFetch('/api/v1/orders', { query: { as } });
}

export async function fetchOrderById(id: string): Promise<OrderWithItems> {
  return apiFetch(`/api/v1/orders/${id}`);
}

export async function fetchOrderStatusHistory(orderId: string): Promise<OrderStatusHistoryEntry[]> {
  return apiFetch(`/api/v1/orders/${orderId}/status-history`);
}

/**
 * No `from`/`actorId` params — the client only ever states the requested destination state.
 * The backend always re-reads the order's actual current status itself (never trusts a
 * client-asserted "current state") and derives the acting user from the session token.
 */
export async function updateOrderStatus(orderId: string, to: OrderStatus): Promise<void> {
  await apiFetch(`/api/v1/orders/${orderId}/status`, { method: 'PATCH', body: { to } });
}
