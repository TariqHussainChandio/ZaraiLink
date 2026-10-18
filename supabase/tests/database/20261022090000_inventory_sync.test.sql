-- Pair for migration 20261022090000_inventory_sync.sql (B3, SRDS §19-§21, §48, §53.39, D5-D8): marketplace dispatch
-- reaches the dealer Inventory Management System in the dispatch transaction. Proves:
--   * dispatch deducts once per order line, as a ZARAILINK_ORDER movement carrying the order id and the order line id,
--     from the linked product at the default location only;
--   * a replay of the event, a second dispatch call, or a reset consumer deducts nothing more (the unique ledger index on
--     order_item_id), and a cancelled order deducts nothing;
--   * a known shortage still refuses the dispatch (D6), now summed per product; an IMS that cannot apply a line (no
--     default location, not enough stock on retry, the listing unlinked) never blocks the dispatch: the line stays
--     pending with its reason in inventory_sync_log, and the owning dealer's retry applies it once, oldest first;
--   * a line with no linked product takes the listing's own quantity and leaves the IMS alone;
--   * only the owning, approved, unsuspended dealer retries or reads the log: never another dealer, a pending or
--     suspended dealer, the admin (with or without the second factor), a buyer, a farmer or anon;
--   * availability reads IMS stock at the default location and never errors for a listing with no link;
--   * the low-stock alert fires once when the default-location stock crosses the threshold, unless turned off;
--   * the legacy inventory objects are gone; grants, policies and search_path are explicit.
-- The B3 exit's concurrent dispatches need two sessions, which pgTAP cannot open: the row locks, the D6 check and the
-- unique ledger index proven here are what make them safe, and the real-stack API tests race them.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();

-- ---------------------------------------------------------------------------------------------------------------------
-- Fixtures, as the owner. Approved dealers SA (two locations), SB (one, low-stock alerts off) and SN (no location at
-- all); a pending dealer SPD; a suspended dealer SSD; a farmer SF; a buyer SBU; the admin SADM.
--   SA: LA default 'A shop', LA2 'A godown'. PA1 Urea (threshold 4): 10 at LA, 5 at LA2. PA2 DAP: 2 at LA. PA3 Seed: 5
--       at LA, linked from two listings. PA4 Potash: 5 at LA2 only. Listings LIST1 -> PA1 (listing quantity 1), LIST2 ->
--       PA2, LIST3A and LIST3B -> PA3, LIST4 -> PA4, LISTU with no link (quantity 5).
--   SB: LB default; PB (threshold 2): 4 at LB; LISTB -> PB.
--   SN: PN with no stock anywhere; LISTN -> PN.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  a uuid := tests.make_user('SA', 'dealer');
  b uuid := tests.make_user('SB', 'dealer');
  n uuid := tests.make_user('SN', 'dealer');
  pd uuid := tests.make_user('SPD', 'dealer');
  sd uuid := tests.make_user('SSD', 'dealer');
  f uuid := tests.make_user('SF', 'farmer');
  bu uuid := tests.make_user('SBU', 'buyer');
  adm uuid := tests.make_user('SADM', 'buyer');
  la uuid; la2 uuid; lb uuid; pa1 uuid; pa2 uuid; pa3 uuid; pa4 uuid; pb uuid; pn uuid; l uuid; v record;
begin
  alter table public.profiles disable trigger guard_profiles_role;
  update public.profiles set role = 'admin' where id = adm;
  alter table public.profiles enable trigger guard_profiles_role;
  perform tests.approve(array[a, b, n, sd]);
  update public.profiles set is_suspended = true where id = sd;

  insert into public.inventory_locations (dealer_id, name, kind, is_default) values (a, 'A shop', 'shop', true) returning id into la;
  insert into public.inventory_locations (dealer_id, name, kind) values (a, 'A godown', 'godown') returning id into la2;
  insert into public.inventory_locations (dealer_id, name, is_default) values (b, 'B shop', true) returning id into lb;
  insert into public.inventory_products (dealer_id, sku, name, reorder_threshold) values (a, 'UREA', 'Urea', 4) returning id into pa1;
  insert into public.inventory_products (dealer_id, sku, name) values (a, 'DAP', 'DAP') returning id into pa2;
  insert into public.inventory_products (dealer_id, sku, name) values (a, 'SEED', 'Seed') returning id into pa3;
  insert into public.inventory_products (dealer_id, sku, name) values (a, 'POTASH', 'Potash') returning id into pa4;
  insert into public.inventory_products (dealer_id, sku, name, reorder_threshold) values (b, 'B-1', 'B item', 2) returning id into pb;
  insert into public.inventory_products (dealer_id, sku, name) values (n, 'N-1', 'N item') returning id into pn;
  insert into public.inventory_alert_settings (dealer_id, notify_low_stock) values (a, true), (b, false);

  perform public.inventory_apply_movement(a, pa1, la, 'in', 'RESTOCK', 10, null, a);
  perform public.inventory_apply_movement(a, pa1, la2, 'in', 'RESTOCK', 5, null, a);
  perform public.inventory_apply_movement(a, pa2, la, 'in', 'RESTOCK', 2, null, a);
  perform public.inventory_apply_movement(a, pa3, la, 'in', 'RESTOCK', 5, null, a);
  perform public.inventory_apply_movement(a, pa4, la2, 'in', 'RESTOCK', 5, null, a);
  perform public.inventory_apply_movement(b, pb, lb, 'in', 'RESTOCK', 4, null, b);

  insert into tests.fixtures values ('LA', la), ('LA2', la2), ('LB', lb), ('PA1', pa1), ('PA2', pa2), ('PA3', pa3),
    ('PA4', pa4), ('PB', pb), ('PN', pn);
  for v in
    select * from (values
      ('LIST1', a, pa1, 1), ('LIST2', a, pa2, 1), ('LIST3A', a, pa3, 1), ('LIST3B', a, pa3, 1), ('LIST4', a, pa4, 1),
      ('LISTU', a, null, 5), ('LISTB', b, pb, 1), ('LISTN', n, pn, 1)
    ) x(k, owner, product, qty)
  loop
    insert into public.listings (owner_id, title, price, quantity, status, seller_role, inventory_product_id)
      values (v.owner, v.k, 50, v.qty, 'active', 'dealer', v.product) returning id into l;
    insert into tests.fixtures values (v.k, l);
  end loop;
end $$;

-- An order of buyer SBU from a seller, as the owner, with lines given as (listing key, quantity); `_status` 'ready' puts
-- it straight at the dispatch step (the owner bypasses the order guards, as the fixtures of the A4 tests do).
create function tests.order_of(_key text, _seller text, _lines jsonb, _status text default 'ready', _cut boolean default false)
returns uuid language plpgsql as $$
declare o uuid; line record;
begin
  insert into public.orders (buyer_id, seller_id, delivery_charge, status, stock_cut_at_confirm)
    values (tests.fx('SBU'), tests.fx(_seller), 0, _status::public.order_status, _cut) returning id into o;
  for line in select key, value from jsonb_each_text(_lines) loop
    insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, tests.fx(line.key), line.value::numeric, 50);
  end loop;
  insert into tests.fixtures values (_key, o);
  return o;
end $$;

create function tests.dispatch(_seller text, _order text) returns text language sql as $$
  select tests.probe(tests.fx(_seller), format('update public.orders set status = %L where id = %s', 'dispatched', tests.l(_order)))
$$;

-- retry_dispatch_events() as a user: 'applied:N' (its return value) or 'err:XXXXX'. Same session handling as tests.probe.
create function tests.retry_as(_uid uuid, _aal text default 'aal1') returns text language plpgsql as $$
declare n integer; result text;
begin
  if _uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'aal', _aal)::text, true);
    execute 'set local role authenticated';
  end if;
  begin
    execute 'select public.retry_dispatch_events()' into n;
    result := 'applied:' || n;
  exception when others then
    result := 'err:' || sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return result;
end $$;

create function tests.stock(_product text, _location text) returns numeric language sql as $$
  select coalesce((select quantity from public.inventory_stock
                    where product_id = tests.fx(_product) and location_id = tests.fx(_location)), 0)
$$;
create function tests.event_of(_order text) returns uuid language sql as $$
  select id from public.order_events where order_id = tests.fx(_order) order by created_at, id limit 1
$$;
create function tests.order_moves(_order text) returns bigint language sql as $$
  select count(*) from public.inventory_movements where order_id = tests.fx(_order)
$$;
create function tests.log_of(_order text) returns text language sql as $$
  select s.status || coalesce(': ' || s.error, '')
    from public.inventory_sync_log s join public.order_events e on e.id = s.order_event_id
   where e.order_id = tests.fx(_order)
$$;
create function tests.low_alerts(_dealer text, _product text) returns bigint language sql as $$
  select count(*) from public.notifications
   where user_id = tests.fx(_dealer) and type = 'inventory_low_stock' and payload ->> 'product_id' = tests.fx(_product)::text
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Structure: the legacy inventory is gone; grants, policies and definer settings are explicit
-- ---------------------------------------------------------------------------------------------------------------------
select hasnt_table('public', 'inventory', 'legacy: inventory is dropped');
select hasnt_table('public', 'inventory_transactions', 'legacy: inventory_transactions is dropped');
select hasnt_table('public', 'dealer_stores', 'legacy: dealer_stores is dropped');
select hasnt_table('public', 'suppliers', 'legacy: suppliers is dropped');
select hasnt_function('public', 'adjust_stock', array['uuid', 'text', 'numeric', 'uuid', 'text'], 'legacy: adjust_stock is dropped');
select hasnt_function('public', 'notify_inventory_low_stock', array[]::text[], 'legacy: the old low-stock trigger function is dropped');
select hasnt_type('public', 'inventory_transaction_type', 'legacy: inventory_transaction_type is dropped');
select has_trigger('public', 'inventory_stock', 'notify_inventory_stock_low', 'the low-stock alert reads the new stock');
select has_trigger('public', 'orders', 'apply_order_dispatch', 'dispatch still runs through the A4 trigger');

select policies_are('public', 'inventory_sync_log', array['inventory_sync_log_select_owner'],
  'inventory_sync_log has exactly one policy: the owner reads');
select ok((select relrowsecurity from pg_class where oid = 'public.inventory_sync_log'::regclass), 'inventory_sync_log has row-level security on');
select table_privs_are('public', 'inventory_sync_log', 'authenticated', array['SELECT'], 'authenticated may only read inventory_sync_log');
select table_privs_are('public', 'inventory_sync_log', 'anon', array[]::text[], 'anon has no privilege on inventory_sync_log');
select table_privs_are('public', 'inventory_sync_log', 'service_role', array['SELECT'], 'service_role may only read inventory_sync_log');
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'inventory_sync_log'
      and (coalesce(qual, '') ~* 'is_admin|''admin''' or coalesce(with_check, '') ~* 'is_admin|''admin''')),
  0::bigint, 'no sync-log policy has an admin branch (SRDS §15)');

select ok(has_function_privilege('authenticated', 'public.retry_dispatch_events()', 'execute'), 'a signed-in user may call retry_dispatch_events (it checks who)');
select ok(not has_function_privilege('anon', 'public.retry_dispatch_events()', 'execute'), 'anon may not call retry_dispatch_events');
select ok(not has_function_privilege('authenticated', 'public.retry_dispatch_events_for(uuid)', 'execute'), 'no client may retry for a named dealer');
select ok(not has_function_privilege('anon', 'public.retry_dispatch_events_for(uuid)', 'execute'), 'nor anon');
select ok(has_function_privilege('service_role', 'public.retry_dispatch_events_for(uuid)', 'execute'), 'the server may retry for a dealer');
select ok(not has_function_privilege('authenticated', 'public.apply_dispatch_event(uuid)', 'execute'), 'no client may apply a dispatch event');
select ok(has_function_privilege('service_role', 'public.apply_dispatch_event(uuid)', 'execute'), 'the server may apply one');
select ok(not has_function_privilege('authenticated', 'public.notify_inventory_stock_low()', 'execute'), 'the low-stock trigger function is not callable');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('apply_order_dispatch', 'available_stock', 'listing_availability', 'notify_inventory_stock_low',
                        'retry_dispatch_events', 'retry_dispatch_events_for')
      and p.prosecdef
      and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=public, pg_temp')),
  array['apply_order_dispatch', 'available_stock', 'listing_availability', 'notify_inventory_stock_low',
        'retry_dispatch_events', 'retry_dispatch_events_for'],
  'every definer function this migration defines pins search_path with pg_temp last');
select is(tests.probe(tests.fx('SA'), format('select public.retry_dispatch_events_for(%s)', tests.l('SB'))), 'err:42501',
  'A cannot call the internal retry for B');
select is(tests.probe(tests.fx('SA'), format('select public.apply_dispatch_event(%L::uuid)', gen_random_uuid())), 'err:42501',
  'A cannot call apply_dispatch_event');

-- ---------------------------------------------------------------------------------------------------------------------
-- Dispatch deducts once per line from the linked product at the default location (real path: the seller's steps)
-- ---------------------------------------------------------------------------------------------------------------------
select tests.order_of('O1', 'SA', '{"LIST1": 3}', 'pending');
select is(
  tests.probe(tests.fx('SA'), format('update public.orders set status = %L where id = %s', 'confirmed', tests.l('O1'))) || ' ' ||
  tests.probe(tests.fx('SA'), format('update public.orders set status = %L where id = %s', 'processing', tests.l('O1'))) || ' ' ||
  tests.probe(tests.fx('SA'), format('update public.orders set status = %L where id = %s', 'ready', tests.l('O1'))),
  'n:1 n:1 n:1', 'A confirms, processes and readies an order for 3 Urea');
select is(tests.stock('PA1', 'LA'), 10.00::numeric, 'nothing leaves the IMS before dispatch (D5)');
select is(tests.dispatch('SBU', 'O1'), 'err:42501', 'the buyer cannot dispatch');
select is(tests.dispatch('SA', 'O1'), 'n:1', 'A dispatches it');
select is((select status::text from public.orders where id = tests.fx('O1')), 'dispatched', 'the order is dispatched');
select is(tests.stock('PA1', 'LA'), 7.00::numeric, 'the default location lost the 3 units');
select is(tests.stock('PA1', 'LA2'), 5.00::numeric, 'the godown is untouched (dispatch takes from the default location, D8)');
select results_eq(
  format('select direction::text, source::text, quantity, quantity_before, quantity_after, product_id, location_id, order_id, order_item_id, actor
            from public.inventory_movements where order_id = %s', tests.l('O1')),
  format('select %L, %L, 3.00::numeric, 10.00::numeric, 7.00::numeric, %s, %s, %s, oi.id, null::uuid from public.order_items oi where oi.order_id = %s',
         'out', 'ZARAILINK_ORDER', tests.l('PA1'), tests.l('LA'), tests.l('O1'), tests.l('O1')),
  'one ZARAILINK_ORDER movement: out 3, 10 -> 7, the product at the default location, the order id and the order line id');
select is((select quantity from public.listings where id = tests.fx('LIST1')), 1::numeric, 'a linked listing''s own quantity is not the stock and is left alone');
select is((select count(*) from public.order_events where order_id = tests.fx('O1') and inventory_applied_at is not null), 1::bigint,
  'one event, applied in the dispatch transaction');
select results_eq(
  format('select status, error, attempts, dealer_id from public.inventory_sync_log where order_event_id = %L', tests.event_of('O1')),
  format('values (%L, null::text, 1, %s)', 'applied', tests.l('SA')),
  'the sync log records it applied, for A, at the first attempt');

-- ---------------------------------------------------------------------------------------------------------------------
-- Replays deduct nothing more (SRDS §21)
-- ---------------------------------------------------------------------------------------------------------------------
select is(public.apply_dispatch_event(tests.event_of('O1')), 'skipped_duplicate', 'replaying the event is a recorded no-op');
select is(tests.stock('PA1', 'LA'), 7.00::numeric, 'the replay took nothing');
select is(tests.order_moves('O1'), 1::bigint, 'and wrote no second movement');
select results_eq(
  format('select status, attempts from public.inventory_sync_log where order_event_id = %L', tests.event_of('O1')),
  format('values (%L, 2)', 'applied'),
  'the log keeps applied and counts the attempt');
select is(tests.dispatch('SA', 'O1'), 'n:1', 'a second dispatch call on the same order is a no-op update...');
select is(tests.stock('PA1', 'LA'), 7.00::numeric, '...that takes nothing');
select is((select count(*) from public.order_events where order_id = tests.fx('O1')), 1::bigint, '...and writes no second event');
-- A consumer that lost its mark (inventory_applied_at reset, as after a crash between the movement and the mark): the
-- retry finds the movement and skips it.
update public.order_events set inventory_applied_at = null where id = tests.event_of('O1');
select is(tests.retry_as(tests.fx('SA')), 'applied:1', 'A''s retry picks up the unmarked event...');
select is(tests.stock('PA1', 'LA'), 7.00::numeric, '...and deducts nothing (skipped as a duplicate)');
select is((select count(*) from public.order_events where id = tests.event_of('O1') and inventory_applied_at is not null), 1::bigint, '...marking it applied again');
select throws_ok(
  format($$insert into public.inventory_movements (dealer_id, product_id, location_id, direction, source, quantity, quantity_before, quantity_after, order_id, order_item_id)
           select %s, %s, %s, 'out', 'ZARAILINK_ORDER', 1, 7, 6, %s, oi.id from public.order_items oi where oi.order_id = %s$$,
         tests.l('SA'), tests.l('PA1'), tests.l('LA'), tests.l('O1'), tests.l('O1')),
  '23505', null, 'a second ZARAILINK_ORDER movement for the same order line is refused even for the table owner');

-- ---------------------------------------------------------------------------------------------------------------------
-- A cancelled order deducts nothing
-- ---------------------------------------------------------------------------------------------------------------------
select tests.order_of('O2', 'SA', '{"LIST1": 2}', 'pending');
select is(tests.probe(tests.fx('SA'), format('update public.orders set status = %L where id = %s', 'confirmed', tests.l('O2'))), 'n:1', 'cancel: A confirms an order for 2...');
select is(tests.probe(tests.fx('SBU'), format('update public.orders set status = %L where id = %s', 'cancelled', tests.l('O2'))), 'n:1', 'cancel: ...and the buyer cancels it');
select is(tests.stock('PA1', 'LA'), 7.00::numeric, 'cancel: the stock is unchanged');
select is(tests.order_moves('O2'), 0::bigint, 'cancel: no movement');
select is((select count(*) from public.order_events where order_id = tests.fx('O2')), 0::bigint, 'cancel: no event, so nothing to sync');

-- ---------------------------------------------------------------------------------------------------------------------
-- A known shortage still refuses the dispatch (D6), summed per product
-- ---------------------------------------------------------------------------------------------------------------------
select tests.order_of('O3', 'SA', '{"LIST2": 3}');
select is(tests.dispatch('SA', 'O3'), 'err:P0001', 'D6: 3 DAP with 2 at the default location is refused');
select is((select status::text from public.orders where id = tests.fx('O3')), 'ready', 'D6: the order stays ready');
select is(tests.stock('PA2', 'LA'), 2.00::numeric, 'D6: nothing taken');
select is((select count(*) from public.order_events where order_id = tests.fx('O3')), 0::bigint, 'D6: no event written');
select tests.order_of('O4', 'SA', '{"LIST3A": 3, "LIST3B": 3}');
select is(tests.dispatch('SA', 'O4'), 'err:P0001', 'D6: two listings of one product needing 3 + 3 of 5 are refused together (fixed in B3 testing)');
select is(tests.stock('PA3', 'LA'), 5.00::numeric, 'D6: nothing taken from the shared product');
select tests.order_of('O5', 'SA', '{"LIST3A": 2, "LIST3B": 3}');
select is(tests.dispatch('SA', 'O5'), 'n:1', '2 + 3 of 5 dispatches');
select is(tests.stock('PA3', 'LA'), 0.00::numeric, 'the shared product is at 0');
select is(tests.order_moves('O5'), 2::bigint, 'one movement per line');
select is((select count(distinct order_item_id) from public.inventory_movements where order_id = tests.fx('O5')), 2::bigint, 'each naming its own line');
select is((select count(*) from public.inventory_sync_log s join public.order_events e on e.id = s.order_event_id
            where e.order_id = tests.fx('O5') and s.status = 'applied'), 2::bigint, 'two applied log rows');

-- ---------------------------------------------------------------------------------------------------------------------
-- A line with no linked product takes the listing's quantity; the IMS has nothing to apply
-- ---------------------------------------------------------------------------------------------------------------------
-- No pending log row here on purpose: the listing's own quantity already moved, so a later IMS deduction (after the
-- listing is linked) would count the sale twice. The pending "not linked" case is a linked line unlinked while pending
-- (below).
select tests.order_of('O8', 'SA', '{"LISTU": 2}');
select is(tests.dispatch('SA', 'O8'), 'n:1', 'unlinked: a line with no linked product does not block the dispatch');
select is((select quantity from public.listings where id = tests.fx('LISTU')), 3::numeric, 'unlinked: the listing''s own quantity fell 5 -> 3');
select is(tests.order_moves('O8'), 0::bigint, 'unlinked: no IMS movement');
select is((select count(*) from public.order_events where order_id = tests.fx('O8') and inventory_applied_at is not null), 1::bigint,
  'unlinked: its event is written already applied, so no retry ever deducts it from the IMS');

-- ---------------------------------------------------------------------------------------------------------------------
-- An order whose stock was cut at confirm (before A4) is not cut again
-- ---------------------------------------------------------------------------------------------------------------------
select tests.order_of('O11', 'SA', '{"LIST1": 1}', 'ready', true);
select is(tests.dispatch('SA', 'O11'), 'n:1', 'legacy: an order cut at confirm is dispatched');
select is(tests.stock('PA1', 'LA'), 7.00::numeric, 'legacy: the IMS is not cut a second time');
select is(tests.order_moves('O11'), 0::bigint, 'legacy: no movement');
select is(tests.log_of('O11'), null, 'legacy: nothing to log');

-- ---------------------------------------------------------------------------------------------------------------------
-- The IMS cannot apply: the dispatch goes through, the line stays pending with its reason, and the owner's retry applies
-- it once, oldest first (§53.39, D7)
-- ---------------------------------------------------------------------------------------------------------------------
select tests.order_of('O6', 'SN', '{"LISTN": 3}');
select tests.order_of('O6B', 'SN', '{"LISTN": 1}');
select is(tests.dispatch('SN', 'O6'), 'n:1', 'no default location: N''s dispatch is not blocked (fixed in B3 testing: not a known shortage)');
-- Make the order explicit: everything in one test transaction shares now(). O6 (3 units) is older than O6B (1 unit).
update public.order_events set created_at = now() - interval '2 minutes' where id = tests.event_of('O6');
select is(tests.dispatch('SN', 'O6B'), 'n:1', 'no default location: nor a second one');
update public.order_events set created_at = now() - interval '1 minute' where id = tests.event_of('O6B');
select is((select count(*) from public.orders where id in (tests.fx('O6'), tests.fx('O6B')) and status = 'dispatched'), 2::bigint,
  'both orders are dispatched');
select is(tests.log_of('O6'), 'failed: No default location', 'the log says why');
select is(tests.log_of('O6B'), 'failed: Waiting for an earlier order of this product', 'the younger line of the same product waits behind it');
select is((select count(*) from public.order_events where seller_id = tests.fx('SN') and inventory_applied_at is null), 2::bigint,
  'both events stay pending');
select is((select count(*) from public.inventory_movements where dealer_id = tests.fx('SN')), 0::bigint, 'and nothing was deducted');

select is(tests.probe(tests.fx('SN'), format('insert into public.inventory_locations (dealer_id, name, is_default) values (%s, %L, true)', tests.l('SN'), 'N shop')),
  'n:1', 'N creates a default location');
insert into tests.fixtures select 'LN', id from public.inventory_locations where dealer_id = tests.fx('SN');
select is(tests.retry_as(tests.fx('SN')), 'applied:0', 'N retries: nothing can apply with no stock');
select ok(tests.log_of('O6') like 'failed: Only 0.00 in stock%', 'not enough stock: the log says so, and the event stays pending');
select is((select attempts from public.inventory_sync_log where order_event_id = tests.event_of('O6B')), 2, 'each retry counts an attempt');

select is(tests.probe(tests.fx('SN'), format('update public.listings set inventory_product_id = null where id = %s', tests.l('LISTN'))), 'n:1',
  'N unlinks the listing while its events are pending');
select is(tests.retry_as(tests.fx('SN')), 'applied:0', 'N retries: still nothing applies');
select ok(tests.log_of('O6') like 'failed: Only 0.00 in stock%',
  'F4: unlinking the listing changes nothing: the line still deducts from the product recorded at dispatch');
select is(tests.probe(tests.fx('SN'), format('update public.listings set inventory_product_id = %s where id = %s', tests.l('PN'), tests.l('LISTN'))), 'n:1',
  'N links it again');

-- Nobody but N retries N's events or reads N's log.
select is(tests.retry_as(tests.fx('SB')), 'applied:0', 'B''s retry applies only B''s events (none)...');
select is((select count(*) from public.order_events where seller_id = tests.fx('SN') and inventory_applied_at is null), 2::bigint, '...and leaves N''s pending');
select is(tests.retry_as(tests.fx('SPD')), 'err:42501', 'a pending dealer cannot retry');
select is(tests.retry_as(tests.fx('SSD')), 'err:42501', 'a suspended dealer cannot retry');
select is(tests.retry_as(tests.fx('SADM')), 'err:42501', 'the admin cannot retry');
select is(tests.retry_as(tests.fx('SADM'), 'aal2'), 'err:42501', 'not even with the second factor');
select is(tests.retry_as(tests.fx('SBU')), 'err:42501', 'a buyer cannot retry');
select is(tests.retry_as(tests.fx('SF')), 'err:42501', 'a farmer cannot retry');
select is(tests.retry_as(null), 'err:42501', 'anon cannot retry');
select is((select count(*) from public.order_events where seller_id = tests.fx('SN') and inventory_applied_at is null), 2::bigint,
  'the refused retries applied nothing');

select is(tests.probe(tests.fx('SN'), format('select public.record_movement(%s, %s, %L, %L, 3)', tests.l('PN'), tests.l('LN'), 'in', 'RESTOCK')), 'rows:1',
  'N restocks 3');
select is(tests.retry_as(tests.fx('SN')), 'applied:1', 'N retries: one event applies');
select is(tests.log_of('O6'), 'applied', 'the older event (3 units) applied first...');
select ok(tests.log_of('O6B') like 'failed: Only 0.00 in stock%', '...the younger one waits for stock');
select is(tests.stock('PN', 'LN'), 0.00::numeric, 'N''s stock is 3 - 3 = 0');
select is(tests.retry_as(tests.fx('SN')), 'applied:0', 'a second retry with no stock applies nothing more');
select is(tests.order_moves('O6'), 1::bigint, 'the older order has exactly one movement');
select is(tests.probe(tests.fx('SN'), format('select public.record_movement(%s, %s, %L, %L, 1)', tests.l('PN'), tests.l('LN'), 'in', 'RESTOCK')), 'rows:1',
  'N restocks 1');
select is(tests.retry_as(tests.fx('SN')), 'applied:1', 'the younger event applies');
select is(tests.log_of('O6B'), 'applied', 'its log row is applied, the error cleared');
select is((select count(*) from public.order_events where seller_id = tests.fx('SN') and inventory_applied_at is null), 0::bigint, 'nothing of N''s is pending');
select results_eq(
  format('select m.order_id, m.order_item_id, m.quantity from public.inventory_movements m where m.dealer_id = %s and m.source = %L order by m.quantity desc',
         tests.l('SN'), 'ZARAILINK_ORDER'),
  format('select oi.order_id, oi.id, oi.quantity::numeric(12, 2) from public.order_items oi where oi.order_id in (%s, %s) order by oi.quantity desc',
         tests.l('O6'), tests.l('O6B')),
  'each applied line has one ZARAILINK_ORDER movement with its order id and order line id');
select is(tests.retry_as(tests.fx('SN')), 'applied:0', 'once applied, a retry finds nothing');
select is(tests.stock('PN', 'LN'), 0.00::numeric, 'and the stock stays at 0');
select is(
  tests.probe(tests.fx('SN'), format('select 1 from public.inventory_reconciliation() where product_id = %s and balanced and marketplace_sales = -4 and current_stock = 0', tests.l('PN'))),
  'rows:1', 'N''s product reconciles: restocks 4, marketplace sales -4, stock 0 (§25)');

-- ---------------------------------------------------------------------------------------------------------------------
-- Who reads the sync log: the owning approved dealer only
-- ---------------------------------------------------------------------------------------------------------------------
create function tests.log_reads(_uid uuid, _aal text default 'aal1') returns text language sql as $$
  select tests.probe(_uid, format('select 1 from public.inventory_sync_log where order_event_id = %L', tests.event_of('O1')), _aal) || ' ' ||
         tests.probe(_uid, format('select 1 from public.inventory_sync_log where dealer_id = %s', tests.l('SN')), _aal)
$$;
select is(tests.log_reads(tests.fx('SA')), 'rows:1 rows:0', 'A reads A''s log row, none of N''s');
select is(tests.log_reads(tests.fx('SN')), 'rows:0 rows:2', 'N reads N''s two rows, none of A''s');
select is(tests.log_reads(tests.fx('SB')), 'rows:0 rows:0', 'B reads neither');
select is(tests.log_reads(tests.fx('SPD')), 'rows:0 rows:0', 'a pending dealer reads neither');
select is(tests.log_reads(tests.fx('SADM')), 'rows:0 rows:0', 'the admin reads neither (SRDS §15)');
select is(tests.log_reads(tests.fx('SADM'), 'aal2'), 'rows:0 rows:0', 'not even with the second factor');
select is(tests.probe(tests.fx('SADM'), 'select 1 from public.inventory_sync_log', 'aal2'), 'rows:0', 'the admin reaches no sync-log row at all');
select is(tests.log_reads(tests.fx('SBU')), 'rows:0 rows:0', 'a buyer reads neither');
select is(tests.log_reads(tests.fx('SF')), 'rows:0 rows:0', 'a farmer reads neither');
select is(tests.log_reads(null), 'err:42501 err:42501', 'anon is refused');
update public.profiles set is_suspended = true where id = tests.fx('SA');
select is(tests.log_reads(tests.fx('SA')), 'rows:1 rows:0', 'a suspended dealer still reads their own log (read, never write)');
update public.profiles set is_suspended = false where id = tests.fx('SA');
select is(tests.probe(tests.fx('SA'), format('insert into public.inventory_sync_log (dealer_id, order_event_id, status) values (%s, %L, %L)', tests.l('SA'), tests.event_of('O8'), 'applied')),
  'err:42501', 'A cannot write a log row');
select is(tests.probe(tests.fx('SA'), format('update public.inventory_sync_log set status = %L where dealer_id = %s', 'failed', tests.l('SA'))),
  'err:42501', 'A cannot rewrite their log');
select is(tests.probe(tests.fx('SA'), format('delete from public.inventory_sync_log where dealer_id = %s', tests.l('SA'))),
  'err:42501', 'A cannot delete their log');

-- ---------------------------------------------------------------------------------------------------------------------
-- The low-stock alert on the new stock
-- ---------------------------------------------------------------------------------------------------------------------
select is(tests.low_alerts('SA', 'PA1'), 0::bigint, 'alert: 10 -> 7 stayed above the threshold of 4, no alert');
select tests.order_of('O9', 'SA', '{"LIST1": 3}');
select is(tests.dispatch('SA', 'O9'), 'n:1', 'alert: A dispatches 3 more');
select is(tests.stock('PA1', 'LA'), 4.00::numeric, 'alert: 7 -> 4');
select is(tests.low_alerts('SA', 'PA1'), 1::bigint, 'alert: crossing the threshold alerts A once');
select results_eq(
  format('select payload ->> %L, (payload ->> %L)::numeric, (payload ->> %L)::numeric from public.notifications where user_id = %s and type = %L and payload ->> %L = %L',
         'location_id', 'stock_quantity', 'min_stock_threshold', tests.l('SA'), 'inventory_low_stock', 'product_id', tests.fx('PA1')),
  format('values (%L, 4.00::numeric, 4::numeric)', tests.fx('LA')),
  'alert: the payload names the default location, the stock and the threshold');
select is(tests.probe(tests.fx('SA'), format('select public.record_movement(%s, %s, %L, %L, 1)', tests.l('PA1'), tests.l('LA'), 'out', 'LOCAL_SALE')), 'rows:1', 'alert: a local sale 4 -> 3');
select is(tests.low_alerts('SA', 'PA1'), 1::bigint, 'alert: no repeat while it stays under the threshold');
select is(tests.probe(tests.fx('SA'), format('select public.record_movement(%s, %s, %L, %L, 2)', tests.l('PA1'), tests.l('LA2'), 'out', 'LOCAL_SALE')), 'rows:1', 'alert: the godown 5 -> 3');
select is(tests.low_alerts('SA', 'PA1'), 1::bigint, 'alert: a location other than the default never alerts');
select tests.order_of('O10', 'SB', '{"LISTB": 3}');
select is(tests.dispatch('SB', 'O10'), 'n:1', 'alert: B dispatches 3 of 4 (threshold 2)');
select is(tests.stock('PB', 'LB'), 1.00::numeric, 'alert: B''s stock is 1');
select is(tests.low_alerts('SB', 'PB'), 0::bigint, 'alert: B turned low-stock alerts off, so none');
select is(tests.probe(tests.fx('SA'), format('select 1 from public.inventory_sync_log where dealer_id = %s', tests.l('SB'))), 'rows:0', 'A does not read B''s log row');

-- ---------------------------------------------------------------------------------------------------------------------
-- Availability reads the IMS at the default location; a word for buyers, the figure for the orders service
-- ---------------------------------------------------------------------------------------------------------------------
create function tests.word(_listing text, _uid uuid default null) returns text language plpgsql as $$
declare w text; id uuid := tests.fx(_listing);  -- read before the role switch: anon has no use of the tests schema
begin
  if _uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
  begin
    select availability into w from public.listing_availability(array[id]);
    w := coalesce(w, 'no answer');
  exception when others then
    w := 'err:' || sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return w;
end $$;
select is(tests.word('LIST1', tests.fx('SBU')), 'low_stock', 'availability: 3 at the default location, at or under the threshold of 4, is low');
select is(tests.word('LISTB', tests.fx('SBU')), 'low_stock', 'availability: B''s 1 of a threshold of 2 is low');
select is(tests.word('LIST3A', tests.fx('SBU')), 'out_of_stock', 'availability: a product at 0 is out, for each listing linked to it');
select is(tests.word('LIST3B', tests.fx('SBU')), 'out_of_stock', 'availability: the second listing of that product too');
select is(tests.word('LIST4', tests.fx('SBU')), 'out_of_stock', 'availability: stock only in the godown is out (only the default location sells, D8)');
select is(tests.word('LISTN', tests.fx('SBU')), 'out_of_stock', 'availability: N at 0 is out');
select is(tests.word('LISTU', tests.fx('SBU')), 'in_stock', 'availability: a listing with no link answers from its own quantity, no error');
select is(tests.word('LISTU'), 'in_stock', 'availability: anon asks too, and gets a word');
select is(tests.word('LIST2'), 'in_stock', 'availability: DAP, 2 at the default location above a threshold of 0, is in stock');
select is(tests.probe(tests.fx('SBU'), format('select 1 from public.listing_availability(array[%s, %s, %s, %s])', tests.l('LIST1'), tests.l('LISTU'), tests.l('LIST4'), tests.l('LISTN'))),
  'rows:4', 'availability: one answer per listing asked, linked or not');
update public.listings set status = 'inactive' where id = tests.fx('LIST2');
select is(tests.word('LIST2'), 'no answer', 'availability: a hidden listing gets no answer...');
select is(tests.word('LIST2', tests.fx('SA')), 'in_stock', '...except to its owner');
select set_eq(
  format('select listing_id, available from public.available_stock(array[%s, %s, %s, %s])', tests.l('LIST1'), tests.l('LISTU'), tests.l('LIST4'), tests.l('LIST2')),
  format('values (%s, 0::numeric), (%s, 2::numeric), (%s, 3::numeric), (%s, 3::numeric)', tests.l('LIST4'), tests.l('LIST2'), tests.l('LIST1'), tests.l('LISTU')),
  'available_stock: the default-location figure for linked listings (godown-only is 0), the listing quantity otherwise');
select ok(not has_function_privilege('anon', 'public.available_stock(uuid[])', 'execute'), 'available_stock: the figures stay closed to anon');

-- ---------------------------------------------------------------------------------------------------------------------
-- The sync log names the order, the line and the listing (clients cannot read order_events)
-- ---------------------------------------------------------------------------------------------------------------------
select has_column('public', 'inventory_sync_log', 'order_id', 'sync log: order_id');
select has_column('public', 'inventory_sync_log', 'order_item_id', 'sync log: order_item_id');
select has_column('public', 'inventory_sync_log', 'listing_id', 'sync log: listing_id');
select col_is_fk('public', 'inventory_sync_log', 'order_id', 'sync log: order_id references orders');
select col_is_fk('public', 'inventory_sync_log', 'order_item_id', 'sync log: order_item_id references order_items');
select col_is_fk('public', 'inventory_sync_log', 'listing_id', 'sync log: listing_id references listings');
select has_index('public', 'inventory_sync_log', 'inventory_sync_log_order_id_idx', 'sync log: order_id is indexed');
select has_index('public', 'inventory_sync_log', 'inventory_sync_log_order_item_id_idx', 'sync log: order_item_id is indexed');
select has_index('public', 'inventory_sync_log', 'inventory_sync_log_listing_id_idx', 'sync log: listing_id is indexed');
select is(
  (select count(*) from public.inventory_sync_log s join public.order_events e on e.id = s.order_event_id
    where s.order_id is distinct from e.order_id or s.order_item_id is distinct from e.order_item_id
       or s.listing_id is distinct from e.listing_id),
  0::bigint, 'sync log: every row carries its event''s order, line and listing (applied, failed and waiting rows alike)');
select is((select count(*) from public.inventory_sync_log where order_id is null), 0::bigint, 'sync log: no row is missing its order');
select is(tests.probe(tests.fx('SA'), format('select 1 from public.inventory_sync_log where order_id = %s and listing_id = %s and order_item_id is not null', tests.l('O1'), tests.l('LIST1'))),
  'rows:1', 'sync log: A finds the row of their order O1 by order and listing');
select is(tests.probe(tests.fx('SB'), format('select 1 from public.inventory_sync_log where order_id = %s', tests.l('O1'))),
  'rows:0', 'sync log: B does not, knowing the order id');
select is(tests.probe(tests.fx('SADM'), format('select 1 from public.inventory_sync_log where order_id = %s', tests.l('O1')), 'aal2'),
  'rows:0', 'sync log: nor the admin');

-- ---------------------------------------------------------------------------------------------------------------------
-- Retry starvation: 101 events that can never apply do not block a newer one that can
-- ---------------------------------------------------------------------------------------------------------------------
-- Dealer SX: product PX (5 at LX), linked listing LXG; listing LXS has no product link and never will, so the 101 events
-- on it fail every time ('The listing is not linked to a product'). Written as the owner, as a long outage would leave
-- them: the stuck events are older and were attempted longer ago than OXG, an applicable event that failed most recently.
do $$
declare x uuid := tests.make_user('SX', 'dealer'); lx uuid; px uuid; ls uuid; lg uuid; o uuid; oi uuid; ev uuid; i int;
begin
  perform tests.approve(array[x]);
  insert into public.inventory_locations (dealer_id, name, is_default) values (x, 'X shop', true) returning id into lx;
  insert into public.inventory_products (dealer_id, sku, name) values (x, 'X-1', 'X item') returning id into px;
  perform public.inventory_apply_movement(x, px, lx, 'in', 'RESTOCK', 5, null, x);
  insert into public.listings (owner_id, title, price, quantity, status, seller_role)
    values (x, 'Stuck', 50, 1000, 'active', 'dealer') returning id into ls;
  insert into public.listings (owner_id, title, price, quantity, status, seller_role, inventory_product_id)
    values (x, 'Good', 50, 1, 'active', 'dealer', px) returning id into lg;
  insert into tests.fixtures values ('LX', lx), ('PX', px), ('LXS', ls), ('LXG', lg);
  for i in 1..101 loop
    insert into public.orders (buyer_id, seller_id, delivery_charge, status) values (tests.fx('SBU'), x, 0, 'dispatched') returning id into o;
    insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, ls, 1, 50) returning id into oi;
    insert into public.order_events (order_id, order_item_id, seller_id, listing_id, quantity, type, created_at)
      values (o, oi, x, ls, 1, 'dispatched', now() - interval '1 day' + i * interval '1 second') returning id into ev;
    insert into public.inventory_sync_log (dealer_id, order_event_id, order_id, order_item_id, listing_id, status, error, processed_at)
      values (x, ev, o, oi, ls, 'failed', 'The listing is not linked to a product', now() - interval '1 hour' + i * interval '1 second');
  end loop;
  insert into public.orders (buyer_id, seller_id, delivery_charge, status) values (tests.fx('SBU'), x, 0, 'dispatched') returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, lg, 2, 50) returning id into oi;
  insert into public.order_events (order_id, order_item_id, seller_id, listing_id, quantity, type, inventory_product_id, created_at)
    values (o, oi, x, lg, 2, 'dispatched', px, now() - interval '1 minute') returning id into ev;
  insert into public.inventory_sync_log (dealer_id, order_event_id, order_id, order_item_id, listing_id, status, error, processed_at)
    values (x, ev, o, oi, lg, 'failed', 'Only 0.00 in stock at this location', now() - interval '1 minute');
  insert into tests.fixtures values ('OXG', o);
end $$;
select is(tests.retry_as(tests.fx('SX')), 'applied:0', 'starvation: the first pass takes the 100 attempted longest ago, all stuck');
select is((select count(*) from public.inventory_sync_log s join public.order_events e on e.id = s.order_event_id
            where e.listing_id = tests.fx('LXS') and s.processed_at = now()), 100::bigint,
  'starvation: those 100 were tried and go to the back of the queue');
select is(tests.log_of('OXG'), 'failed: Only 0.00 in stock at this location', 'starvation: the applicable event was not reached yet');
select is(tests.retry_as(tests.fx('SX')), 'applied:1', 'starvation: the next pass reaches it and applies it (oldest-first alone would never reach it)');
select is(tests.log_of('OXG'), 'applied', 'starvation: its log row is applied');
select is(tests.stock('PX', 'LX'), 3.00::numeric, 'starvation: 5 - 2 = 3, deducted once');
select is(tests.order_moves('OXG'), 1::bigint, 'starvation: one movement with its order id');
-- An event never attempted goes to the front, whatever is stuck.
do $$
declare o uuid; oi uuid;
begin
  insert into public.orders (buyer_id, seller_id, delivery_charge, status) values (tests.fx('SBU'), tests.fx('SX'), 0, 'dispatched') returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, tests.fx('LXG'), 1, 50) returning id into oi;
  insert into public.order_events (order_id, order_item_id, seller_id, listing_id, quantity, type, inventory_product_id)
    values (o, oi, tests.fx('SX'), tests.fx('LXG'), 1, 'dispatched', tests.fx('PX'));
  insert into tests.fixtures values ('OXN', o);
end $$;
select is(tests.retry_as(tests.fx('SX')), 'applied:1', 'starvation: a never-attempted event is applied on the first pass, ahead of 101 stuck ones');
select is(tests.stock('PX', 'LX'), 2.00::numeric, 'starvation: 3 - 1 = 2');
select is((select count(*) from public.order_events where listing_id = tests.fx('LXS') and inventory_applied_at is null), 101::bigint,
  'starvation: the stuck events stay pending, logged with their reason');

-- ---------------------------------------------------------------------------------------------------------------------
-- Within one product the ledger keeps dispatch order: a younger line never jumps an older one that cannot apply
-- ---------------------------------------------------------------------------------------------------------------------
-- B's product PB holds 1. OBO (older) needs 3, OBY (younger) needs 1: OBY alone could apply, but must wait.
do $$
declare o uuid; oi uuid;
begin
  insert into public.orders (buyer_id, seller_id, delivery_charge, status) values (tests.fx('SBU'), tests.fx('SB'), 0, 'dispatched') returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, tests.fx('LISTB'), 3, 50) returning id into oi;
  insert into public.order_events (order_id, order_item_id, seller_id, listing_id, quantity, type, inventory_product_id, created_at)
    values (o, oi, tests.fx('SB'), tests.fx('LISTB'), 3, 'dispatched', tests.fx('PB'), now() - interval '20 seconds');
  insert into tests.fixtures values ('OBO', o);
  insert into public.orders (buyer_id, seller_id, delivery_charge, status) values (tests.fx('SBU'), tests.fx('SB'), 0, 'dispatched') returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, tests.fx('LISTB'), 1, 50) returning id into oi;
  insert into public.order_events (order_id, order_item_id, seller_id, listing_id, quantity, type, inventory_product_id, created_at)
    values (o, oi, tests.fx('SB'), tests.fx('LISTB'), 1, 'dispatched', tests.fx('PB'), now() - interval '10 seconds');
  insert into tests.fixtures values ('OBY', o);
end $$;
select is(tests.stock('PB', 'LB'), 1.00::numeric, 'order: B holds 1');
select is(tests.retry_as(tests.fx('SB')), 'applied:0', 'order: B''s retry applies nothing');
select is(tests.log_of('OBO'), 'failed: Only 1.00 in stock at this location', 'order: the older line (3) cannot apply');
select is(tests.log_of('OBY'), 'failed: Waiting for an earlier order of this product', 'order: the younger line (1) waits instead of taking the 1 unit');
select is(tests.stock('PB', 'LB'), 1.00::numeric, 'order: the stock is untouched');
select is(tests.probe(tests.fx('SB'), format('select public.record_movement(%s, %s, %L, %L, 2)', tests.l('PB'), tests.l('LB'), 'in', 'RESTOCK')), 'rows:1', 'order: B restocks 2');
select is(tests.retry_as(tests.fx('SB')), 'applied:1', 'order: the older line applies first...');
select is(tests.log_of('OBO'), 'applied', '...its log row is applied');
select is(tests.log_of('OBY'), 'failed: Only 0.00 in stock at this location', '...and the younger one now waits for stock, not for the older line');
select is(tests.stock('PB', 'LB'), 0.00::numeric, 'order: 3 - 3 = 0');

-- ---------------------------------------------------------------------------------------------------------------------
-- The same unlinked listing twice in one order
-- ---------------------------------------------------------------------------------------------------------------------
-- order_items_order_listing_uidx (20260927100000) refuses the second line, so 3 + 3 of an unlinked listing holding 5
-- never reaches confirm or dispatch. The dispatch check sums unlinked lines per listing anyway, in case that index goes.
select tests.order_of('ODUP', 'SA', '{"LISTU": 3}', 'pending');
select throws_ok(
  format('insert into public.order_items (order_id, listing_id, quantity, unit_price) values (%s, %s, 3, 50)', tests.l('ODUP'), tests.l('LISTU')),
  '23505', null, 'duplicate: a second line for the same unlinked listing is refused, even for the table owner');
select is(tests.probe(tests.fx('SBU'), format('insert into public.order_items (order_id, listing_id, quantity, unit_price) values (%s, %s, 3, 50)', tests.l('ODUP'), tests.l('LISTU'))),
  'err:23505', 'duplicate: and for the buyer');

-- ---------------------------------------------------------------------------------------------------------------------
-- B3 verifier F3: the exact stock figure is server side only
-- ---------------------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.available_stock(uuid[])', 'execute'), 'F3: no signed-in user may call available_stock');
select ok(not has_function_privilege('anon', 'public.available_stock(uuid[])', 'execute'), 'F3: nor anon');
select ok(has_function_privilege('service_role', 'public.available_stock(uuid[])', 'execute'), 'F3: the server may (the orders service)');
select ok(not has_function_privilege('authenticated', 'public.inventory_sellable(uuid,uuid,uuid)', 'execute'), 'F3: the internal sellable figure is not callable either');
select is(tests.probe(tests.fx('SBU'), format('select * from public.available_stock(array[%s])', tests.l('LIST1'))), 'err:42501',
  'F3: a buyer asking for a dealer''s figure is refused');
select is(tests.probe(tests.fx('SA'), format('select * from public.available_stock(array[%s])', tests.l('LIST1'))), 'err:42501',
  'F3: so is the owning dealer (they read their own stock through the IMS)');
select tests.order_of('OCONF', 'SA', '{"LIST1": 100}', 'pending');
select is(tests.probe(tests.fx('SA'), format('update public.orders set status = %L where id = %s', 'confirmed', tests.l('OCONF'))), 'err:P0001',
  'F3: check_stock_on_confirm still reads the figure (definer): 100 of 3 is refused at confirm');

-- ---------------------------------------------------------------------------------------------------------------------
-- B3 verifier F1: lines already owed count against the stock (D6 and availability)
-- ---------------------------------------------------------------------------------------------------------------------
-- Dealer SM has no location yet: a dispatch of 5 goes pending. SM then opens a location and stocks 3.
do $$
declare m uuid := tests.make_user('SM', 'dealer'); pm uuid; lm uuid;
begin
  perform tests.approve(array[m]);
  insert into public.inventory_products (dealer_id, sku, name) values (m, 'M-1', 'M item') returning id into pm;
  insert into public.listings (owner_id, title, price, quantity, status, seller_role, inventory_product_id)
    values (m, 'M listing', 50, 1, 'active', 'dealer', pm) returning id into lm;
  insert into tests.fixtures values ('PM', pm), ('LM', lm);
end $$;
select tests.order_of('OM1', 'SM', '{"LM": 5}');
select is(tests.dispatch('SM', 'OM1'), 'n:1', 'F1: with no location, a dispatch of 5 goes through and its line is pending');
select is(tests.probe(tests.fx('SM'), format('insert into public.inventory_locations (dealer_id, name, is_default) values (%s, %L, true)', tests.l('SM'), 'M shop')), 'n:1', 'F1: M opens a location');
insert into tests.fixtures select 'LMS', id from public.inventory_locations where dealer_id = tests.fx('SM');
select is(tests.probe(tests.fx('SM'), format('select public.record_movement(%s, %s, %L, %L, 3)', tests.l('PM'), tests.l('LMS'), 'in', 'RESTOCK')), 'rows:1', 'F1: and stocks 3');
select is(tests.word('LM'), 'out_of_stock', 'F1: availability: 3 in stock with 5 owed is out of stock');
select is((select available from public.available_stock(array[tests.fx('LM')])), 0::numeric, 'F1: the exact figure is 0, not 3');
select tests.order_of('OM2', 'SM', '{"LM": 3}');
select tests.order_of('OM3', 'SM', '{"LM": 3}');
select is(tests.dispatch('SM', 'OM2'), 'err:P0001', 'F1: D6 refuses 3 more while 5 are owed against 3');
select is(tests.dispatch('SM', 'OM3'), 'err:P0001', 'F1: and the other order of 3 too (no longer 11 owed against 3)');
select is((select count(*) from public.order_events where order_id in (tests.fx('OM2'), tests.fx('OM3'))), 0::bigint, 'F1: the refused orders wrote no event');
select is(tests.probe(tests.fx('SM'), format('select public.record_movement(%s, %s, %L, %L, 5)', tests.l('PM'), tests.l('LMS'), 'in', 'RESTOCK')), 'rows:1', 'F1: M restocks 5 (8 in stock, 5 owed)');
select is(tests.word('LM'), 'in_stock', 'F1: availability: 3 sellable is in stock');
select is((select available from public.available_stock(array[tests.fx('LM')])), 3::numeric, 'F1: the exact figure is 8 - 5 = 3');
select is(tests.dispatch('SM', 'OM2'), 'n:1', 'F1: an order of 3 now dispatches');
select is(tests.log_of('OM1'), 'applied', 'F1: the owed line was applied first...');
select is(tests.log_of('OM2'), 'applied', 'F1: ...then the new one');
select is(tests.stock('PM', 'LMS'), 0.00::numeric, 'F1: 8 - 5 - 3 = 0');
select is(tests.dispatch('SM', 'OM3'), 'err:P0001', 'F1: the last order of 3 is refused at 0');

-- ---------------------------------------------------------------------------------------------------------------------
-- B3 verifier F2: an IMS fault never breaks dispatch (D7, §53.39); only a known shortage refuses (D6)
-- ---------------------------------------------------------------------------------------------------------------------
-- The fault is simulated by taking inventory_stock away for the statement (renamed, rolled back with the test): every
-- query on it fails. A held lock is the other fault; it is raced across two sessions outside pgTAP (the hand-off shows it).
do $$
declare lf uuid;
begin
  insert into public.listings (owner_id, title, price, quantity, status, seller_role)
    values (tests.fx('SF'), 'Farm onions', 10, 5, 'active', 'farmer') returning id into lf;
  insert into tests.fixtures values ('LFX', lf);
end $$;
create function tests.order_from_farmer(_key text, _qty numeric) returns uuid language plpgsql as $$
declare o uuid;
begin
  insert into public.orders (buyer_id, seller_id, delivery_charge, status) values (tests.fx('SBU'), tests.fx('SF'), 0, 'ready') returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, tests.fx('LFX'), _qty, 10);
  insert into tests.fixtures values (_key, o);
  return o;
end $$;
select tests.order_from_farmer('OFX', 2);
select tests.order_of('OLX', 'SA', '{"LIST2": 1}');
alter table public.inventory_stock rename to inventory_stock_offline;
select is(tests.dispatch('SF', 'OFX'), 'n:1', 'F2: with the IMS broken, a farmer''s order (no linked line) still dispatches: no IMS query runs');
select is((select quantity from public.listings where id = tests.fx('LFX')), 3::numeric, 'F2: its listing quantity fell 5 -> 3');
select is(tests.dispatch('SA', 'OLX'), 'n:1', 'F2: a dealer''s linked order dispatches too: the stock is unknown, not short');
select is((select status::text from public.orders where id = tests.fx('OLX')), 'dispatched', 'F2: the order is dispatched');
select is(tests.log_of('OLX'), 'failed: Inventory was unavailable at dispatch; retry', 'F2: its line is pending with the reason');
select is(current_setting('lock_timeout'), '0', 'F2: the dispatch put lock_timeout back after its IMS block');
alter table public.inventory_stock_offline rename to inventory_stock;
select is(tests.retry_as(tests.fx('SA')), 'applied:1', 'F2: once the IMS is back, A''s retry applies the line');
select is(tests.stock('PA2', 'LA'), 1.00::numeric, 'F2: 2 - 1 = 1, deducted once');
select is(tests.order_moves('OLX'), 1::bigint, 'F2: one movement with its order id');
select tests.order_of('OLY', 'SA', '{"LIST2": 1}');
select is(tests.dispatch('SA', 'OLY'), 'n:1', 'F2: a healthy dispatch through the bounded block...');
select is(current_setting('lock_timeout'), '0', 'F2: ...also leaves lock_timeout as it was');

-- ---------------------------------------------------------------------------------------------------------------------
-- B3 verifier F4: a pending line deducts from the product recorded at dispatch
-- ---------------------------------------------------------------------------------------------------------------------
select is((select inventory_product_id from public.order_events where id = tests.event_of('O1')), tests.fx('PA1'),
  'F4: the dispatch recorded the product the line deducts from');
select is((select inventory_product_id from public.order_events where id = tests.event_of('O8')), null,
  'F4: a line with no product link records none');
-- OBY (B, 1 unit of PB) is still pending. B relinks LISTB to another product holding 10: OBY must not take from it.
do $$
declare p uuid;
begin
  insert into public.inventory_products (dealer_id, sku, name) values (tests.fx('SB'), 'B-2', 'B other') returning id into p;
  perform public.inventory_apply_movement(tests.fx('SB'), p, tests.fx('LB'), 'in', 'RESTOCK', 10, null, tests.fx('SB'));
  insert into tests.fixtures values ('PB2', p);
end $$;
select is(tests.probe(tests.fx('SB'), format('update public.listings set inventory_product_id = %s where id = %s', tests.l('PB2'), tests.l('LISTB'))), 'n:1',
  'F4: B relinks the listing to another product while a line is pending');
select is(tests.retry_as(tests.fx('SB')), 'applied:0', 'F4: the retry does not apply it from the new product...');
select is(tests.stock('PB2', 'LB'), 10.00::numeric, '...which keeps its 10');
select ok(tests.log_of('OBY') like 'failed: Only 0.00 in stock%', '...and the line still waits on PB, the product it was dispatched from');
-- A pending line whose recorded product is deleted falls back to the listing's current link: pending while the listing
-- is unlinked, applied from the new product once the dealer links it again.
do $$
declare p uuid; l uuid; o uuid; oi uuid;
begin
  insert into public.inventory_products (dealer_id, sku, name) values (tests.fx('SB'), 'B-3', 'B gone') returning id into p;
  insert into public.listings (owner_id, title, price, quantity, status, seller_role, inventory_product_id)
    values (tests.fx('SB'), 'B gone listing', 50, 1, 'active', 'dealer', p) returning id into l;
  insert into public.orders (buyer_id, seller_id, delivery_charge, status) values (tests.fx('SBU'), tests.fx('SB'), 0, 'dispatched') returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, l, 1, 50) returning id into oi;
  insert into public.order_events (order_id, order_item_id, seller_id, listing_id, quantity, type, inventory_product_id)
    values (o, oi, tests.fx('SB'), l, 1, 'dispatched', p);
  insert into tests.fixtures values ('PB3', p), ('OQ', o);
end $$;
select is(tests.retry_as(tests.fx('SB')), 'applied:0', 'F4: a line on a product with no stock fails...');
select ok(tests.log_of('OQ') like 'failed: Only 0.00 in stock%', '...and is logged pending');
select is(tests.probe(tests.fx('SB'), format('delete from public.inventory_products where id = %s', tests.l('PB3'))), 'n:1',
  'F4: B deletes that product (it has no history)');
select is(tests.retry_as(tests.fx('SB')), 'applied:0', 'F4: the retry has nothing to deduct from');
select is(tests.log_of('OQ'), 'failed: The listing is not linked to a product', 'F4: the line stays pending: the delete unlinked its listing');
select is((select count(*) from public.order_events where order_id = tests.fx('OQ') and inventory_applied_at is null), 1::bigint, 'F4: still pending');
select is(tests.probe(tests.fx('SB'), format('update public.listings set inventory_product_id = %s where title = %L and owner_id = %s', tests.l('PB2'), 'B gone listing', tests.l('SB'))), 'n:1',
  'F4: B links that listing to another product');
select is(tests.retry_as(tests.fx('SB')), 'applied:1', 'F4: the retry applies the line from the newly linked product');
select is(tests.stock('PB2', 'LB'), 9.00::numeric, 'F4: 10 - 1 = 9');
select is((select inventory_product_id from public.order_events where order_id = tests.fx('OQ')), tests.fx('PB2'), 'F4: and records it on the event');
select is(tests.retry_as(tests.fx('SB')), 'applied:0', 'F4: once applied, nothing more');

-- The API deletes a product with history by deactivating it and unlinking its listings (inventory service). A pending line
-- on it must not deduct from the deactivated product, and is resolved the same way.
do $$
declare p uuid; l uuid; o uuid; oi uuid;
begin
  insert into public.inventory_products (dealer_id, sku, name) values (tests.fx('SB'), 'B-4', 'B retired') returning id into p;
  perform public.inventory_apply_movement(tests.fx('SB'), p, tests.fx('LB'), 'in', 'RESTOCK', 5, null, tests.fx('SB'));
  insert into public.listings (owner_id, title, price, quantity, status, seller_role, inventory_product_id)
    values (tests.fx('SB'), 'B retired listing', 50, 1, 'active', 'dealer', p) returning id into l;
  insert into public.orders (buyer_id, seller_id, delivery_charge, status) values (tests.fx('SBU'), tests.fx('SB'), 0, 'dispatched') returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, l, 2, 50) returning id into oi;
  insert into public.order_events (order_id, order_item_id, seller_id, listing_id, quantity, type, inventory_product_id)
    values (o, oi, tests.fx('SB'), l, 2, 'dispatched', p);
  insert into tests.fixtures values ('PB4', p), ('LB4', l), ('OR4', o);
end $$;
select is(tests.probe(tests.fx('SB'), format('update public.inventory_products set is_active = false where id = %s', tests.l('PB4'))), 'n:1', 'F4: B deactivates the product (the API''s delete)...');
select is(tests.probe(tests.fx('SB'), format('update public.listings set inventory_product_id = null where id = %s', tests.l('LB4'))), 'n:1', '...and its listing is unlinked');
select is(tests.retry_as(tests.fx('SB')), 'applied:0', 'F4: the retry does not deduct from the deactivated product');
select is(tests.stock('PB4', 'LB'), 5.00::numeric, 'F4: which keeps its 5');
select is(tests.log_of('OR4'), 'failed: The listing is not linked to a product', 'F4: the line waits for a link');
select is(tests.probe(tests.fx('SB'), format('update public.listings set inventory_product_id = %s where id = %s', tests.l('PB2'), tests.l('LB4'))), 'n:1', 'F4: B links the listing to an active product');
select is(tests.retry_as(tests.fx('SB')), 'applied:1', 'F4: the retry applies it there');
select is(tests.stock('PB2', 'LB'), 7.00::numeric, 'F4: 9 - 2 = 7');
select is(tests.stock('PB4', 'LB'), 5.00::numeric, 'F4: the deactivated product is untouched');

-- ---------------------------------------------------------------------------------------------------------------------
-- B3 re-verification N2/N3: the IMS part stays inside a time budget under the 8 s statement_timeout of `authenticated`
-- ---------------------------------------------------------------------------------------------------------------------
-- A held lock needs a second session, which pgTAP cannot open here (dblink refuses the local trust login); the hand-off
-- shows the lock timings from two sessions. Here: the budget itself, and that every bounded path puts lock_timeout back.
select ok((select rolconfig @> array['statement_timeout=8s'] from pg_roles where rolname = 'authenticated'),
  'budget: authenticated runs with an 8 s statement timeout, which the 6 s IMS budget stays under');
do $$
declare o uuid; oi uuid;
begin
  insert into public.orders (buyer_id, seller_id, delivery_charge, status) values (tests.fx('SBU'), tests.fx('SB'), 0, 'dispatched') returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, tests.fx('LB4'), 1, 50) returning id into oi;
  insert into public.order_events (order_id, order_item_id, seller_id, listing_id, quantity, type, inventory_product_id)
    values (o, oi, tests.fx('SB'), tests.fx('LB4'), 1, 'dispatched', tests.fx('PB2'));
  insert into tests.fixtures values ('OR5', o);
end $$;
select set_config('zarailink.ims_deadline', (clock_timestamp() - interval '1 second')::text, true);
select is(tests.retry_as(tests.fx('SB')), 'applied:0', 'budget: a retry whose deadline has passed applies nothing...');
select is(tests.log_of('OR5'), null, '...and leaves the event untouched, pending for the next call');
select is(tests.stock('PB2', 'LB'), 7.00::numeric, '...with the stock unchanged');
select is(current_setting('lock_timeout'), '0', 'budget: the retry put lock_timeout back');
select set_config('zarailink.ims_deadline', '', true);
select is(tests.retry_as(tests.fx('SB')), 'applied:1', 'budget: with time left, the next retry applies it');
select is(tests.stock('PB2', 'LB'), 6.00::numeric, 'budget: 7 - 1 = 6');
select is(current_setting('lock_timeout'), '0', 'budget: lock_timeout is back after a retry that applied');
select tests.order_of('OCONF2', 'SA', '{"LIST1": 1}', 'pending');
select is(tests.probe(tests.fx('SA'), format('update public.orders set status = %L where id = %s', 'confirmed', tests.l('OCONF2'))), 'n:1',
  'N2: a linked order with stock confirms through the bounded check');
select is(current_setting('lock_timeout'), '0', 'N2: the confirm check put lock_timeout back');
select is(tests.probe(tests.fx('SA'), format('update public.orders set status = %L where id = %s', 'confirmed', tests.l('OCONF'))), 'err:P0001',
  'N2: a shortage the confirm check reads still refuses');
select is(current_setting('lock_timeout'), '0', 'N2: lock_timeout is back after the refused confirm too');
select tests.order_of('OLZ', 'SA', '{"LIST1": 1}');
select is(tests.dispatch('SA', 'OLZ'), 'n:1', 'N3: a linked dispatch through the budgeted block');
select is(tests.log_of('OLZ'), 'applied', 'N3: applied within the budget');
select is(coalesce(current_setting('zarailink.ims_deadline', true), ''), '', 'N3: the dispatch cleared its deadline, so a later retry in the same transaction gets its own');
select is(current_setting('lock_timeout'), '0', 'N3: and put lock_timeout back');

select * from finish();
rollback;
