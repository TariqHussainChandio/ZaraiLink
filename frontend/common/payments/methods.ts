import { PAYMENT_METHOD_LABELS } from '../constants/labels';
import type { PaymentMethod } from './types/payments';

/** "Cash on Delivery" -> "Cash on delivery": sentence case is the rule (D15), and the shared labels in constants/labels.ts
 * (zl-app-core's) still carry Title Case. Derived from them, so there is one list of methods; once they follow the rule
 * this changes nothing. */
const sentenceCase = (label: string) => label.charAt(0) + label.slice(1).toLowerCase();

export const PAYMENT_METHOD_NAMES: Record<PaymentMethod, string> = {
  cod: sentenceCase(PAYMENT_METHOD_LABELS.cod),
  bank_transfer: sentenceCase(PAYMENT_METHOD_LABELS.bank_transfer),
};

/** A payment row stores its method as text; a value this build does not know is shown as stored. */
export function paymentMethodName(method: string): string {
  return method in PAYMENT_METHOD_NAMES ? PAYMENT_METHOD_NAMES[method as PaymentMethod] : method;
}
