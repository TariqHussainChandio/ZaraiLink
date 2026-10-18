-- Pair for migration 20261024080000_inventory_exports.sql (B5, SRDS §17, §25, §45-§46; BR-03/04, B0). Proves:
--   * the 'inventory-exports' bucket is private, capped at 10 MB and takes only text/csv;
--   * only the owning, approved dealer reads export files, and only under their own '{dealer_id}/' folder: never
--     another dealer, a pending or rejected dealer, a farmer, a buyer, an expert, anon or the admin (aal1 or aal2).
--     A suspended dealer still reads their own folder, as with every inventory table (B0: suspended users read, never
--     write); the API refuses a suspended account outright (get_current_user), so it cannot make a new export;
--   * no client writes an export object: there is no insert, update or delete policy, so only the backend's service
--     role (which bypasses row-level security) uploads and removes files;
--   * the SRDS §25 reconciliation over a scripted month: one product with restocks, a received purchase, local sales,
--     two marketplace dispatches through the real dispatch path, adjustments up and down, damage, expiry, OTHER and a
--     transfer between two locations, each backdated to its day. For the month and for every day in it,
--     opening + marketplace + local + adjustments + restocks and purchases + losses + transfers + other = closing,
--     where opening and closing are read from the ledger's own running balance (quantity_after), and the last closing
--     is the stock on hand. The window is the reports' window (reports.py: whole UTC days, [from 00:00, to + 1 00:00)),
--     so a movement at 23:59:59 on the last day belongs to the month and one at 00:00:00 on the first of the next month
--     does not. inventory_reconciliation() (the function the reconciliation report and its CSV read) returns exactly
--     the scripted totals, flags a stock row changed outside the stock functions, is invoker-rights with search_path
--     set and explicit grants, and returns only the caller's own products (nothing to the admin, anon refused).
-- The migration adds no report function: the period reports are computed by the API from the ledger rows the dealer
-- reads through row-level security (20261021080000_inventory_data_model.test.sql proves those reads).
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();

-- ---------------------------------------------------------------------------------------------------------------------
-- Fixtures, as the owner: approved dealers XA and XB, a pending dealer XP, a rejected dealer XR, a suspended (approved)
-- dealer XS, a farmer XF, a buyer XBU, an approved expert XE and an admin XADM.
-- XA: locations XL1 'Shop' (default) and XL2 'Godown'; product XP1 (the scripted month) and XP2 (one restock); listing
-- XLIST linked to XP1. XB: location XBL, product XBP.
-- One export file per dealer folder, written as the service role writes them (owner null, text/csv).
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  a uuid := tests.make_user('XA', 'dealer');
  b uuid := tests.make_user('XB', 'dealer');
  p uuid := tests.make_user('XP', 'dealer');
  r uuid := tests.make_user('XR', 'dealer');
  s uuid := tests.make_user('XS', 'dealer');
  f uuid := tests.make_user('XF', 'farmer');
  bu uuid := tests.make_user('XBU', 'buyer');
  e uuid := tests.make_user('XE', 'expert');
  adm uuid := tests.make_user('XADM', 'buyer');
  l1 uuid; l2 uuid; bl uuid; p1 uuid; p2 uuid; bp uuid; li uuid;
begin
  alter table public.profiles disable trigger guard_profiles_role;
  update public.profiles set role = 'admin' where id = adm;
  alter table public.profiles enable trigger guard_profiles_role;
  perform tests.approve(array[a, b, s, e]);
  update public.profiles set is_suspended = true where id = s;
  alter table public.profiles disable trigger notify_account_status_changed;
  update public.profiles set account_status = 'rejected', account_status_reason = 'Licence expired' where id = r;
  alter table public.profiles enable trigger notify_account_status_changed;

  insert into public.inventory_locations (dealer_id, name, kind, is_default) values (a, 'Shop', 'shop', true) returning id into l1;
  insert into public.inventory_locations (dealer_id, name, kind) values (a, 'Godown', 'godown') returning id into l2;
  insert into public.inventory_locations (dealer_id, name, is_default) values (b, 'B shop', true) returning id into bl;
  insert into public.inventory_products (dealer_id, sku, name) values (a, 'UREA-50', 'Urea 50 kg') returning id into p1;
  insert into public.inventory_products (dealer_id, sku, name) values (a, 'DAP-50', 'DAP 50 kg') returning id into p2;
  insert into public.inventory_products (dealer_id, sku, name) values (b, 'B-1', 'B item') returning id into bp;
  insert into public.listings (owner_id, title, price, quantity, status, seller_role, inventory_product_id)
    values (a, 'Urea 50 kg', 50, 1, 'active', 'dealer', p1) returning id into li;
  insert into tests.fixtures values ('XL1', l1), ('XL2', l2), ('XBL', bl), ('XP1', p1), ('XP2', p2), ('XBP', bp), ('XLIST', li);

  insert into storage.objects (bucket_id, name, owner, metadata)
  select 'inventory-exports', u || '/valuation-20261001.csv', null, '{"mimetype": "text/csv", "size": 120}'
    from unnest(array[a, b, p, r, s]) u;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The bucket and its one policy
-- ---------------------------------------------------------------------------------------------------------------------
select is((select public from storage.buckets where id = 'inventory-exports'), false,
  'inventory-exports: the bucket exists and is private');
select is((select file_size_limit from storage.buckets where id = 'inventory-exports'), 10485760::bigint,
  'inventory-exports: files are capped at 10 MB');
select is((select allowed_mime_types from storage.buckets where id = 'inventory-exports'), array['text/csv'],
  'inventory-exports: only text/csv is accepted');
select is(
  (select array_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ',') order by policyname)
     from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and (qual ilike '%inventory-exports%' or with_check ilike '%inventory-exports%')),
  array['inventory_exports_owner_read:SELECT:authenticated'],
  'inventory-exports: one policy names the bucket, a read for signed-in users; no insert, update or delete policy');
select ok(
  (select qual ilike '%foldername%' and qual ilike '%auth.uid()%' and qual ilike '%is_approved_dealer()%'
          and qual not ilike '%is_admin%'
     from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'inventory_exports_owner_read'),
  'inventory-exports: the read is the caller''s own folder and an approved dealer, with no admin branch (BR-03/04, B0)');

-- ---------------------------------------------------------------------------------------------------------------------
-- Reads: the owner's folder only (BR-03/04, SRDS §15, B0)
-- ---------------------------------------------------------------------------------------------------------------------
-- Every read, write and count below is scoped to this file's own fixture folders: the local bucket can hold real export
-- files from other runs (the API's smoke tests), and the suite must not depend on the bucket being empty.
-- The predicate is a literal (a user session has no grant on the tests schema).
create function tests.export_scope() returns text language sql stable as $$
  select format('name like any (%L::text[])', array_agg(p))
    from (select v::text || '/%' as p from tests.fixtures where k in ('XA', 'XB', 'XP', 'XR', 'XS', 'XF', 'XBU', 'XE', 'XADM')
          union all select 'shared/' || tests.fx('XA') || '/%') x
$$;
create function tests.export_reads(_uid uuid, _aal text default 'aal1') returns text language sql as $$
  select tests.probe(_uid, format('select id from storage.objects where bucket_id = %L and ', 'inventory-exports')
    || tests.export_scope(), _aal)
$$;
create function tests.export_of(_uid uuid, _owner text, _aal text default 'aal1') returns text language sql as $$
  select tests.probe(_uid, format(
    'select id from storage.objects where bucket_id = %L and (storage.foldername(name))[1] = %L',
    'inventory-exports', tests.fx(_owner)::text), _aal)
$$;

select is(tests.export_of(tests.fx('XA'), 'XA'), 'rows:1', 'inventory-exports: the approved owner reads their own export');
select is(tests.export_reads(tests.fx('XA')), 'rows:1', 'inventory-exports: and nothing but their own (one file of five)');
select is(tests.export_of(tests.fx('XA'), 'XB'), 'rows:0', 'inventory-exports: dealer A cannot read dealer B''s export');
select is(tests.export_of(tests.fx('XB'), 'XA'), 'rows:0', 'inventory-exports: dealer B cannot read dealer A''s export');
select is(tests.export_of(tests.fx('XB'), 'XB'), 'rows:1', 'inventory-exports: dealer B reads their own');
select is(tests.export_reads(tests.fx('XP')), 'rows:0', 'inventory-exports: a pending dealer reads nothing, not even their own folder');
select is(tests.export_reads(tests.fx('XR')), 'rows:0', 'inventory-exports: a rejected dealer reads nothing, not even their own folder');
select is(tests.export_of(tests.fx('XS'), 'XS'), 'rows:1', 'inventory-exports: a suspended dealer still reads their own folder (B0: suspended users read, never write)');
select is(tests.export_of(tests.fx('XS'), 'XA'), 'rows:0', 'inventory-exports: but no other dealer''s');
select is(tests.export_reads(tests.fx('XF')), 'rows:0', 'inventory-exports: a farmer reads nothing');
select is(tests.export_reads(tests.fx('XBU')), 'rows:0', 'inventory-exports: a buyer reads nothing');
select is(tests.export_reads(tests.fx('XE')), 'rows:0', 'inventory-exports: an approved expert reads nothing');
select is(tests.export_reads(tests.fx('XADM')), 'rows:0', 'inventory-exports: the admin reads nothing (no admin branch)');
select is(tests.export_reads(tests.fx('XADM'), 'aal2'), 'rows:0', 'inventory-exports: not even the admin with the second factor');
select is(tests.export_reads(null), 'err:42501', 'inventory-exports: anon is refused');

-- A file whose first folder is not the caller's id is not theirs, whatever the rest of the path says.
insert into storage.objects (bucket_id, name, owner, metadata)
values ('inventory-exports', 'shared/' || tests.fx('XA') || '/stock-summary.csv', null, '{"mimetype": "text/csv"}');
select is(tests.export_reads(tests.fx('XA')), 'rows:1', 'inventory-exports: the owner''s id deeper in a path does not open a file outside their folder');
-- A bucket-less clause would open other buckets' files that sit under the same folder name.
insert into storage.objects (bucket_id, name, owner) values ('ml-models', tests.fx('XA') || '/model.pth', null);
select is(
  tests.probe(tests.fx('XA'), format('select id from storage.objects where bucket_id = %L and ', 'ml-models') || tests.export_scope()),
  'rows:0', 'inventory-exports: the read is bound to its bucket (dealer A''s folder name in another bucket stays closed)');

-- ---------------------------------------------------------------------------------------------------------------------
-- Writes: only the service role, never a client
-- ---------------------------------------------------------------------------------------------------------------------
create function tests.export_upload(_uid uuid, _folder text, _aal text default 'aal1') returns text language sql as $$
  select tests.probe(_uid, format(
    'insert into storage.objects (bucket_id, name, owner, metadata) values (%L, %L, %L, %L::jsonb)',
    'inventory-exports', _folder || '/planted.csv', _uid, '{"mimetype": "text/csv"}'), _aal)
$$;
select is(tests.export_upload(tests.fx('XA'), tests.fx('XA')::text), 'err:42501', 'inventory-exports: the owner cannot upload a file into their own folder');
select is(tests.export_upload(tests.fx('XA'), tests.fx('XB')::text), 'err:42501', 'inventory-exports: nor into another dealer''s folder');
select is(tests.export_upload(tests.fx('XADM'), tests.fx('XA')::text, 'aal2'), 'err:42501', 'inventory-exports: the admin with aal2 cannot upload');
select is(tests.export_upload(tests.fx('XF'), tests.fx('XF')::text), 'err:42501', 'inventory-exports: a farmer cannot upload');
select is(tests.export_upload(null, tests.fx('XA')::text), 'err:42501', 'inventory-exports: anon cannot upload');
select is(
  tests.probe(tests.fx('XA'), format(
    'update storage.objects set name = name || %L where bucket_id = %L and ', '.bak', 'inventory-exports') || tests.export_scope()),
  'n:0', 'inventory-exports: the owner cannot rename or overwrite their export');
select is(
  tests.probe(tests.fx('XA'), format(
    'update storage.objects set metadata = %L::jsonb where bucket_id = %L and ', '{}', 'inventory-exports') || tests.export_scope()),
  'n:0', 'inventory-exports: nor change its metadata');
-- The Storage API sets storage.allow_delete_query before its delete (storage.protect_delete refuses a bare SQL delete),
-- so set it here too: what then refuses the delete is row-level security, which is what is under test.
select set_config('storage.allow_delete_query', 'true', true);
select is(
  tests.probe(tests.fx('XA'), format('delete from storage.objects where bucket_id = %L and ', 'inventory-exports') || tests.export_scope()),
  'n:0', 'inventory-exports: the owner cannot delete an export (the server cleans up)');
select is(
  tests.probe(tests.fx('XADM'), format('delete from storage.objects where bucket_id = %L and ', 'inventory-exports') || tests.export_scope(), 'aal2'),
  'n:0', 'inventory-exports: nor can the admin with aal2');
create function tests.export_count(_extra text default 'true') returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from storage.objects where bucket_id = %L and ', 'inventory-exports')
    || tests.export_scope() || ' and ' || _extra into n;
  return n;
end $$;
select is(tests.export_count(), 6::bigint,
  'inventory-exports: every file is still in place after the refused writes');
select is(
  tests.export_count($q$name like '%planted%'$q$), 0::bigint,
  'inventory-exports: no planted file exists');
-- The service role (the backend's exports.py) writes and removes them; it bypasses row-level security.
select ok(
  (select rolbypassrls from pg_roles where rolname = 'service_role'),
  'inventory-exports: the service role, which uploads and removes exports, bypasses row-level security');

-- ---------------------------------------------------------------------------------------------------------------------
-- inventory_reconciliation(): the function the reconciliation report and its CSV read
-- ---------------------------------------------------------------------------------------------------------------------
select ok(
  (select not prosecdef from pg_proc where oid = 'public.inventory_reconciliation()'::regprocedure),
  'reconciliation: invoker rights, so row-level security limits it to the caller''s rows');
select ok(
  (select proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid = 'public.inventory_reconciliation()'::regprocedure),
  'reconciliation: search_path is set');
select ok(
  has_function_privilege('authenticated', 'public.inventory_reconciliation()', 'execute')
  and not has_function_privilege('anon', 'public.inventory_reconciliation()', 'execute'),
  'reconciliation: signed-in users execute it, anon does not');

-- inventory_reconciliation() as a user: its rows as jsonb (ordered by product id), or {"err": sqlstate}.
create function tests.recon_as(_uid uuid, _aal text default 'aal1') returns jsonb language plpgsql as $$
declare result jsonb;
begin
  if _uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'aal', _aal)::text, true);
    execute 'set local role authenticated';
  end if;
  begin
    execute 'select coalesce(jsonb_agg(to_jsonb(r) order by r.product_id), ''[]''::jsonb) from public.inventory_reconciliation() r'
      into result;
  exception when others then
    result := jsonb_build_object('err', sqlstate);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return result;
end $$;
create function tests.recon_row(_uid uuid, _product text) returns jsonb language sql as $$
  select r from jsonb_array_elements(tests.recon_as(_uid)) r where r ->> 'product_id' = tests.fx(_product)::text
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The scripted month: September 2026, product XP1 of dealer XA, every movement through the dealer's own functions
-- (record_movement, transfer_stock, receive_purchase) or the real marketplace dispatch, then backdated to its moment.
-- Expected balances (XL1 shop / XL2 godown):
--   2026-08-25 10:00     RESTOCK in 50 @XL1                 50 / 0      (before the month: the opening balance)
--   2026-09-01 00:00:00  RESTOCK in 20 @XL1                 70 / 0      (first instant of the month)
--   2026-09-03 09:00     PURCHASE in 30 @XL2 (received)     70 / 30
--   2026-09-05 12:00     LOCAL_SALE out 8 @XL1              62 / 30
--   2026-09-08 15:00     ZARAILINK_ORDER out 5 (dispatch)   57 / 30
--   2026-09-10 11:00     MANUAL_ADJUSTMENT in 3 @XL1        60 / 30
--   2026-09-12 16:00     MANUAL_ADJUSTMENT out 2 @XL2       60 / 28
--   2026-09-15 10:00     TRANSFER 10 XL2 -> XL1             70 / 18
--   2026-09-18 14:00     DAMAGE out 4 @XL1                  66 / 18
--   2026-09-20 09:00     EXPIRY out 1.5 @XL2                66 / 16.5
--   2026-09-22 13:00     OTHER in 2.25 @XL2                 66 / 18.75
--   2026-09-25 17:00     ZARAILINK_ORDER out 7 (dispatch)   59 / 18.75
--   2026-09-28 10:00     LOCAL_SALE out 6 @XL2              59 / 12.75
--   2026-09-30 23:59:59  LOCAL_SALE out 1 @XL1              58 / 12.75  (last instant of the month)
--   2026-10-01 00:00:00  RESTOCK in 4 @XL1                  62 / 12.75  (first instant of the next month)
--   2026-10-02 08:00     LOCAL_SALE out 2 @XL1              60 / 12.75  (stock on hand: 72.75)
-- September: opening 50, marketplace -12, local -15, adjustments +1, restocks and purchases +50, losses -5.5,
-- transfers 0, other +2.25, closing 70.75.
-- ---------------------------------------------------------------------------------------------------------------------
create table tests.script (step serial, label text, result text);

-- Moves every XA movement written in this transaction (created_at = now(), the transaction time) to its scripted
-- moment, with the received purchase's received_at. Each step is backdated before the next runs, so the ledger's
-- created_at order is the order the stock functions applied the movements in.
create function tests.at(_label text, _result text, _ts timestamptz) returns void language plpgsql as $$
begin
  insert into tests.script (label, result) values (_label, _result);
  update public.inventory_movements set created_at = _ts where dealer_id = tests.fx('XA') and created_at = now();
  update public.inventory_purchases set received_at = _ts where dealer_id = tests.fx('XA') and received_at = now();
end $$;
create function tests.move(_location text, _dir text, _source text, _qty numeric, _reason text default null)
returns text language sql as $$
  select tests.probe(tests.fx('XA'), format('select public.record_movement(%s, %s, %L, %L, %s, %L)',
    tests.l('XP1'), tests.l(_location), _dir, _source, _qty, _reason))
$$;
-- A marketplace order of buyer XBU for XLIST, put at the dispatch step as the owner (as the B3 tests do), then
-- dispatched by the seller through the order update the app makes: the dispatch trigger writes the ZARAILINK_ORDER row.
create function tests.dispatch(_key text, _qty numeric) returns text language plpgsql as $$
declare o uuid;
begin
  insert into public.orders (buyer_id, seller_id, delivery_charge, status, stock_cut_at_confirm)
    values (tests.fx('XBU'), tests.fx('XA'), 0, 'ready', false) returning id into o;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o, tests.fx('XLIST'), _qty, 50);
  insert into tests.fixtures values (_key, o);
  return tests.probe(tests.fx('XA'), format('update public.orders set status = %L where id = %s', 'dispatched', tests.l(_key)));
end $$;

do $$
declare pur uuid;
begin
  perform tests.at('restock before the month', tests.move('XL1', 'in', 'RESTOCK', 50), '2026-08-25 10:00:00+00');
  perform tests.at('restock at the first instant', tests.move('XL1', 'in', 'RESTOCK', 20), '2026-09-01 00:00:00+00');

  insert into public.inventory_purchases (dealer_id, reference, purchased_on) values (tests.fx('XA'), 'PO-0903', '2026-09-03')
    returning id into pur;
  insert into public.inventory_purchase_items (purchase_id, dealer_id, product_id, location_id, quantity, unit_cost)
    values (pur, tests.fx('XA'), tests.fx('XP1'), tests.fx('XL2'), 30, 4200);
  insert into tests.fixtures values ('XPUR', pur);
  perform tests.at('purchase received',
    tests.probe(tests.fx('XA'), format('select public.receive_purchase(%s)', tests.l('XPUR'))), '2026-09-03 09:00:00+00');

  perform tests.at('local sale', tests.move('XL1', 'out', 'LOCAL_SALE', 8), '2026-09-05 12:00:00+00');
  perform tests.at('marketplace dispatch 1', tests.dispatch('XO1', 5), '2026-09-08 15:00:00+00');
  perform tests.at('adjustment up', tests.move('XL1', 'in', 'MANUAL_ADJUSTMENT', 3, 'Recount found 3 bags'), '2026-09-10 11:00:00+00');
  perform tests.at('adjustment down', tests.move('XL2', 'out', 'MANUAL_ADJUSTMENT', 2, 'Recount short by 2'), '2026-09-12 16:00:00+00');
  perform tests.at('transfer godown to shop',
    tests.probe(tests.fx('XA'), format('select public.transfer_stock(%s, %s, %s, 10)', tests.l('XP1'), tests.l('XL2'), tests.l('XL1'))),
    '2026-09-15 10:00:00+00');
  perform tests.at('damage', tests.move('XL1', 'out', 'DAMAGE', 4, 'Torn bags'), '2026-09-18 14:00:00+00');
  perform tests.at('expiry', tests.move('XL2', 'out', 'EXPIRY', 1.5, 'Past its date'), '2026-09-20 09:00:00+00');
  perform tests.at('other in', tests.move('XL2', 'in', 'OTHER', 2.25, 'Returned by a neighbour'), '2026-09-22 13:00:00+00');
  perform tests.at('marketplace dispatch 2', tests.dispatch('XO2', 7), '2026-09-25 17:00:00+00');
  perform tests.at('local sale at the godown', tests.move('XL2', 'out', 'LOCAL_SALE', 6), '2026-09-28 10:00:00+00');
  perform tests.at('local sale at the last instant', tests.move('XL1', 'out', 'LOCAL_SALE', 1), '2026-09-30 23:59:59+00');
  perform tests.at('restock at the first instant of October', tests.move('XL1', 'in', 'RESTOCK', 4), '2026-10-01 00:00:00+00');
  perform tests.at('local sale in October', tests.move('XL1', 'out', 'LOCAL_SALE', 2), '2026-10-02 08:00:00+00');

  -- XA's second product and dealer XB's product, so the reconciliation has rows to keep apart.
  perform tests.at('second product', tests.probe(tests.fx('XA'), format(
    'select public.record_movement(%s, %s, %L, %L, 6)', tests.l('XP2'), tests.l('XL1'), 'in', 'RESTOCK')), '2026-09-09 09:00:00+00');
  perform tests.probe(tests.fx('XB'), format(
    'select public.record_movement(%s, %s, %L, %L, 9)', tests.l('XBP'), tests.l('XBL'), 'in', 'RESTOCK'));
end $$;

select is(
  (select string_agg(label || '=' || result, ', ' order by step) from tests.script
    where result not in ('rows:1', 'n:1')),
  null, 'month: every scripted step ran through the dealer''s own functions or the dispatch path');
select is(
  (select count(*) from public.inventory_movements where product_id = tests.fx('XP1') and created_at = now()), 0::bigint,
  'month: every XP1 movement carries its scripted moment');
select is(
  (select string_agg(source::text || ':' || direction::text || ':' || quantity, ' ' order by created_at)
     from public.inventory_movements where product_id = tests.fx('XP1') and source = 'ZARAILINK_ORDER'),
  'ZARAILINK_ORDER:out:5.00 ZARAILINK_ORDER:out:7.00',
  'month: the two dispatches wrote one marketplace movement each, from the default location');
select is(
  (select count(*) from public.inventory_movements m
     where m.source = 'ZARAILINK_ORDER' and m.product_id = tests.fx('XP1') and m.location_id <> tests.fx('XL1')),
  0::bigint, 'month: marketplace stock left the default location only');

-- The ledger's own running balance: per location, every movement starts where the previous one at that location ended,
-- from zero (so the backdating kept the order the stock functions wrote, and nothing is missing).
select is(
  (select count(*) from (
     select quantity_before,
            coalesce(lag(quantity_after) over (partition by location_id order by created_at, quantity_before), 0) as prev
       from public.inventory_movements where product_id = tests.fx('XP1')) x
    where quantity_before <> prev),
  0::bigint, 'month: the ledger chains per location from zero, with no gap');

-- Stock of XP1 at a moment, read from the ledger's running balance: per location, quantity_after of the last movement
-- before it.
create function tests.balance_at(_ts timestamptz) returns numeric language sql as $$
  select coalesce(sum(quantity_after), 0) from (
    select distinct on (location_id) quantity_after
      from public.inventory_movements
     where product_id = tests.fx('XP1') and created_at < _ts
     order by location_id, created_at desc
  ) last
$$;
-- XP1's movements in whole UTC days [_from, _to] (the reports' window: day_start(from) to day_start(to + 1)), per SRDS
-- §25 category in the B1 signs (in +, out -), as inventory_reconciliation() groups them.
create function tests.flow(_from date, _to date) returns jsonb language sql as $$
  with signed as (
    select source, case direction when 'in' then quantity else -quantity end as qty
      from public.inventory_movements
     where product_id = tests.fx('XP1')
       and created_at >= (_from::timestamp at time zone 'UTC')
       and created_at < ((_to + 1)::timestamp at time zone 'UTC')
  )
  select jsonb_build_object(
    'marketplace', coalesce(sum(qty) filter (where source = 'ZARAILINK_ORDER'), 0),
    'local', coalesce(sum(qty) filter (where source = 'LOCAL_SALE'), 0),
    'adjustments', coalesce(sum(qty) filter (where source = 'MANUAL_ADJUSTMENT'), 0),
    'restocks', coalesce(sum(qty) filter (where source in ('RESTOCK', 'PURCHASE')), 0),
    'losses', coalesce(sum(qty) filter (where source in ('DAMAGE', 'EXPIRY')), 0),
    'transfers', coalesce(sum(qty) filter (where source = 'TRANSFER'), 0),
    'other', coalesce(sum(qty) filter (where source = 'OTHER'), 0),
    'net', coalesce(sum(qty), 0),
    'movements', count(*))
    from signed
$$;
-- The SRDS §25 left-hand side: opening + every category.
create function tests.identity(_from date, _to date) returns numeric language sql as $$
  select tests.balance_at(_from::timestamp at time zone 'UTC')
       + (f ->> 'marketplace')::numeric + (f ->> 'local')::numeric + (f ->> 'adjustments')::numeric
       + (f ->> 'restocks')::numeric + (f ->> 'losses')::numeric + (f ->> 'transfers')::numeric + (f ->> 'other')::numeric
    from tests.flow(_from, _to) f
$$;

select is(tests.balance_at('2026-09-01 00:00:00+00'), 50.00, 'month: the opening balance of September is 50 (August''s restock)');
select is(tests.flow('2026-09-01', '2026-09-30'),
  '{"marketplace": -12.00, "local": -15.00, "adjustments": 1.00, "restocks": 50.00, "losses": -5.50, "transfers": 0.00, "other": 2.25, "net": 20.75, "movements": 14}'::jsonb,
  'month: September''s movements by source are exactly the scripted ones');
select is(tests.identity('2026-09-01', '2026-09-30'), 70.75,
  'month: opening + marketplace + local + adjustments + restocks + losses + transfers + other = 70.75');
select is(tests.balance_at('2026-10-01 00:00:00+00'), 70.75,
  'month: the closing balance read from the ledger''s running balance is the same 70.75 (§25 identity holds)');
select is(
  (select count(*) from generate_series(date '2026-08-01', date '2026-10-31', interval '1 day') d
    where tests.identity(d::date, d::date) <> tests.balance_at((d + interval '1 day')::date::timestamp at time zone 'UTC')
       or (tests.flow(d::date, d::date) ->> 'net')::numeric
          <> tests.identity(d::date, d::date) - tests.balance_at(d::date::timestamp at time zone 'UTC')),
  0::bigint, 'month: the identity holds for every single day from August to October');
select is(
  (select count(*) from generate_series(date '2026-09-01', date '2026-10-01', interval '1 day') d
    where (tests.flow(d::date, d::date) ->> 'movements')::int > 0),
  14::bigint, 'month: and those days are not empty (14 days with movements from 1 September to 1 October)');
select is(tests.identity('2026-09-15', '2026-09-15'), tests.balance_at('2026-09-16 00:00:00+00'),
  'month: the transfer day balances (out of the godown and into the shop net to zero for the product)');
select is((tests.flow('2026-09-15', '2026-09-15') ->> 'transfers')::numeric, 0.00, 'month: a transfer is no change for the product');
select is(tests.identity('2026-09-08', '2026-09-22'), tests.balance_at('2026-09-23 00:00:00+00'),
  'month: and for any range inside the month (8 to 22 September)');

-- Month boundaries: 23:59:59 on the last day is in September; 00:00:00 on the first of October is not; 00:00:00 on
-- the first of September is.
select is((tests.flow('2026-09-30', '2026-09-30') ->> 'local')::numeric, -1.00,
  'boundary: the sale at 23:59:59 on 30 September counts on 30 September');
select is((tests.flow('2026-09-30', '2026-09-30') ->> 'restocks')::numeric, 0.00,
  'boundary: the restock at 00:00:00 on 1 October does not count on 30 September');
select is((tests.flow('2026-10-01', '2026-10-01') ->> 'restocks')::numeric, 4.00,
  'boundary: it counts on 1 October');
select is((tests.flow('2026-10-01', '2026-10-31') ->> 'local')::numeric, -2.00,
  'boundary: October''s local sales exclude the 23:59:59 sale of 30 September');
select is((tests.flow('2026-08-01', '2026-08-31') ->> 'restocks')::numeric, 50.00,
  'boundary: the restock at 00:00:00 on 1 September is not August''s');
select is(tests.identity('2026-10-01', '2026-10-31'), 72.75, 'boundary: October opens at September''s close and ends at 72.75');

-- The last closing is the stock on hand, and inventory_reconciliation() reports exactly the scripted ledger.
select is((select sum(quantity) from public.inventory_stock where product_id = tests.fx('XP1')), 72.75,
  'current: the stock on hand of XP1 is 72.75 (60 at the shop, 12.75 at the godown)');
select is(tests.balance_at('infinity'), (select sum(quantity) from public.inventory_stock where product_id = tests.fx('XP1')),
  'current: the ledger''s final balance is the stock on hand');
select is(
  tests.recon_row(tests.fx('XA'), 'XP1') - 'product_id',
  '{"marketplace_sales": -12.00, "local_sales": -17.00, "adjustments": 1.00, "restocks_and_purchases": 104.00, "losses": -5.50, "transfers": 0.00, "other": 2.25, "ledger_total": 72.75, "current_stock": 72.75, "balanced": true}'::jsonb,
  'reconciliation: the dealer''s report for XP1 matches the scripted ledger exactly and balances');
select is(
  ((tests.recon_row(tests.fx('XA'), 'XP1') ->> 'marketplace_sales')::numeric
   + (tests.recon_row(tests.fx('XA'), 'XP1') ->> 'local_sales')::numeric
   + (tests.recon_row(tests.fx('XA'), 'XP1') ->> 'adjustments')::numeric
   + (tests.recon_row(tests.fx('XA'), 'XP1') ->> 'restocks_and_purchases')::numeric
   + (tests.recon_row(tests.fx('XA'), 'XP1') ->> 'losses')::numeric
   + (tests.recon_row(tests.fx('XA'), 'XP1') ->> 'transfers')::numeric
   + (tests.recon_row(tests.fx('XA'), 'XP1') ->> 'other')::numeric),
  tests.identity('2026-01-01', '2026-12-31'),
  'reconciliation: its categories add up to the same closing as the period identity over the whole year');

-- Only the caller's rows.
select is(
  (select array_agg(r ->> 'product_id' order by r ->> 'product_id') from jsonb_array_elements(tests.recon_as(tests.fx('XA'))) r),
  (select array_agg(id::text order by id::text) from public.inventory_products where dealer_id = tests.fx('XA')),
  'reconciliation: dealer A gets exactly their own two products');
select is(
  (select bool_and((r ->> 'balanced')::boolean) from jsonb_array_elements(tests.recon_as(tests.fx('XA'))) r), true,
  'reconciliation: and both balance');
select is(
  (select array_agg(r ->> 'product_id') from jsonb_array_elements(tests.recon_as(tests.fx('XB'))) r),
  array[tests.fx('XBP')::text], 'reconciliation: dealer B gets only their own product, none of dealer A''s');
select is(tests.recon_as(tests.fx('XP')), '[]'::jsonb, 'reconciliation: a pending dealer gets nothing');
select is(tests.recon_as(tests.fx('XR')), '[]'::jsonb, 'reconciliation: a rejected dealer gets nothing');
select is(tests.recon_as(tests.fx('XF')), '[]'::jsonb, 'reconciliation: a farmer gets nothing');
select is(tests.recon_as(tests.fx('XBU')), '[]'::jsonb, 'reconciliation: a buyer gets nothing');
select is(tests.recon_as(tests.fx('XE')), '[]'::jsonb, 'reconciliation: an expert gets nothing');
select is(tests.recon_as(tests.fx('XADM')), '[]'::jsonb, 'reconciliation: the admin gets nothing');
select is(tests.recon_as(tests.fx('XADM'), 'aal2'), '[]'::jsonb, 'reconciliation: nor the admin with the second factor');
select is(tests.recon_as(null), '{"err": "42501"}'::jsonb, 'reconciliation: anon is refused');

-- It is not true by construction: a stock row changed outside the stock functions shows as unbalanced.
update public.inventory_stock set quantity = quantity + 1 where product_id = tests.fx('XP1') and location_id = tests.fx('XL2');
select is(
  (tests.recon_row(tests.fx('XA'), 'XP1') ->> 'balanced')::boolean, false,
  'reconciliation: a stock row changed outside the stock functions is reported as unbalanced');
select is(
  (tests.recon_row(tests.fx('XA'), 'XP1') ->> 'current_stock')::numeric
  - (tests.recon_row(tests.fx('XA'), 'XP1') ->> 'ledger_total')::numeric, 1.00,
  'reconciliation: by exactly the difference');
update public.inventory_stock set quantity = quantity - 1 where product_id = tests.fx('XP1') and location_id = tests.fx('XL2');

select * from finish();
rollback;
