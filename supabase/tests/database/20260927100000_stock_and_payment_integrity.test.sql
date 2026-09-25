-- Pair for migration 20260927100000_stock_and_payment_integrity.sql: the stock function only touches the order's seller's
-- inventory (each row once), an inventory row belongs to a listing its dealer owns, one open payment per order,
-- server-owned columns on insert, no decision on a dead order, and reviews only for listings the order contained.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();

select tests.world();

-- fixtures made as the owner (the guards bind only signed-in users): F sells L1 and stocks 5 of it; dealer D plants a row
-- for F's listing directly (which the policies now refuse through the API, see below)
insert into public.inventory (dealer_id, listing_id, stock_quantity)
  select tests.fx('F'), tests.fx('L1'), 5;
insert into public.inventory (dealer_id, listing_id, stock_quantity)
  select tests.fx('D'), tests.fx('L1'), 0;
with x as (
  insert into public.orders (buyer_id, seller_id, delivery_charge) values (tests.fx('B'), tests.fx('F'), 0) returning id
) insert into tests.fixtures select 'OSTK', id from x;
insert into public.order_items (order_id, listing_id, quantity, unit_price) values (tests.fx('OSTK'), tests.fx('L1'), 3, 100);

-- ── inventory ownership ──────────────────────────────────────────────────

select tests.expect(tests.fx('D'), 'insert into public.inventory (dealer_id, listing_id) values (' || tests.l('D') || ',' || tests.l('L1') || ')', 'err:42501', 'inventory: a dealer cannot plant a row for someone else''s listing');
select tests.expect(tests.fx('D'), 'update public.inventory set listing_id = ' || tests.l('L1') || ' where id = ' || tests.l('INV1'), 'err:42501', 'inventory: nor point their own row at it');
select tests.expect(tests.fx('F'), 'insert into public.inventory (dealer_id, listing_id) values (' || tests.l('F') || ',' || tests.l('L1') || ')', 'err:23505', 'inventory: a listing has one row per owner');

select is(
  (select available from public.available_stock(array[tests.fx('L1')])),
  5::numeric, 'available stock is the listing owner''s row, not a planted one');

-- ── confirming commits the seller's rows only, once per row ───────────────

select tests.expect(tests.fx('F'), $$update public.orders set status = 'confirmed' where id = $$ || tests.l('OSTK'), 'n:1', 'confirm: the seller confirms an order the planted row does not block');
select is((select stock_quantity from public.inventory where dealer_id = tests.fx('F') and listing_id = tests.fx('L1')), 2::numeric, 'confirm: the seller''s stock is reduced by the order quantity');
select is((select stock_quantity from public.inventory where dealer_id = tests.fx('D') and listing_id = tests.fx('L1')), 0::numeric, 'confirm: someone else''s row is left alone');

-- the same listing twice in one order is refused, so the reduction can never run from a stale line
with x as (
  insert into public.orders (buyer_id, seller_id, delivery_charge) values (tests.fx('B'), tests.fx('F'), 0) returning id
) insert into tests.fixtures select 'OP2', id from x;
select tests.expect(tests.fx('B'), 'insert into public.order_items (order_id, listing_id, quantity, unit_price) values (' || tests.l('OP2') || ',' || tests.l('L1') || ', 1, 1)', 'n:1', 'order items: the first line for a listing is accepted');
select tests.expect(tests.fx('B'), 'insert into public.order_items (order_id, listing_id, quantity, unit_price) values (' || tests.l('OP2') || ',' || tests.l('L1') || ', 1, 1)', 'err:23505', 'order items: a second line for the same listing is refused');

-- ── payments ─────────────────────────────────────────────────────────────

select throws_ok(
  format('insert into public.payments (order_id, buyer_id, amount, method, provider) values (%L, %L, 1, %L, %L)',
         tests.fx('O1'), tests.fx('B'), 'cod', 'manual'),
  '23505', null, 'payments: the database allows one open payment per order even without the trigger');

select tests.expect(tests.fx('B'), 'insert into public.payments (order_id, buyer_id, amount, method, provider, currency, provider_transaction_ref, created_at) values (' || tests.l('OP2') || ',' || tests.l('B') || $$, 1, 'cod', 'manual', 'USD', 'forged', '2020-01-01')$$, 'n:1', 'payments: bookkeeping columns sent by the client are accepted...');
select is(
  (select count(*) from public.payments where order_id = tests.fx('OP2') and currency = 'PKR' and provider_transaction_ref is null and created_at > now() - interval '1 minute'),
  1::bigint, 'payments: ...but replaced (PKR, no provider reference, created now)');

-- a payment on an order that was cancelled cannot be decided
with x as (
  insert into public.orders (buyer_id, seller_id, delivery_charge) values (tests.fx('B'), tests.fx('F'), 0) returning id
) insert into tests.fixtures select 'ODEAD', id from x;
insert into public.order_items (order_id, listing_id, quantity, unit_price) values (tests.fx('ODEAD'), tests.fx('L1'), 1, 100);
with x as (
  insert into public.payments (order_id, buyer_id, amount, method, provider) values (tests.fx('ODEAD'), tests.fx('B'), 100, 'cod', 'manual') returning id
) insert into tests.fixtures select 'PDEAD', id from x;
select tests.expect(tests.fx('B'), $$update public.orders set status = 'cancelled' where id = $$ || tests.l('ODEAD'), 'n:1', 'dead order: the buyer cancels it');
select tests.expect(tests.fx('F'), $$update public.payments set status = 'successful' where id = $$ || tests.l('PDEAD'), 'err:23514', 'dead order: its payment can no longer be marked received');

-- ── orders: server-owned created_at ──────────────────────────────────────

select tests.expect(tests.fx('B'), 'insert into public.orders (buyer_id, seller_id, created_at) values (' || tests.l('B') || ',' || tests.l('F') || $$, '2020-01-01')$$, 'n:1', 'order insert: a back-dated created_at is accepted...');
select is(
  (select count(*) from public.orders where buyer_id = tests.fx('B') and created_at < now() - interval '1 day'),
  0::bigint, 'order insert: ...but the order is placed now (the 48 hour rule cannot be skipped)');

-- ── reviews: the listing must be one the order contained ─────────────────

with x as (
  insert into public.orders (buyer_id, seller_id, status) values (tests.fx('B'), tests.fx('F'), 'completed') returning id
) insert into tests.fixtures select 'ORV', id from x;
insert into public.order_items (order_id, listing_id, quantity, unit_price) values (tests.fx('ORV'), tests.fx('L1'), 1, 100);
with x as (
  insert into public.listings (owner_id, title, price, quantity, status, seller_role) values (tests.fx('F'), 'Other', 5, 5, 'active', 'farmer') returning id
) insert into tests.fixtures select 'LOTHER', id from x;

select tests.expect(tests.fx('B'), 'insert into public.reviews (order_id, seller_id, buyer_id, listing_id, rating) values (' || tests.l('ORV') || ',' || tests.l('F') || ',' || tests.l('B') || ',' || tests.l('LOTHER') || ', 5)', 'err:42501', 'reviews: a listing the order did not contain is refused');
select tests.expect(tests.fx('B'), 'insert into public.reviews (order_id, seller_id, buyer_id, listing_id, rating) values (' || tests.l('ORV') || ',' || tests.l('F') || ',' || tests.l('B') || ',' || tests.l('L1') || ', 5)', 'n:1', 'reviews: one it contained is accepted');

select * from finish();
rollback;
