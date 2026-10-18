-- Pair for migration 20261021080000_inventory_data_model.sql (B1, SRDS §15-§25, BR-03/04), tested against the objects as
-- they stand after the later migrations (B3 dropped the legacy tables and redefined dispatch; the B1 tables, policies and
-- stock functions are unchanged). Proves: NaN, a third decimal and an infinite figure are refused wherever a figure
-- enters (the functions and the client-writable columns), since NaN passes `> 0` in Postgres; every B1 table is private to its approved dealer with no admin branch; stock and
-- the ledger change only through record_movement, transfer_stock and receive_purchase, each writing balanced ledger rows;
-- references across dealers are refused; and the B1 exit scenario reconciles (§25).
--
-- Builds its own fixtures instead of tests.world(), which still writes the legacy inventory tables B3 dropped.
begin;
\ir ../helpers/rls_helpers.inc
select plan(132);

-- ---------------------------------------------------------------------------------------------------------------------
-- Fixtures, as the owner: approved dealers IA and IB, a pending dealer IPD, a farmer IF, a buyer IBU and an admin IADM.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  a uuid := tests.make_user('IA', 'dealer');
  b uuid := tests.make_user('IB', 'dealer');
  pd uuid := tests.make_user('IPD', 'dealer');
  f uuid := tests.make_user('IF', 'farmer');
  bu uuid := tests.make_user('IBU', 'buyer');
  adm uuid := tests.make_user('IADM', 'buyer');
  la1 uuid; la2 uuid; lb1 uuid; lpd uuid; pa uuid; pb uuid; px uuid; ppd uuid; sa uuid; pura uuid; lista uuid; listb uuid;
  o uuid; oi uuid; ev uuid;
begin
  -- Public signup never makes an admin (handle_new_user): promote as the owner with the role guard paused.
  alter table public.profiles disable trigger guard_profiles_role;
  update public.profiles set role = 'admin' where id = adm;
  alter table public.profiles enable trigger guard_profiles_role;
  perform tests.approve(array[a, b]);

  insert into public.inventory_locations (dealer_id, name, kind, is_default) values (a, 'A shop', 'shop', true) returning id into la1;
  insert into public.inventory_locations (dealer_id, name, kind) values (a, 'A godown', 'godown') returning id into la2;
  insert into public.inventory_locations (dealer_id, name, is_default) values (b, 'B shop', true) returning id into lb1;
  insert into public.inventory_locations (dealer_id, name, is_default) values (pd, 'Pending shop', true) returning id into lpd;
  insert into public.inventory_suppliers (dealer_id, name) values (a, 'A supplier') returning id into sa;
  insert into public.inventory_products (dealer_id, sku, name, reorder_threshold) values (a, 'UREA-50', 'Urea 50kg', 0) returning id into pa;
  insert into public.inventory_products (dealer_id, sku, name) values (b, 'DAP-50', 'DAP 50kg') returning id into pb;
  insert into public.inventory_products (dealer_id, sku, name) values (pd, 'PEND-1', 'Pending item') returning id into ppd;
  insert into public.inventory_alert_settings (dealer_id) values (a), (b);
  insert into public.inventory_purchases (dealer_id, supplier_id, reference) values (a, sa, 'INV-001') returning id into pura;
  insert into public.inventory_purchase_items (purchase_id, dealer_id, product_id, location_id, quantity, unit_cost)
    values (pura, a, pa, la1, 5, 1000);

  insert into public.listings (owner_id, title, price, quantity, status, seller_role)
    values (a, 'Urea', 50, 1, 'active', 'dealer') returning id into lista;
  insert into public.listings (owner_id, title, price, quantity, status, seller_role)
    values (b, 'DAP', 50, 1, 'active', 'dealer') returning id into listb;

  -- One processed dispatch event of A's, so the sync log has a row to hide.
  insert into public.orders (buyer_id, seller_id, product_subtotal, delivery_charge) values (bu, a, 50, 10) returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, lista, 1, 50) returning id into oi;
  insert into public.order_events (order_id, order_item_id, seller_id, listing_id, quantity, type, inventory_applied_at)
    values (o, oi, a, lista, 1, 'dispatched', now()) returning id into ev;
  insert into public.inventory_sync_log (dealer_id, order_event_id, status) values (a, ev, 'applied');

  insert into tests.fixtures values ('LA1', la1), ('LA2', la2), ('LB1', lb1), ('LPD', lpd), ('SA', sa), ('PA', pa),
    ('PB', pb), ('PPD', ppd), ('PURA', pura), ('LISTA', lista), ('LISTB', listb);
end $$;

-- record_movement as a user: the probe result ('rows:1' on success, 'err:XXXXX' when refused).
create function tests.mv(_uid uuid, _product text, _location text, _dir text, _source text, _qty numeric,
                         _reason text default null, _aal text default 'aal1')
returns text language sql as $$
  select tests.probe(_uid, format('select public.record_movement(%s, %s, %L, %L, %s, %L)',
    tests.l(_product), tests.l(_location), _dir, _source, _qty, _reason), _aal)
$$;

-- Stock of one product at one location, and the ledger row count, read as the owner.
create function tests.stock(_product text, _location text) returns numeric language sql as $$
  select coalesce((select quantity from public.inventory_stock
                    where product_id = tests.fx(_product) and location_id = tests.fx(_location)), 0)
$$;
create function tests.ledger_rows(_product text) returns bigint language sql as $$
  select count(*) from public.inventory_movements where product_id = tests.fx(_product)
$$;

-- What a user sees of one dealer's rows in each of the nine tables, in a fixed order.
create function tests.inv_reads(_uid uuid, _dealer uuid, _aal text default 'aal1') returns text language sql as $$
  select string_agg(tests.probe(_uid, format('select 1 from public.%I where dealer_id = %L', t, _dealer), _aal), ' ' order by ord)
    from unnest(array['inventory_locations', 'inventory_suppliers', 'inventory_products', 'inventory_stock',
                      'inventory_purchases', 'inventory_purchase_items', 'inventory_movements',
                      'inventory_alert_settings', 'inventory_sync_log']) with ordinality as x(t, ord)
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Structure: tables, RLS, no admin branch, grants
-- ---------------------------------------------------------------------------------------------------------------------
select has_table('public', 'inventory_locations', 'inventory_locations exists');
select has_table('public', 'inventory_suppliers', 'inventory_suppliers exists');
select has_table('public', 'inventory_products', 'inventory_products exists');
select has_table('public', 'inventory_stock', 'inventory_stock exists');
select has_table('public', 'inventory_purchases', 'inventory_purchases exists');
select has_table('public', 'inventory_purchase_items', 'inventory_purchase_items exists');
select has_table('public', 'inventory_movements', 'inventory_movements exists');
select has_table('public', 'inventory_alert_settings', 'inventory_alert_settings exists');
select has_table('public', 'inventory_sync_log', 'inventory_sync_log exists');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relrowsecurity and c.relname in (
      'inventory_locations', 'inventory_suppliers', 'inventory_products', 'inventory_stock', 'inventory_purchases',
      'inventory_purchase_items', 'inventory_movements', 'inventory_alert_settings', 'inventory_sync_log')),
  9::bigint, 'row-level security is on for all nine inventory tables');

select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename like 'inventory\_%'
      and (coalesce(qual, '') ~* 'is_admin|''admin''' or coalesce(with_check, '') ~* 'is_admin|''admin''')),
  0::bigint, 'no inventory policy has an admin branch (SRDS §15)');

select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename in ('inventory_stock', 'inventory_movements', 'inventory_sync_log')
      and cmd <> 'SELECT'),
  0::bigint, 'stock, the ledger and the sync log have no write policy');

select table_privs_are('public', 'inventory_stock', 'authenticated', array['SELECT'], 'authenticated may only read inventory_stock');
select table_privs_are('public', 'inventory_movements', 'authenticated', array['SELECT'], 'authenticated may only read inventory_movements');
select table_privs_are('public', 'inventory_sync_log', 'authenticated', array['SELECT'], 'authenticated may only read inventory_sync_log');
select table_privs_are('public', 'inventory_products', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'authenticated has select, insert, update, delete on inventory_products');
-- Since 20261025090000 (B2 verifier F1/F2) purchase lines are written only by create_purchase / replace_purchase_items.
select table_privs_are('public', 'inventory_purchase_items', 'authenticated', array['SELECT'],
  'authenticated may only read inventory_purchase_items (20261025090000)');
select is(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name like 'inventory\_%' and grantee = 'anon'),
  0::bigint, 'anon has no privilege on any inventory table');
select is(
  (select count(*) from information_schema.routine_privileges
    where routine_schema = 'public' and grantee in ('authenticated', 'anon', 'PUBLIC')
      and routine_name in ('inventory_apply_movement', 'inventory_caller', 'guard_inventory_references', 'apply_dispatch_event')),
  0::bigint, 'the internal stock functions are not callable by clients');

-- ---------------------------------------------------------------------------------------------------------------------
-- A first movement, then reads: A reads only A's rows; nobody else reads any of them
-- ---------------------------------------------------------------------------------------------------------------------
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'in', 'RESTOCK', 10), 'rows:1', 'A restocks 10 of their product');
select is(tests.stock('PA', 'LA1'), 10.00::numeric, 'the stock row now holds 10');
select results_eq(
  format('select direction::text, source::text, quantity, quantity_before, quantity_after, actor from public.inventory_movements where product_id = %s', tests.l('PA')),
  format('values (%L, %L, 10.00::numeric, 0.00::numeric, 10.00::numeric, %s)', 'in', 'RESTOCK', tests.l('IA')),
  'one ledger row: in, RESTOCK, 0 -> 10, actor A');

select is(tests.inv_reads(tests.fx('IA'), tests.fx('IA')),
  'rows:2 rows:1 rows:1 rows:1 rows:1 rows:1 rows:1 rows:1 rows:1', 'A reads their rows in all nine tables');
select is(tests.inv_reads(tests.fx('IA'), tests.fx('IB')),
  'rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0', 'A reads none of B''s rows');
select is(tests.inv_reads(tests.fx('IB'), tests.fx('IA')),
  'rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0', 'B reads none of A''s rows');
select is(tests.inv_reads(tests.fx('IPD'), tests.fx('IA')),
  'rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0', 'a pending dealer reads none of A''s rows');
select is(tests.inv_reads(tests.fx('IPD'), tests.fx('IPD')),
  'rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0', 'a pending dealer reads not even their own rows (SRDS §16)');
select is(tests.inv_reads(tests.fx('IF'), tests.fx('IA')),
  'rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0', 'a farmer reads none of A''s rows');
select is(tests.inv_reads(tests.fx('IADM'), tests.fx('IA')),
  'rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0', 'the admin reads none of A''s rows (SRDS §15)');
select is(tests.inv_reads(tests.fx('IADM'), tests.fx('IA'), 'aal2'),
  'rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0 rows:0', 'not even with the second factor');
select is(tests.inv_reads(null, tests.fx('IA')),
  'err:42501 err:42501 err:42501 err:42501 err:42501 err:42501 err:42501 err:42501 err:42501', 'anon is refused on every table');

-- Direct writes to stock and the ledger
select tests.expect(tests.fx('IA'),
  format('insert into public.inventory_stock (product_id, location_id, dealer_id, quantity) values (%s, %s, %s, 99)', tests.l('PA'), tests.l('LA2'), tests.l('IA')),
  'err:42501', 'A cannot insert a stock row directly');
select tests.expect(tests.fx('IA'),
  format('update public.inventory_stock set quantity = 999 where product_id = %s', tests.l('PA')),
  'err:42501', 'A cannot update their stock directly');
select tests.expect(tests.fx('IA'),
  format('insert into public.inventory_movements (dealer_id, product_id, location_id, direction, source, quantity, quantity_before, quantity_after) values (%s, %s, %s, ''in'', ''RESTOCK'', 5, 10, 15)', tests.l('IA'), tests.l('PA'), tests.l('LA1')),
  'err:42501', 'A cannot write a ledger row directly');
select tests.expect(tests.fx('IA'),
  format('update public.inventory_movements set quantity = 1 where product_id = %s', tests.l('PA')),
  'err:42501', 'A cannot rewrite a ledger row');
select tests.expect(tests.fx('IA'),
  format('delete from public.inventory_movements where product_id = %s', tests.l('PA')),
  'err:42501', 'A cannot delete a ledger row');
select is(tests.stock('PA', 'LA1'), 10.00::numeric, 'the stock is untouched by the refused writes');

-- Writes on the editable tables are the owner's only
select tests.expect(tests.fx('IB'),
  format('insert into public.inventory_locations (dealer_id, name) values (%s, ''Planted'')', tests.l('IA')),
  'err:42501', 'B cannot create a location for A');
select tests.expect(tests.fx('IB'),
  format('update public.inventory_products set name = ''Hijacked'' where id = %s', tests.l('PA')),
  'n:0', 'B cannot update A''s product');
select tests.expect(tests.fx('IPD'),
  format('insert into public.inventory_products (dealer_id, sku, name) values (%s, ''X-1'', ''X'')', tests.l('IPD')),
  'err:42501', 'a pending dealer cannot create a product');
select tests.expect(tests.fx('IA'),
  format('insert into public.inventory_products (dealer_id, sku, name) values (%s, ''DAP-50'', ''DAP 50kg'')', tests.l('IA')),
  'n:1', 'A creates their own product (the SKU is unique per dealer, not globally)');

-- ---------------------------------------------------------------------------------------------------------------------
-- record_movement
-- ---------------------------------------------------------------------------------------------------------------------
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'out', 'LOCAL_SALE', 3), 'rows:1', 'A records a local sale of 3');
select is(tests.stock('PA', 'LA1'), 7.00::numeric, 'the stock falls to 7');
select results_eq(
  format('select quantity_before, quantity_after from public.inventory_movements where product_id = %s and source = ''LOCAL_SALE''', tests.l('PA')),
  $$values (10.00::numeric, 7.00::numeric)$$,
  'the sale''s ledger row records 10 -> 7');
select is(tests.ledger_rows('PA'), 2::bigint, 'two ledger rows so far');

select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'out', 'LOCAL_SALE', 8), 'err:P0001', 'selling more than is in stock is refused');
select is(tests.stock('PA', 'LA1'), 7.00::numeric, 'and leaves the stock at 7');
select is(tests.ledger_rows('PA'), 2::bigint, 'and writes no ledger row');

select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'out', 'ZARAILINK_ORDER', 1), 'err:22023', 'a ZARAILINK_ORDER movement cannot be faked');
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'in', 'PURCHASE', 1), 'err:22023', 'a PURCHASE movement cannot be faked');
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'in', 'TRANSFER', 1), 'err:22023', 'a TRANSFER movement cannot be faked');

select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'in', 'LOCAL_SALE', 1), 'err:22023', 'a local sale cannot go in');
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'out', 'RESTOCK', 1), 'err:22023', 'a restock cannot go out');
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'in', 'DAMAGE', 1, 'wet'), 'err:22023', 'damage cannot go in');
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'in', 'EXPIRY', 1, 'old'), 'err:22023', 'expiry cannot go in');

select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'in', 'MANUAL_ADJUSTMENT', 1), 'err:22023', 'an adjustment needs a reason');
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'out', 'DAMAGE', 1, '   '), 'err:22023', 'damage needs a reason (blank is none)');
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'out', 'EXPIRY', 1), 'err:22023', 'expiry needs a reason');
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'in', 'OTHER', 1), 'err:22023', 'OTHER needs a reason');
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'in', 'RESTOCK', 0), 'err:22023', 'a zero quantity is refused');
-- H1: NaN sorts above every number, so `<= 0` alone would let it through and the ledger balance (NaN = NaN) would hold.
select tests.expect(tests.fx('IA'),
  format($q$select public.record_movement(%s, %s, 'in', 'RESTOCK', 'NaN'::numeric)$q$, tests.l('PA'), tests.l('LA1')),
  'err:22023', 'a NaN restock is refused');
select tests.expect(tests.fx('IA'),
  format($q$select public.record_movement(%s, %s, 'out', 'LOCAL_SALE', 'NaN'::numeric)$q$, tests.l('PA'), tests.l('LA1')),
  'err:22023', 'a NaN sale is refused (it would otherwise pass the stock check too)');
select tests.expect(tests.fx('IA'),
  format($q$select public.record_movement(%s, %s, 'in', 'RESTOCK', 'Infinity'::numeric)$q$, tests.l('PA'), tests.l('LA1')),
  'err:22023', 'an infinite restock is refused');
-- L1: a third decimal is refused, not rounded into the ledger.
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'in', 'RESTOCK', 1.005), 'err:22023', 'a quantity with three decimals is refused');
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'out', 'LOCAL_SALE', 0.001), 'err:22023', 'so is 0.001, which would round to zero');
select is(
  (select count(*) from public.inventory_movements
    where quantity = 'NaN' or quantity_before = 'NaN' or quantity_after = 'NaN'),
  0::bigint, 'no ledger row holds NaN');

select is(tests.mv(tests.fx('IA'), 'PB', 'LA1', 'in', 'RESTOCK', 1), 'err:42501', 'A cannot move B''s product');
select is(tests.mv(tests.fx('IA'), 'PA', 'LB1', 'in', 'RESTOCK', 1), 'err:42501', 'A cannot use B''s location');
select is(tests.mv(tests.fx('IPD'), 'PPD', 'LPD', 'in', 'RESTOCK', 1), 'err:42501', 'a pending dealer cannot record a movement, even on their own product');
select is(tests.mv(tests.fx('IF'), 'PA', 'LA1', 'in', 'RESTOCK', 1), 'err:42501', 'a farmer cannot record a movement');
select is(tests.mv(tests.fx('IADM'), 'PA', 'LA1', 'in', 'RESTOCK', 1, null, 'aal2'), 'err:42501', 'the admin cannot record a movement, even with aal2');
update public.profiles set is_suspended = true where id = tests.fx('IA');
select is(tests.mv(tests.fx('IA'), 'PA', 'LA1', 'in', 'RESTOCK', 1), 'err:42501', 'a suspended dealer cannot record a movement');
update public.profiles set is_suspended = false where id = tests.fx('IA');
select is(tests.ledger_rows('PA'), 2::bigint, 'none of the refused calls wrote a ledger row');
select is(tests.stock('PA', 'LA1'), 7.00::numeric, 'and the stock is still 7');
select is(
  (select count(*) from public.inventory_movements where product_id = tests.fx('PB')), 0::bigint,
  'B''s product has no ledger row from A''s attempt');

-- ---------------------------------------------------------------------------------------------------------------------
-- transfer_stock
-- ---------------------------------------------------------------------------------------------------------------------
select tests.expect(tests.fx('IA'),
  format('select public.transfer_stock(%s, %s, %s, 2, ''to the godown'')', tests.l('PA'), tests.l('LA1'), tests.l('LA2')),
  'rows:1', 'A transfers 2 from the shop to the godown');
select results_eq(
  format($q$select count(*), count(distinct transfer_id), count(transfer_id),
                   sum(case direction when 'in' then quantity else -quantity end)
              from public.inventory_movements where product_id = %s and source = 'TRANSFER'$q$, tests.l('PA')),
  $$values (2::bigint, 1::bigint, 2::bigint, 0.00::numeric)$$,
  'two TRANSFER rows, one out and one in, sharing one transfer id');
select is(tests.stock('PA', 'LA1'), 5.00::numeric, 'the shop holds 5');
select is(tests.stock('PA', 'LA2'), 2.00::numeric, 'the godown holds 2');
select is(
  (select sum(quantity) from public.inventory_stock where product_id = tests.fx('PA')), 7.00::numeric,
  'the product total is unchanged by the transfer');
select tests.expect(tests.fx('IA'),
  format('select public.transfer_stock(%s, %s, %s, 1)', tests.l('PA'), tests.l('LA1'), tests.l('LA1')),
  'err:22023', 'a transfer to the same location is refused');
select tests.expect(tests.fx('IA'),
  format('select public.transfer_stock(%s, %s, %s, 50)', tests.l('PA'), tests.l('LA1'), tests.l('LA2')),
  'err:P0001', 'transferring more than the source holds is refused');
select tests.expect(tests.fx('IA'),
  format('select public.transfer_stock(%s, %s, %s, 1)', tests.l('PA'), tests.l('LA1'), tests.l('LB1')),
  'err:42501', 'a transfer into B''s location is refused');
select tests.expect(tests.fx('IA'),
  format($q$select public.transfer_stock(%s, %s, %s, 'NaN'::numeric)$q$, tests.l('PA'), tests.l('LA1'), tests.l('LA2')),
  'err:22023', 'a NaN transfer is refused');
select tests.expect(tests.fx('IA'),
  format('select public.transfer_stock(%s, %s, %s, 1.005)', tests.l('PA'), tests.l('LA1'), tests.l('LA2')),
  'err:22023', 'a transfer with three decimals is refused');
select is(tests.ledger_rows('PA'), 4::bigint, 'the refused transfers wrote nothing (the out half rolled back too)');
select is(tests.stock('PA', 'LA2'), 2.00::numeric, 'and the godown still holds 2');

-- ---------------------------------------------------------------------------------------------------------------------
-- receive_purchase and the purchase-line guard
-- ---------------------------------------------------------------------------------------------------------------------
select tests.expect(tests.fx('IB'), format('select public.receive_purchase(%s)', tests.l('PURA')),
  'err:P0002', 'B cannot receive A''s purchase (not found for B)');
select tests.expect(tests.fx('IA'), format('select public.receive_purchase(%s)', tests.l('PURA')),
  'rows:1', 'A receives their purchase');
select results_eq(
  format('select status, received_at is not null from public.inventory_purchases where id = %s', tests.l('PURA')),
  $$values ('received'::text, true)$$,
  'the purchase is received, with a time');
select results_eq(
  format($q$select count(*), sum(quantity), min(quantity_before), max(quantity_after)
              from public.inventory_movements where purchase_id = %s and source = 'PURCHASE' and direction = 'in'$q$, tests.l('PURA')),
  $$values (1::bigint, 5.00::numeric, 5.00::numeric, 10.00::numeric)$$,
  'one PURCHASE row for the one line: 5 in, 5 -> 10');
select is(tests.stock('PA', 'LA1'), 10.00::numeric, 'the shop stock rose by 5');
select tests.expect(tests.fx('IA'), format('select public.receive_purchase(%s)', tests.l('PURA')),
  'err:22023', 'receiving the same purchase twice is refused');
select is(
  (select count(*) from public.inventory_movements where purchase_id = tests.fx('PURA')), 1::bigint,
  'and writes no second PURCHASE row');
-- Clients no longer write lines directly (20261025090000, tested in its own file), so the guard and the line CHECKs are
-- proven here as the table owner: they still hold for the definer functions that do write lines.
select throws_ok(
  format('insert into public.inventory_purchase_items (purchase_id, dealer_id, product_id, location_id, quantity) values (%s, %s, %s, %s, 1)',
    tests.l('PURA'), tests.l('IA'), tests.l('PA'), tests.l('LA1')),
  '42501', null, 'a line cannot be added to a received purchase, even by the table owner');

-- A new draft: a line with B's product or B's location is refused by guard_inventory_references.
do $$
begin
  with x as (insert into public.inventory_purchases (dealer_id, reference) values (tests.fx('IA'), 'INV-002') returning id)
    insert into tests.fixtures select 'PURA2', id from x;
end $$;
select throws_ok(
  format('insert into public.inventory_purchase_items (purchase_id, dealer_id, product_id, location_id, quantity) values (%s, %s, %s, %s, 1)',
    tests.l('PURA2'), tests.l('IA'), tests.l('PB'), tests.l('LA1')),
  '42501', null, 'the guard refuses a purchase line with B''s product, even for the table owner');
select throws_ok(
  format('insert into public.inventory_purchase_items (purchase_id, dealer_id, product_id, location_id, quantity) values (%s, %s, %s, %s, 1)',
    tests.l('PURA2'), tests.l('IA'), tests.l('PA'), tests.l('LB1')),
  '42501', null, 'the guard refuses a line with B''s location even for the table owner');
select throws_ok(
  format($q$insert into public.inventory_purchase_items (purchase_id, dealer_id, product_id, location_id, quantity) values (%s, %s, %s, %s, 'NaN')$q$,
    tests.l('PURA2'), tests.l('IA'), tests.l('PA'), tests.l('LA1')),
  '23514', null, 'a purchase line of NaN units is refused by the column check');
select throws_ok(
  format('insert into public.inventory_purchase_items (purchase_id, dealer_id, product_id, location_id, quantity) values (%s, %s, %s, %s, 1.005)',
    tests.l('PURA2'), tests.l('IA'), tests.l('PA'), tests.l('LA1')),
  '23514', null, 'a purchase line with three decimals is refused, not rounded');
select throws_ok(
  format($q$insert into public.inventory_purchase_items (purchase_id, dealer_id, product_id, location_id, quantity, unit_cost) values (%s, %s, %s, %s, 1, 'NaN')$q$,
    tests.l('PURA2'), tests.l('IA'), tests.l('PA'), tests.l('LA1')),
  '23514', null, 'a purchase line with a NaN unit cost is refused');
select tests.expect(tests.fx('IA'), format('select public.receive_purchase(%s)', tests.l('PURA2')),
  'err:22023', 'an empty purchase cannot be received');
select throws_ok(
  format('insert into public.inventory_purchases (dealer_id, supplier_id) values (%s, %s)', tests.l('IB'), tests.l('SA')),
  '42501', null, 'a purchase cannot name another dealer''s supplier');

-- ---------------------------------------------------------------------------------------------------------------------
-- listings.inventory_product_id (D8)
-- ---------------------------------------------------------------------------------------------------------------------
select tests.expect(tests.fx('IA'),
  format('update public.listings set inventory_product_id = %s where id = %s', tests.l('PB'), tests.l('LISTA')),
  'err:42501', 'A cannot link their listing to B''s product');
select throws_ok(
  format('update public.listings set inventory_product_id = %s where id = %s', tests.l('PA'), tests.l('LISTB')),
  '42501', null, 'B''s listing cannot be linked to A''s product, even by the table owner');
select tests.expect(tests.fx('IA'),
  format('update public.listings set inventory_product_id = %s where id = %s', tests.l('PA'), tests.l('LISTA')),
  'n:1', 'A links their listing to their own product');

-- ---------------------------------------------------------------------------------------------------------------------
-- One default location per dealer
-- ---------------------------------------------------------------------------------------------------------------------
select tests.expect(tests.fx('IA'),
  format('insert into public.inventory_locations (dealer_id, name, is_default) values (%s, ''Second default'', true)', tests.l('IA')),
  'err:23505', 'a second default location for A is refused');
select tests.expect(tests.fx('IA'),
  format('update public.inventory_locations set is_default = true where id = %s', tests.l('LA2')),
  'err:23505', 'making a second location default is refused too');
select has_index('public', 'inventory_locations', 'inventory_locations_one_default_idx', 'the partial unique index exists');

-- ---------------------------------------------------------------------------------------------------------------------
-- NaN and a third decimal on the columns a dealer writes directly (H1, L1)
-- ---------------------------------------------------------------------------------------------------------------------
select tests.expect(tests.fx('IA'),
  format($q$insert into public.inventory_products (dealer_id, sku, name, cost_price) values (%s, 'NAN-1', 'X', 'NaN')$q$, tests.l('IA')),
  'err:23514', 'a product with a NaN cost price is refused');
select tests.expect(tests.fx('IA'),
  format($q$insert into public.inventory_products (dealer_id, sku, name, selling_price) values (%s, 'NAN-2', 'X', 'NaN')$q$, tests.l('IA')),
  'err:23514', 'a product with a NaN selling price is refused');
select tests.expect(tests.fx('IA'),
  format($q$update public.inventory_products set reorder_threshold = 'NaN' where id = %s$q$, tests.l('PA')),
  'err:23514', 'a NaN reorder threshold is refused');
select tests.expect(tests.fx('IA'),
  format('update public.inventory_products set selling_price = 10.005 where id = %s', tests.l('PA')),
  'err:23514', 'a price with three decimals is refused, not rounded');
select tests.expect(tests.fx('IA'),
  format($q$update public.inventory_products set cost_price = 'Infinity' where id = %s$q$, tests.l('PA')),
  'err:23514', 'an infinite cost price is refused');
select tests.expect(tests.fx('IA'),
  format($q$update public.inventory_alert_settings set default_reorder_threshold = 'NaN' where dealer_id = %s$q$, tests.l('IA')),
  'err:23514', 'a NaN default threshold is refused');
select tests.expect(tests.fx('IA'),
  format('update public.inventory_products set selling_price = 10.5, reorder_threshold = 2.25 where id = %s', tests.l('PA')),
  'n:1', 'two decimals are accepted');
-- The ledger's own checks hold even for the table owner, so a future definer function cannot write NaN either.
select throws_ok(
  format($q$insert into public.inventory_movements (dealer_id, product_id, location_id, direction, source, quantity, quantity_before, quantity_after)
            values (%s, %s, %s, 'in', 'OTHER', 'NaN', 'NaN', 'NaN')$q$, tests.l('IA'), tests.l('PA'), tests.l('LA1')),
  '23514', null, 'a NaN ledger row is refused even for the table owner');

-- ---------------------------------------------------------------------------------------------------------------------
-- Exit scenario (B1): restock, local sale, adjustment and damage on one product reconcile (§25)
-- ---------------------------------------------------------------------------------------------------------------------
do $$
begin
  with x as (insert into public.inventory_products (dealer_id, sku, name) values (tests.fx('IA'), 'SEED-1', 'Wheat seed') returning id)
    insert into tests.fixtures select 'PX', id from x;
end $$;
select is(
  tests.mv(tests.fx('IA'), 'PX', 'LA1', 'in', 'RESTOCK', 20) || ' ' ||
  tests.mv(tests.fx('IA'), 'PX', 'LA1', 'out', 'LOCAL_SALE', 5) || ' ' ||
  tests.mv(tests.fx('IA'), 'PX', 'LA1', 'out', 'MANUAL_ADJUSTMENT', 2, 'stock count') || ' ' ||
  tests.mv(tests.fx('IA'), 'PX', 'LA1', 'out', 'DAMAGE', 1, 'torn bag'),
  'rows:1 rows:1 rows:1 rows:1', 'A records a restock, a local sale, an adjustment and a damage');
select is(tests.stock('PX', 'LA1'), 12.00::numeric, 'the product holds 20 - 5 - 2 - 1 = 12');
select tests.expect(tests.fx('IA'),
  format($q$select 1 from public.inventory_reconciliation()
             where product_id = %s and balanced and ledger_total = 12 and current_stock = 12
               and restocks_and_purchases = 20 and local_sales = -5 and adjustments = -2 and losses = -1
               and marketplace_sales = 0 and transfers = 0 and other = 0$q$, tests.l('PX')),
  'rows:1', 'inventory_reconciliation(): balanced, ledger_total = current_stock = 12, each source in its column');
select tests.expect(tests.fx('IA'), 'select 1 from public.inventory_reconciliation() where not balanced',
  'rows:0', 'every one of A''s products is balanced (transfers and purchases included)');
select tests.expect(tests.fx('IB'),
  format('select 1 from public.inventory_reconciliation() where product_id in (%s, %s)', tests.l('PA'), tests.l('PX')),
  'rows:0', 'B''s reconciliation shows none of A''s products');
select is(
  (select count(*) from public.inventory_movements m
    where m.dealer_id = tests.fx('IA')
      and m.quantity_after <> m.quantity_before + case m.direction when 'in' then m.quantity else -m.quantity end),
  0::bigint, 'every ledger row of A''s balances before and after');

-- ---------------------------------------------------------------------------------------------------------------------
-- The write policies of the editable tables, each both ways (added with 20261025090000, when the policy mutation check
-- showed these could be replaced by `true` or dropped unnoticed): a suspended owner still reads but writes nothing, the
-- approved owner writes.
-- ---------------------------------------------------------------------------------------------------------------------
update public.profiles set is_suspended = true where id = tests.fx('IA');
select is(
  tests.probe(tests.fx('IA'), format('insert into public.inventory_suppliers (dealer_id, name) values (%s, ''Suspended'')', tests.l('IA'))) || ' ' ||
  tests.probe(tests.fx('IA'), format('update public.inventory_suppliers set notes = ''x'' where id = %s', tests.l('SA'))) || ' ' ||
  tests.probe(tests.fx('IA'), format('delete from public.inventory_suppliers where id = %s', tests.l('SA'))),
  'err:42501 n:0 n:0', 'a suspended dealer cannot add, edit or delete a supplier');
select is(
  tests.probe(tests.fx('IA'), format('update public.inventory_products set name = ''x'' where id = %s', tests.l('PA'))) || ' ' ||
  tests.probe(tests.fx('IA'), format('delete from public.inventory_products where dealer_id = %s and sku = ''DAP-50''', tests.l('IA'))),
  'n:0 n:0', 'a suspended dealer cannot edit or delete a product');
select is(
  tests.probe(tests.fx('IA'), format('update public.inventory_locations set name = ''x'' where id = %s', tests.l('LA2'))) || ' ' ||
  tests.probe(tests.fx('IA'), format('delete from public.inventory_locations where id = %s', tests.l('LA2'))),
  'n:0 n:0', 'a suspended dealer cannot edit or delete a location');
select is(
  tests.probe(tests.fx('IA'), format('update public.inventory_purchases set notes = ''x'' where id = %s', tests.l('PURA2'))) || ' ' ||
  tests.probe(tests.fx('IA'), format('delete from public.inventory_purchases where id = %s', tests.l('PURA2'))),
  'n:0 n:0', 'a suspended dealer cannot edit or delete a draft purchase');
select is(
  tests.probe(tests.fx('IA'), format('update public.inventory_alert_settings set notify_low_stock = false where dealer_id = %s', tests.l('IA'))) || ' ' ||
  tests.probe(tests.fx('IA'), format('delete from public.inventory_alert_settings where dealer_id = %s', tests.l('IA'))),
  'n:0 n:0', 'a suspended dealer cannot edit or delete their alert settings');
update public.profiles set is_suspended = false where id = tests.fx('IA');

select is(
  tests.probe(tests.fx('IA'), format('insert into public.inventory_suppliers (dealer_id, name) values (%s, ''Second supplier'')', tests.l('IA'))) || ' ' ||
  tests.probe(tests.fx('IA'), format('update public.inventory_suppliers set notes = ''checked'' where id = %s', tests.l('SA'))) || ' ' ||
  tests.probe(tests.fx('IA'), format('delete from public.inventory_suppliers where dealer_id = %s and name = ''Second supplier''', tests.l('IA'))),
  'n:1 n:1 n:1', 'A adds, edits and deletes a supplier');
select tests.expect(tests.fx('IA'), format('delete from public.inventory_products where dealer_id = %s and sku = ''DAP-50''', tests.l('IA')),
  'n:1', 'A deletes a product with no history');
select is(
  tests.probe(tests.fx('IA'), format('update public.inventory_purchases set notes = ''checked'' where id = %s', tests.l('PURA2'))) || ' ' ||
  tests.probe(tests.fx('IA'), format('update public.inventory_purchases set notes = ''late'' where id = %s', tests.l('PURA'))) || ' ' ||
  tests.probe(tests.fx('IA'), format('update public.inventory_purchases set status = ''received'' where id = %s', tests.l('PURA2'))),
  'n:1 n:0 err:42501', 'A edits a draft''s header, not a received purchase''s, and cannot mark a draft received directly');
select is(
  tests.probe(tests.fx('IA'), format('delete from public.inventory_purchases where id = %s', tests.l('PURA'))) || ' ' ||
  tests.probe(tests.fx('IA'), format('delete from public.inventory_purchases where id = %s', tests.l('PURA2'))),
  'n:0 n:1', 'A cannot delete a received purchase, and deletes a draft');
select is(
  tests.probe(tests.fx('IPD'), format('insert into public.inventory_alert_settings (dealer_id) values (%s)', tests.l('IPD'))) || ' ' ||
  tests.probe(tests.fx('IA'), format('delete from public.inventory_alert_settings where dealer_id = %s', tests.l('IA'))) || ' ' ||
  tests.probe(tests.fx('IA'), format('insert into public.inventory_alert_settings (dealer_id, notify_low_stock) values (%s, false)', tests.l('IA'))),
  'err:42501 n:1 n:1', 'a pending dealer cannot save alert settings; A deletes and saves theirs again');

select * from finish();
rollback;
