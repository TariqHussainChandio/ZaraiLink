-- A4 (decision D5): the order lifecycle gains `dispatched` between `ready` and `completed`, the stage at which stock
-- leaves the seller (SRDS §19-§20). A new enum value cannot be used in the transaction that adds it, and each migration
-- file runs in one transaction, so it is added here on its own; 20261019080000_order_dispatch.sql uses it.
alter type public.order_status add value if not exists 'dispatched' after 'ready';
