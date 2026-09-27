import { useMutation, useQuery } from '@tanstack/react-query';
import {
  fetchPaymentById,
  initiatePayment,
  markPaymentFailed,
  markPaymentReceived,
} from '../../services/modules/payments/paymentsService';
import type { PaymentMethod } from '../../types/payments';
import { queryKeys } from './keys';
import { useInvalidateOrders } from './invalidation';

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

/** The seller's decision on a payment: received, or failed. */
export function useResolvePayment() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: ({ paymentId, action }: { paymentId: string; action: 'received' | 'failed' }) =>
      action === 'received' ? markPaymentReceived(paymentId) : markPaymentFailed(paymentId, null),
    onSuccess: invalidate,
  });
}
