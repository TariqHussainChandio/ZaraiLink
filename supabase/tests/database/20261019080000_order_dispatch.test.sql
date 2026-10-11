-- Pair for migration 20261019080000_order_dispatch.sql (A4, D5-D7, D9): dispatch is the seller's step between ready and
-- completed, the stock leaves then and only then (the dealer's inventory row, or the listing's own quantity), a known
-- shortage refuses it, every dispatched line writes exactly one outbox event that no client can reach, experts and the
-- admin do not buy, and listing availability is a word, never the dealer's figures.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();
select tests.world();

-- Move an order through the seller's steps up to ready, as the seller, and report each step's result.
create function tests.to_ready(_order uuid, _seller uuid) returns text language plpgsql as $$
declare
  step text;
  result text := '';
begin
  foreach step in array array['confirmed', 'processing', 'ready'] loop
    result := result || tests.probe(_seller, format('update public.orders set status = %L where id = %L', step, _order)) || ' ';
  end loop;
  return rtrim(result);
end;
$$;

-- fixtures, made as the owner: farmer F's listings LF (4 units) and LF2 (10); dealer D's listings with inventory rows
-- LDLOW (5 of a 10 threshold), LDOUT (0) and LDOK (20 of 5)
do $$
declare lf uuid; lf2 uuid; llow uuid; lout uuid; lok uuid; lshort uuid; llegacy uuid;
begin
  insert into public.listings (owner_id, title, price, quantity, status, seller_role)
    values (tests.fx('F'), 'Tomatoes', 10, 4, 'active', 'farmer') returning id into lf;
  insert into public.listings (owner_id, title, price, quantity, status, seller_role)
    values (tests.fx('F'), 'Onions', 10, 10, 'active', 'farmer') returning id into lf2;
  insert into public.listings (owner_id, title, price, quantity, status, seller_role)
    values (tests.fx('F'), 'Chillies', 10, 5, 'active', 'farmer') returning id into lshort;
  insert into public.listings (owner_id, title, price, quantity, status, seller_role)
    values (tests.fx('D'), 'Urea', 50, 1, 'active', 'dealer') returning id into llow;
  insert into public.listings (owner_id, title, price, quantity, status, seller_role)
    values (tests.fx('D'), 'DAP', 50, 1, 'active', 'dealer') returning id into lout;
  insert into public.listings (owner_id, title, price, quantity, status, seller_role)
    values (tests.fx('D'), 'Potash', 50, 1, 'active', 'dealer') returning id into lok;
  insert into public.listings (owner_id, title, price, quantity, status, seller_role)
    values (tests.fx('D'), 'Seed', 50, 1, 'active', 'dealer') returning id into llegacy;
  insert into public.inventory (dealer_id, listing_id, stock_quantity, min_stock_threshold) values
    (tests.fx('D'), llow, 5, 10), (tests.fx('D'), lout, 0, 0), (tests.fx('D'), lok, 20, 5), (tests.fx('D'), llegacy, 7, 0);
  insert into tests.fixtures values ('LF', lf), ('LF2', lf2), ('LSHORT', lshort), ('LDLOW', llow), ('LDOUT', lout),
    ('LDOK', lok), ('LLEGACY', llegacy);
end $$;

-- ── who buys (D9) ────────────────────────────────────────────────────────

select tests.expect(tests.fx('B'), 'insert into public.orders (buyer_id, seller_id) values (' || tests.l('B') || ',' || tests.l('F') || ')', 'n:1', 'D9: a buyer buys from a farmer');
select tests.expect(tests.fx('B'), 'insert into public.orders (buyer_id, seller_id) values (' || tests.l('B') || ',' || tests.l('D') || ')', 'n:1', 'D9: a buyer buys from a dealer');
select tests.expect(tests.fx('F'), 'insert into public.orders (buyer_id, seller_id) values (' || tests.l('F') || ',' || tests.l('D') || ')', 'n:1', 'D9: a farmer buys from a dealer (SRDS §27)');
select tests.expect(tests.fx('F'), 'insert into public.orders (buyer_id, seller_id) values (' || tests.l('F') || ',' || tests.l('F2') || ')', 'n:1', 'D9: a farmer buys from another farmer');
select tests.expect(tests.fx('D'), 'insert into public.orders (buyer_id, seller_id) values (' || tests.l('D') || ',' || tests.l('F') || ')', 'n:1', 'D9: a dealer buys from a farmer (SRDS §28)');
select tests.expect(tests.fx('D'), 'insert into public.orders (buyer_id, seller_id) values (' || tests.l('D') || ',' || tests.l('D2') || ')', 'n:1', 'D9: a dealer buys from another dealer');
select tests.expect(tests.fx('E'), 'insert into public.orders (buyer_id, seller_id) values (' || tests.l('E') || ',' || tests.l('F') || ')', 'err:42501', 'D9: an approved expert cannot buy');
select tests.expect(tests.fx('A'), 'insert into public.orders (buyer_id, seller_id) values (' || tests.l('A') || ',' || tests.l('F') || ')', 'err:42501', 'D9: the admin cannot buy', 'aal2');
select tests.expect(tests.fx('F'), 'insert into public.orders (buyer_id, seller_id) values (' || tests.l('F') || ',' || tests.l('F') || ')', 'err:23514', 'D9: nobody buys from themselves');

-- ── a farmer's listing: dispatch takes the listing's own quantity ─────────

do $$
declare o uuid;
begin
  insert into public.orders (buyer_id, seller_id, delivery_charge) values (tests.fx('B'), tests.fx('F'), 0) returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, tests.fx('LF'), 4, 10);
  insert into tests.fixtures values ('OF', o);
end $$;
select is(tests.to_ready(tests.fx('OF'), tests.fx('F')), 'n:1 n:1 n:1', 'farmer listing: the seller confirms, processes and readies the order');
select is((select quantity from public.listings where id = tests.fx('LF')), 4::numeric, 'farmer listing: nothing taken before dispatch');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'dispatched' where id = $$ || tests.l('OF'), 'err:42501', 'dispatch: the buyer cannot dispatch');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'dispatched' where id = $$ || tests.l('OF'), 'n:1', 'dispatch: the seller dispatches');
select is((select quantity from public.listings where id = tests.fx('LF')), 0::numeric, 'farmer listing: dispatch took the 4 units');
select is((select status::text from public.listings where id = tests.fx('LF')), 'sold', 'farmer listing: at 0 it is sold');
select is((select count(*) from public.order_events where order_id = tests.fx('OF') and type = 'dispatched' and inventory_applied_at is not null), 1::bigint, 'events: one applied event for the one line');
select tests.expect(tests.fx('F'), 'update public.listings set quantity = 2 where id = ' || tests.l('LF'), 'n:1', 'farmer listing: the owner restocks it');
select is((select status::text from public.listings where id = tests.fx('LF')), 'active', 'farmer listing: and it is for sale again');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'completed' where id = $$ || tests.l('OF'), 'n:1', 'dispatch: the seller completes the dispatched order');

-- ── a dealer's listing with inventory: dispatch takes the inventory row ───

do $$
declare o uuid;
begin
  insert into public.orders (buyer_id, seller_id, delivery_charge) values (tests.fx('F'), tests.fx('D'), 0) returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, tests.fx('LDOK'), 6, 50);
  insert into tests.fixtures values ('OD', o);
end $$;
select is(tests.to_ready(tests.fx('OD'), tests.fx('D')), 'n:1 n:1 n:1', 'dealer listing: confirmed, processing, ready');
select is((select stock_quantity from public.inventory where listing_id = tests.fx('LDOK')), 20::numeric, 'dealer listing: the inventory is untouched until dispatch');
select tests.expect(tests.fx('D'), $$update public.orders set status = 'dispatched' where id = $$ || tests.l('OD'), 'n:1', 'dealer listing: the dealer dispatches');
select is((select stock_quantity from public.inventory where listing_id = tests.fx('LDOK')), 14::numeric, 'dealer listing: the inventory lost the 6 units');
select is((select count(*) from public.inventory_transactions t join public.inventory i on i.id = t.inventory_id where i.listing_id = tests.fx('LDOK') and t.type = 'sale' and t.quantity = -6), 1::bigint, 'dealer listing: with one sale row in the ledger');
select is((select quantity from public.listings where id = tests.fx('LDOK')), 1::numeric, 'dealer listing: the listing quantity is not the stock and is left alone');

-- ── one event per line; none for an order cancelled before dispatch ───────

do $$
declare o uuid; c uuid;
begin
  insert into public.orders (buyer_id, seller_id, delivery_charge) values (tests.fx('B'), tests.fx('F'), 0) returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, tests.fx('LF2'), 2, 10), (o, tests.fx('L1'), 1, 100);
  insert into public.orders (buyer_id, seller_id, delivery_charge) values (tests.fx('B'), tests.fx('F'), 0) returning id into c;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (c, tests.fx('LF2'), 1, 10);
  insert into tests.fixtures values ('OTWO', o), ('OCANCEL', c);
end $$;
select is(tests.to_ready(tests.fx('OTWO'), tests.fx('F')), 'n:1 n:1 n:1', 'events: a two-line order reaches ready');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'dispatched' where id = $$ || tests.l('OTWO'), 'n:1', 'events: and is dispatched');
select is((select count(*) from public.order_events where order_id = tests.fx('OTWO')), 2::bigint, 'events: exactly one per line');
select is((select count(distinct order_item_id) from public.order_events where order_id = tests.fx('OTWO')), 2::bigint, 'events: each names its own line');
select throws_ok(
  format('insert into public.order_events (order_id, order_item_id, seller_id, listing_id, quantity, type) select order_id, order_item_id, seller_id, listing_id, quantity, type from public.order_events where order_id = %L limit 1', tests.fx('OTWO')),
  '23505', null, 'events: a second event for the same line is refused, even server side (SRDS §21)');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'confirmed' where id = $$ || tests.l('OCANCEL'), 'n:1', 'cancel: the seller confirms...');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'cancelled' where id = $$ || tests.l('OCANCEL'), 'n:1', 'cancel: ...and the buyer cancels before dispatch');
select is((select count(*) from public.order_events where order_id = tests.fx('OCANCEL')), 0::bigint, 'cancel: no event, nothing taken');
select is((select quantity from public.listings where id = tests.fx('LF2')), 8::numeric, 'cancel: only the dispatched order''s 2 units left the listing');

-- ── a known shortage refuses the dispatch, and writes nothing (D6) ────────

do $$
declare o uuid;
begin
  insert into public.orders (buyer_id, seller_id, delivery_charge) values (tests.fx('B'), tests.fx('F'), 0) returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, tests.fx('LSHORT'), 3, 10);
  insert into tests.fixtures values ('OSHORT', o);
end $$;
select is(tests.to_ready(tests.fx('OSHORT'), tests.fx('F')), 'n:1 n:1 n:1', 'shortage: an order for 3 of 5 confirms and reaches ready');
update public.listings set quantity = 2 where id = tests.fx('LSHORT');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'dispatched' where id = $$ || tests.l('OSHORT'), 'err:P0001', 'shortage: with 2 left the dispatch is refused');
select is((select status::text from public.orders where id = tests.fx('OSHORT')), 'ready', 'shortage: the order stays ready');
select is((select quantity from public.listings where id = tests.fx('LSHORT')), 2::numeric, 'shortage: nothing was taken');
select is((select count(*) from public.order_events where order_id = tests.fx('OSHORT')), 0::bigint, 'shortage: and no event was written');

-- ── an order confirmed before this migration is not cut twice ─────────────

do $$
declare o uuid;
begin
  insert into public.orders (buyer_id, seller_id, delivery_charge, status, stock_cut_at_confirm)
    values (tests.fx('B'), tests.fx('D'), 0, 'ready', true) returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, tests.fx('LLEGACY'), 3, 50);
  insert into tests.fixtures values ('OLEGACY', o);
end $$;
select tests.expect(tests.fx('D'), $$update public.orders set status = 'dispatched' where id = $$ || tests.l('OLEGACY'), 'n:1', 'legacy: an order whose stock was cut at confirm is dispatched');
select is((select stock_quantity from public.inventory where listing_id = tests.fx('LLEGACY')), 7::numeric, 'legacy: its stock is not cut a second time');
select is((select count(*) from public.order_events where order_id = tests.fx('OLEGACY') and inventory_applied_at is not null), 1::bigint, 'legacy: its event is written, already applied');
select tests.expect(tests.fx('D'), 'update public.orders set stock_cut_at_confirm = false where id = ' || tests.l('OLEGACY'), 'err:42501', 'legacy: no client can clear the marker');
select tests.expect(tests.fx('B'), 'insert into public.orders (buyer_id, seller_id, delivery_charge, stock_cut_at_confirm) values (' || tests.l('B') || ',' || tests.l('D') || ', 0, true)', 'n:1', 'legacy: a buyer sending the marker on a new order is accepted...');
select is((select count(*) from public.orders where buyer_id = tests.fx('B') and stock_cut_at_confirm and id <> tests.fx('OLEGACY')), 0::bigint, 'legacy: ...but it is reset, so dispatch still takes the stock');

-- ── the outbox is server side only ────────────────────────────────────────

select tests.expect(tests.fx('F'), 'select id from public.order_events', 'err:42501', 'events: the seller cannot read the outbox');
select tests.expect(tests.fx('B'), 'select id from public.order_events', 'err:42501', 'events: nor the buyer');
select tests.expect(tests.fx('A'), 'select id from public.order_events', 'err:42501', 'events: nor the admin', 'aal2');
select tests.expect(tests.fx('F'), 'insert into public.order_events (order_id, order_item_id, seller_id, quantity, type) select order_id, order_item_id, seller_id, quantity, type from public.order_events limit 1', 'err:42501', 'events: and no client can write one');
select ok(has_table_privilege('service_role', 'public.order_events', 'select'), 'events: the server-side sync reads them');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('apply_order_dispatch', 'check_stock_on_confirm', 'listing_availability')
     and p.prosecdef
     and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=public, pg_temp')),
  array['apply_order_dispatch', 'check_stock_on_confirm', 'listing_availability'],
  'every definer function here pins search_path with pg_temp last');
select ok(not has_function_privilege('authenticated', 'public.apply_order_dispatch()', 'execute'), 'the dispatch cut cannot be called directly');

-- ── availability: a word per listing ──────────────────────────────────────

select tests.expect(tests.fx('B'), 'select 1 from public.listing_availability(array[' || tests.l('LF2') || '::uuid]) where availability = ''in_stock''', 'rows:1', 'availability: a listing with units left is in stock');
update public.listings set quantity = 0 where id = tests.fx('LSHORT');
select tests.expect(tests.fx('B'), 'select 1 from public.listing_availability(array[' || tests.l('LSHORT') || '::uuid]) where availability = ''out_of_stock''', 'rows:1', 'availability: a listing at 0 is out of stock');
select tests.expect(tests.fx('B'), 'select 1 from public.listing_availability(array[' || tests.l('LDLOW') || '::uuid]) where availability = ''low_stock''', 'rows:1', 'availability: a dealer row at or under its threshold is low');
select tests.expect(tests.fx('B'), 'select 1 from public.listing_availability(array[' || tests.l('LDOUT') || '::uuid]) where availability = ''out_of_stock''', 'rows:1', 'availability: a dealer row at 0 is out, whatever the listing says');
select tests.expect(tests.fx('B'), 'select 1 from public.listing_availability(array[' || tests.l('LDOK') || '::uuid]) where availability = ''in_stock''', 'rows:1', 'availability: a dealer row above its threshold is in stock');
select tests.expect(tests.fx('B'), 'select 1 from public.listing_availability(array[' || tests.l('LDOK') || '::uuid, ' || tests.l('LDLOW') || '::uuid, ' || tests.l('LF2') || '::uuid])', 'rows:3', 'availability: one answer per listing asked');
select tests.expect(null, 'select 1 from public.listing_availability(array[' || tests.l('LF2') || '::uuid])', 'rows:1', 'availability: anon may ask too (listings are public; the figures are not)');
select tests.expect(null, 'select 1 from public.listing_availability(array[' || tests.l('L2') || '::uuid])', 'rows:0', 'availability: a hidden listing gets no answer');
select tests.expect(tests.fx('F'), 'select 1 from public.listing_availability(array[' || tests.l('L2') || '::uuid])', 'rows:1', 'availability: except to its owner');

select * from finish();
rollback;
