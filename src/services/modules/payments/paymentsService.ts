import { apiFetch } from '../../api/client';
import type { Payment, PaymentMethod, PaymentTransaction } from '../../../types/payments';

/**
 * No `amount`/`buyerId` params — the backend always prices the payment from the order's own
 * `total` (server-authoritative), never from anything the client sends, and derives the buyer
 * from the session token. This closes a real gap the original implementation had: it trusted a
 * client-supplied `amount` outright.
 */
export async function initiatePayment(orderId: string, method: PaymentMethod): Promise<Payment> {
  return apiFetch('/api/v1/payments', { method: 'POST', body: { order_id: orderId, method } });
}

export async function fetchPaymentById(paymentId: string): Promise<Payment> {
  return apiFetch(`/api/v1/payments/${paymentId}`);
}

export async function fetchPaymentByOrderId(orderId: string): Promise<Payment | null> {
  return apiFetch(`/api/v1/payments/by-order/${orderId}`);
}

export async function fetchPaymentTransactions(paymentId: string): Promise<PaymentTransaction[]> {
  return apiFetch(`/api/v1/payments/${paymentId}/transactions`);
}

/** Seller-only, enforced server-side. */
export async function markPaymentReceived(paymentId: string): Promise<Payment> {
  return apiFetch(`/api/v1/payments/${paymentId}/received`, { method: 'PATCH' });
}

/**
 * Seller-only. No `actorId` param. The order-transition side-effect (auto-moving a
 * pending/confirmed order to `payment_failed`) now happens server-side, in the same request.
 */
export async function markPaymentFailed(paymentId: string, reason: string | null): Promise<Payment> {
  return apiFetch(`/api/v1/payments/${paymentId}/failed`, { method: 'PATCH', body: { reason } });
}
