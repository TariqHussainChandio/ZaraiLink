-- Security fix: five policies (four dealer-domain + one order-lifecycle) let an admin WRITE
-- rows they should only be able to READ, via the "dealer_id/buyer_id/seller_id = auth.uid()
-- or public.is_admin()" pattern applied uniformly to `using`/`with check` on write policies.
-- `is_admin()` in a write policy means "any admin can write ANY row", not "admin has oversight
-- visibility" -- those are different privileges and only the latter was ever intended per
-- docs/architecture/authorization-model.md §48 (dealer domain) and the orders lifecycle design.
--
-- Concretely, this let an admin's own access token (never a service-role key --
-- `get_user_scoped_client`, backend/app/core/supabase_client.py:31-38, is always
-- request-JWT-scoped) successfully write another dealer's `dealer_stores` / `suppliers` /
-- `inventory` rows, insert fabricated `inventory_transactions` bypassing the atomic
-- `adjust_stock` service logic, and (via `orders_update_participants`) UPDATE any order row
-- including a stranger's `pending` order -- which is exactly the write path
-- `backend/app/services/orders_service.py:update_order_status` uses to trigger
-- `_reduce_dealer_inventory_for_order`. Fixing only the Python-layer business gate without
-- this migration would leave RLS as a silently-permissive fallback an admin token could still
-- hit directly (e.g. a leaked admin JWT calling PostgREST directly, bypassing FastAPI).
--
-- All four SELECT policies on the dealer-domain tables, and `orders_select_participants`,
-- keep `or public.is_admin()` -- admin read/oversight access is intentional and unaffected.
--
-- `orders_update_participants` cannot simply drop `is_admin()` outright the way the dealer
-- policies do: admin dispute-resolution (`disputed -> refunded` / `disputed -> completed`,
-- see `ALLOWED_TRANSITIONS` in orders_service.py) is a real, intended admin write path. So
-- instead of removing the admin branch, it is narrowed to only the disputed-resolution shape:
-- `using` may only select a row for update if it is CURRENTLY `disputed` (blocks an admin from
-- ever touching a `pending`/`confirmed`/etc. order -- the exact bypass Bug 2 exploited);
-- `with check` may only leave the row in `refunded`/`completed` (the only two states
-- `ALLOWED_TRANSITIONS["disputed"]` permits) -- together these are the RLS-layer mirror of the
-- Python-layer `from_status == "disputed"` gate added in orders_service.py.

-- dealer_stores
drop policy "dealer_stores_owner_write" on public.dealer_stores;
create policy "dealer_stores_owner_write"
  on public.dealer_stores for all
  using (dealer_id = auth.uid())
  with check (dealer_id = auth.uid());

-- suppliers
drop policy "suppliers_owner_write" on public.suppliers;
create policy "suppliers_owner_write"
  on public.suppliers for all
  using (dealer_id = auth.uid())
  with check (dealer_id = auth.uid());

-- inventory
drop policy "inventory_owner_write" on public.inventory;
create policy "inventory_owner_write"
  on public.inventory for all
  using (dealer_id = auth.uid())
  with check (dealer_id = auth.uid());

-- inventory_transactions: narrowed for the same reason as the three writes above -- an admin
-- inserting a transaction row directly bypasses `dealer_service.adjust_stock`'s quantity /
-- threshold validation and audit trail entirely, for ANY dealer's inventory.
drop policy "inventory_transactions_owner_insert" on public.inventory_transactions;
create policy "inventory_transactions_owner_insert"
  on public.inventory_transactions for insert
  with check (
    exists (
      select 1 from public.inventory i
      where i.id = inventory_id and i.dealer_id = auth.uid()
    )
  );

-- orders (parallel narrowing, see header comment)
drop policy "orders_update_participants" on public.orders;
create policy "orders_update_participants"
  on public.orders for update
  using (
    buyer_id = auth.uid()
    or seller_id = auth.uid()
    or (public.is_admin() and status = 'disputed')
  )
  with check (
    buyer_id = auth.uid()
    or seller_id = auth.uid()
    or (public.is_admin() and status in ('refunded', 'completed'))
  );
