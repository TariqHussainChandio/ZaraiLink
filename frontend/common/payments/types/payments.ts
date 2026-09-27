export type PaymentStatus = 'pending' | 'processing' | 'successful' | 'failed' | 'cancelled' | 'refunded';

// No real gateway sandbox is wired up yet (Module 10 built against manual confirmation) — both
// methods create the same kind of `payments` row, just with a different `method` label; the
// seller confirms receipt either way. `provider` stays 'manual' until a real gateway lands.
export type PaymentMethod = 'cod' | 'bank_transfer';

export interface Payment {
  id: string;
  order_id: string;
  buyer_id: string;
  amount: number;
  currency: string;
  method: string;
  provider: string;
  provider_transaction_ref: string | null;
  status: PaymentStatus;
  created_at: string;
  updated_at: string;
}

export interface PaymentTransaction {
  id: string;
  payment_id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}
