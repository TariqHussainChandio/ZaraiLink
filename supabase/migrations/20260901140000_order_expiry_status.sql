-- Business-logic fix (Phase 2): "a pending order the seller never confirms should auto-expire
-- ... after a defined window -- nothing currently closes this loop." No scheduler exists
-- anywhere in this stack (no pg_cron, no worker process), so this is closed with lazy
-- expiry -- `orders_service._expire_stale_pending_orders` runs on every order list/detail read
-- and flips any `pending` order past the age threshold to this new terminal state. Kept
-- separate from `cancelled`/`rejected` because it's a distinct reason (system timeout from
-- inaction, not a person's decision) that a buyer or seller should be able to tell apart at a
-- glance. A standalone migration (nothing else references the new value) because
-- `alter type ... add value` cannot be used in the same transaction as a statement that
-- references the new value.

alter type public.order_status add value if not exists 'expired';
