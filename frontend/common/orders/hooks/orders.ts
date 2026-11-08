import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkout,
  fetchOrderById,
  fetchOrdersForUser,
  fetchOrderStatusHistory,
  updateOrderStatus,
} from '../services/ordersService';
import { fetchListingById } from '../../marketplace';
import { fetchPaymentByOrderId } from '../../payments';
import { fetchReviewByOrderId } from '../../reviews';
import type { CartItem } from '../../../state/cartStore';
import type { OrderStatus } from '../types/orders';
import type { CartListings } from '../utils/cartGroups';
import { useInvalidateOrders } from '../../../hooks/invalidation';
import { queryKeys } from '../../../hooks/keys';

/** The signed-in user's orders as buyer or as seller (the same cache entry the order history screen reads). */
export function useOrders(segment: 'buyer' | 'seller', enabled = true) {
  return useQuery({
    queryKey: queryKeys.orders.list(segment),
    queryFn: () => fetchOrdersForUser(segment),
    enabled,
  });
}

/** The current copy of each listing in the cart, by listing id: today's price (the server charges that, not the price saved
 * when the item was added), the seller's name and town for a card title, and whether it is still on sale. Shares the cache
 * of the listing screen, so a listing just viewed is not fetched twice. A listing that could not be loaded is absent and
 * the cart falls back to what it saved. */
export function useCartListings(listingIds: string[]): CartListings {
  const results = useQueries({
    queries: listingIds.map(id => ({ queryKey: queryKeys.marketplace.listing(id), queryFn: () => fetchListingById(id) })),
  });
  // Built on each render: a handful of entries, and React Query already keeps each listing's data stable.
  const map: CartListings = new Map();
  listingIds.forEach((id, index) => {
    const listing = results[index]?.data;
    if (listing) map.set(id, listing);
  });
  return map;
}

/** An order with its timeline, payment and review: what the order screen shows, fetched together. */
export function useOrderDetail(orderId: string) {
  return useQuery({
    queryKey: queryKeys.orders.detail(orderId),
    queryFn: async () => {
      const [order, history, payment, review] = await Promise.all([
        fetchOrderById(orderId),
        fetchOrderStatusHistory(orderId),
        fetchPaymentByOrderId(orderId),
        fetchReviewByOrderId(orderId),
      ]);
      return { order, history, payment, review };
    },
  });
}

/** What the payment screens need: the order's amounts (BR-09: products and delivery on their own lines), who the seller is,
 * and any payment already started for it. Waits for an order id, so a screen can ask before it knows the payment's order. */
export function useOrderPaymentContext(orderId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.payments.forOrder(orderId),
    queryFn: async () => {
      const [order, existingPayment] = await Promise.all([fetchOrderById(orderId), fetchPaymentByOrderId(orderId)]);
      return {
        orderTotal: order.total,
        productSubtotal: order.product_subtotal,
        deliveryCharge: order.delivery_charge,
        sellerName: order.seller?.full_name ?? null,
        existingPayment,
      };
    },
    staleTime: 0,
    enabled: enabled && orderId !== '',
  });
}

/** An order status change shows in the order list, the detail screen, the payment screens and the dashboards. */
export function useUpdateOrderStatus(orderId: string) {
  const invalidate = useInvalidateOrders();
  return useMutation({ mutationFn: (to: OrderStatus) => updateOrderStatus(orderId, to), onSuccess: invalidate });
}

interface CheckoutVariables {
  items: CartItem[];
  deliveryChargeBySeller: Record<string, number>;
}

export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ items, deliveryChargeBySeller }: CheckoutVariables) => checkout(items, deliveryChargeBySeller),
    // Checkout takes stock, so the feed and listing pages are stale too.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
      ]),
  });
}
