import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkout,
  fetchOrderById,
  fetchOrdersForUser,
  fetchOrderStatusHistory,
  updateOrderStatus,
} from '../../services/modules/orders/ordersService';
import { fetchPaymentByOrderId } from '../../services/modules/payments/paymentsService';
import { fetchReviewByOrderId } from '../../services/modules/reviews/reviewsService';
import type { CartItem } from '../../store/cartStore';
import type { OrderStatus } from '../../types/orders';
import { useInvalidateOrders } from './invalidation';
import { queryKeys } from './keys';

/** The signed-in user's orders as buyer or as seller (the same cache entry the order history screen reads). */
export function useOrders(segment: 'buyer' | 'seller', enabled = true) {
  return useQuery({
    queryKey: queryKeys.orders.list(segment),
    queryFn: () => fetchOrdersForUser(segment),
    enabled,
  });
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

/** An order status change shows in the order list, the detail screen, the payment screens and the dashboards. */
/** What the payment-method screen needs: the order total and any payment already started for it. */
export function useOrderPaymentContext(orderId: string) {
  return useQuery({
    queryKey: queryKeys.payments.forOrder(orderId),
    queryFn: async () => {
      const [order, existingPayment] = await Promise.all([fetchOrderById(orderId), fetchPaymentByOrderId(orderId)]);
      return { orderTotal: order.total, existingPayment };
    },
    staleTime: 0,
  });
}

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
