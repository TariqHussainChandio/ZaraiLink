// An order's status history as the admin's order detail reads it (SRDS §14). Re-exported from the generated contract
// (AGENTS.md rule 9).
export type { OrderStatusHistoryEntry } from '../../services/api/generated/types.gen';

/** The outcomes the order status graph allows from a dispute (guard_orders_update): the admin settles it either way. */
export type DisputeOutcome = 'refunded' | 'completed';
