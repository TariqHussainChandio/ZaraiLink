// Full SRDS v4.0 §12.2 lifecycle. See ALLOWED_TRANSITIONS in backend/app/common/orders/service.py
// for which moves are reachable and by whom. `expired` is system-only — a `pending` order the
// seller never acts on gets flipped to it lazily (no user-facing action ever requests it).
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'ready'
  | 'dispatched'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'payment_failed'
  | 'disputed'
  | 'refunded'
  | 'expired';

export interface Order {
  id: string;
  buyer_id: string;
  seller_id: string;
  status: OrderStatus;
  /** Sum of order_items. Never includes delivery_charge (BR-09). */
  product_subtotal: number;
  /** Separately agreed delivery amount; 0 when delivery is coordinated outside the platform. */
  delivery_charge: number;
  /** Generated: product_subtotal + delivery_charge. */
  total: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  listing_id: string | null;
  quantity: number;
  unit_price: number;
  created_at: string;
}

export interface OrderWithItems extends Order {
  order_items: (OrderItem & { listing: { title: string; unit: string } | null })[];
  buyer: { id: string; full_name: string } | null;
  seller: { id: string; full_name: string } | null;
}

export interface OrderStatusHistoryEntry {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  created_at: string;
}
