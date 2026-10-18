-- Pair for migration 20261025080000_numeric_nan_guards.sql. Postgres numeric accepts 'NaN' and NaN passes `>= 0` and
-- `> 0`, so the marketplace columns could hold it until this migration. Proves: each NaN check exists and is validated;
-- a seller cannot price or stock a listing at NaN; a buyer cannot order NaN units; the order, payment and outbox figures
-- refuse NaN even for the table owner; ordinary figures still pass.
begin;
\ir ../helpers/rls_helpers.inc
select plan(15);
select tests.world();

select is(
  (select array_agg(conname::text order by conname) from pg_constraint
    where connamespace = 'public'::regnamespace and contype = 'c' and convalidated and conname like '%\_not\_nan'),
  array['farm_crops_area_not_nan', 'farms_area_not_nan', 'listings_price_not_nan', 'listings_quantity_not_nan',
        'order_events_quantity_not_nan', 'order_items_quantity_not_nan', 'order_items_unit_price_not_nan',
        'orders_delivery_charge_not_nan', 'orders_product_subtotal_not_nan', 'payments_amount_not_nan'],
  'every NaN check exists and is validated');

-- Listings: the seller's own client path.
select tests.expect(tests.fx('F'),
  $$insert into public.listings (owner_id, title, price, seller_role) values ($$ || tests.l('F') || $$, 'NaN price', 'NaN', 'farmer')$$,
  'err:23514', 'a seller cannot list at a NaN price');
select tests.expect(tests.fx('F'),
  $$insert into public.listings (owner_id, title, price, quantity, seller_role) values ($$ || tests.l('F') || $$, 'NaN qty', 5, 'NaN', 'farmer')$$,
  'err:23514', 'nor with a NaN quantity');
select tests.expect(tests.fx('F'),
  $$update public.listings set price = 'NaN' where id = $$ || tests.l('L1'),
  'err:23514', 'nor change an existing listing''s price to NaN');
select tests.expect(tests.fx('F'),
  $$update public.listings set quantity = 'NaN' where id = $$ || tests.l('L1'),
  'err:23514', 'nor its quantity');
select tests.expect(tests.fx('F'),
  $$update public.listings set price = 12.50, quantity = 3 where id = $$ || tests.l('L1'),
  'n:1', 'an ordinary price and quantity still pass');

-- Orders: a buyer adding a NaN line to their own order is refused (the A4 stock checks compare this quantity).
select tests.expect(tests.fx('B'),
  $$insert into public.order_items (order_id, listing_id, quantity, unit_price) values ($$ || tests.l('O1') || ', ' || tests.l('L1') || $$, 'NaN', 1)$$,
  'err:23514', 'a buyer cannot order NaN units');

-- The rest are written by triggers and the API, so the checks are shown on the table owner, which no policy limits.
select throws_ok(
  $$update public.order_items set quantity = 'NaN' where order_id = $$ || tests.l('O1'),
  '23514', null, 'an order line quantity cannot become NaN');
select throws_ok(
  $$update public.order_items set unit_price = 'NaN' where order_id = $$ || tests.l('O1'),
  '23514', null, 'nor its unit price');
select throws_ok(
  $$update public.orders set delivery_charge = 'NaN' where id = $$ || tests.l('O1'),
  '23514', null, 'an order delivery charge cannot be NaN (BR-09: its own line, a real figure)');
select throws_ok(
  $$update public.orders set product_subtotal = 'NaN' where id = $$ || tests.l('O1'),
  '23514', null, 'nor the product subtotal (the generated total follows from both)');
select throws_ok(
  $$update public.payments set amount = 'NaN' where id = $$ || tests.l('PAY1'),
  '23514', null, 'a payment amount cannot be NaN');
select throws_ok(
  $$insert into public.order_events (order_id, order_item_id, seller_id, listing_id, quantity, type)
    select o.id, oi.id, o.seller_id, oi.listing_id, 'NaN', 'dispatched'
      from public.orders o join public.order_items oi on oi.order_id = o.id where o.id = $$ || tests.l('O1') || ' limit 1',
  '23514', null, 'the dispatch outbox refuses a NaN quantity');

-- Farms: the farmer's own client path.
select tests.expect(tests.fx('F'),
  $$insert into public.farms (owner_id, name, area) values ($$ || tests.l('F') || $$, 'NaN farm', 'NaN')$$,
  'err:23514', 'a farmer cannot record a NaN farm area');
select tests.expect(tests.fx('F'),
  $$insert into public.farms (owner_id, name, area) values ($$ || tests.l('F') || $$, 'Real farm', 4.5)$$,
  'n:1', 'an ordinary area still passes');

select * from finish();
rollback;
