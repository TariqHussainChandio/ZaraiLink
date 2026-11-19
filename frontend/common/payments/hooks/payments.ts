import { useMutation, useQuery } from '@tanstack/react-query';
import {
  fetchPaymentById,
  initiatePayment,
  markPaymentFailed,
  markPaymentReceived,
} from '../services/paymentsService';
import type { PaymentMethod } from '../types/payments';
import { queryKeys } from '../../../hooks/keys';
import { useInvalidateOrders } from '../../../hooks/invalidation';

/** A payment by id. The seller changes its status, so it is always refetched when a screen shows it. */
export function usePayment(paymentId: string) {
  return useQuery({
    queryKey: queryKeys.payments.byId(paymentId),
    queryFn: () => fetchPaymentById(paymentId),
    staleTime: 0,
  });
}

export function useInitiatePayment() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: ({ orderId, method }: { orderId: string; method: PaymentMethod }) => initiatePayment(orderId, method),
    onSuccess: invalidate,
  });
}

/** The seller's decision on a payment: received, or failed. A failure can carry the reason the buyer is told (the API
 * accepts it for `failed` only). */
export function useResolvePayment() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: ({ paymentId, action, reason }: { paymentId: string; action: 'received' | 'failed'; reason?: string }) =>
      action === 'received' ? markPaymentReceived(paymentId) : markPaymentFailed(paymentId, reason || null),
    onSuccess: invalidate,
  });
}
