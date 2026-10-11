-- Pair for migration 20261025090000_purchase_atomic_writes.sql (B2 verifier F1, F2, F7; SRDS §17, §21, §24, BR-03/04).
-- Proves: purchase lines and new purchases reach the database only through create_purchase and replace_purchase_items
-- (the direct client writes are revoked); both act only for an approved, unsuspended dealer on their own draft, own
-- supplier, products and active locations, with the B1 figure guards; a replacement leaves exactly the new lines and a
-- refused one changes nothing; and a dealer's default location stays active and present, moved only by
-- set_default_location.
--
-- Concurrency (two edits, or an edit and a receive, at once) cannot be shown in one pgTAP transaction: the functions take
-- the purchase row FOR UPDATE, the same lock as receive_purchase, and the API lane proves the race on the real stack.
-- The default-location presence check is a deferred constraint trigger, which never fires in a test that rolls back;
-- tests.at_commit below runs a statement and then forces the check, as a commit would.
begin;
\ir ../helpers/rls_helpers.inc
select plan(114);

-- ---------------------------------------------------------------------------------------------------------------------
-- Fixtures, as the owner: approved dealers PWA, PWB and PWC (PWC has no location yet), a pending dealer PWP, a suspended
-- dealer PWS, a farmer PWF and an admin PWADM.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  a uuid := tests.make_user('PWA', 'dealer');
  b uuid := tests.make_user('PWB', 'dealer');
  c uuid := tests.make_user('PWC', 'dealer');
  pd uuid := tests.make_user('PWP', 'dealer');
  sd uuid := tests.make_user('PWS', 'dealer');
  f uuid := tests.make_user('PWF', 'farmer');
  adm uuid := tests.make_user('PWADM', 'buyer');
  la1 uuid; la2 uuid; la3 uuid; lb1 uuid; lp uuid; ls uuid;
  sa uuid; sb uuid; pa1 uuid; pa2 uuid; pb uuid; pp uuid; ps uuid;
  pur uuid; purr uuid; purc uuid; purd uuid;
begin
  alter table public.profiles disable trigger guard_profiles_role;
  update public.profiles set role = 'admin' where id = adm;
  alter table public.profiles enable trigger guard_profiles_role;
  perform tests.approve(array[a, b, c, sd]);
  update public.profiles set is_suspended = true where id = sd;

  insert into public.inventory_locations (dealer_id, name, is_default) values (a, 'A shop', true) returning id into la1;
  insert into public.inventory_locations (dealer_id, name, kind) values (a, 'A godown', 'godown') returning id into la2;
  insert into public.inventory_locations (dealer_id, name, is_active) values (a, 'A old shelf', false) returning id into la3;
  insert into public.inventory_locations (dealer_id, name, is_default) values (b, 'B shop', true) returning id into lb1;
  insert into public.inventory_locations (dealer_id, name, is_default) values (pd, 'P shop', true) returning id into lp;
  insert into public.inventory_locations (dealer_id, name, is_default) values (sd, 'S shop', true) returning id into ls;
  insert into public.inventory_suppliers (dealer_id, name) values (a, 'A supplier') returning id into sa;
  insert into public.inventory_suppliers (dealer_id, name) values (b, 'B supplier') returning id into sb;
  insert into public.inventory_products (dealer_id, sku, name) values (a, 'UREA-50', 'Urea 50kg') returning id into pa1;
  insert into public.inventory_products (dealer_id, sku, name) values (a, 'DAP-50', 'DAP 50kg') returning id into pa2;
  insert into public.inventory_products (dealer_id, sku, name) values (b, 'B-1', 'B item') returning id into pb;
  insert into public.inventory_products (dealer_id, sku, name) values (pd, 'P-1', 'P item') returning id into pp;
  insert into public.inventory_products (dealer_id, sku, name) values (sd, 'S-1', 'S item') returning id into ps;

  -- A's draft with one line, a received purchase and a cancelled one.
  insert into public.inventory_purchases (dealer_id, reference) values (a, 'PUR') returning id into pur;
  insert into public.inventory_purchase_items (purchase_id, dealer_id, product_id, location_id, quantity)
    values (pur, a, pa1, la1, 1);
  insert into public.inventory_purchases (dealer_id, reference) values (a, 'PURR') returning id into purr;
  insert into public.inventory_purchase_items (purchase_id, dealer_id, product_id, location_id, quantity)
    values (purr, a, pa1, la1, 9);
  update public.inventory_purchases set status = 'received', received_at = now() where id = purr;
  insert into public.inventory_purchases (dealer_id, reference, status) values (a, 'PURC', 'cancelled') returning id into purc;
  insert into public.inventory_purchases (dealer_id, reference) values (a, 'PURD') returning id into purd;

  insert into tests.fixtures values ('LA1', la1), ('LA2', la2), ('LA3', la3), ('LB1', lb1), ('LP', lp), ('LS', ls),
    ('SA', sa), ('SB', sb), ('PA1', pa1), ('PA2', pa2), ('PB', pb), ('PP', pp), ('PS', ps),
    ('PUR', pur), ('PURR', purr), ('PURC', purc), ('PURD', purd);
end $$;

-- One purchase line as JSON. _qty and _cost are JSON text, so a test can send '"NaN"' or 1.005 exactly.
create function tests.line(_product text, _location text, _qty text, _cost text default 'null') returns jsonb
language sql as $$
  select jsonb_build_object('product_id', tests.fx(_product), 'location_id', tests.fx(_location),
                            'quantity', _qty::jsonb, 'unit_cost', _cost::jsonb)
$$;

-- create_purchase / replace_purchase_items as a user: the probe result ('rows:1' on success, 'err:XXXXX' when refused).
create function tests.create_p(_uid uuid, _supplier text, _ref text, _items jsonb, _aal text default 'aal1') returns text
language sql as $$
  select tests.probe(_uid, format('select public.create_purchase(%s, null, %L, null, %L::jsonb)',
    coalesce(tests.l(_supplier), 'null'), _ref, _items::text), _aal)
$$;
create function tests.replace_p(_uid uuid, _purchase text, _items jsonb, _header jsonb default null,
                                _aal text default 'aal1') returns text
language sql as $$
  select tests.probe(_uid, format('select public.replace_purchase_items(%s, %L::jsonb, %L::jsonb)',
    tests.l(_purchase), _items::text, _header::text), _aal)
$$;

-- Runs one statement as a user, then forces the deferred default-location check as a commit would ('ok' for a select,
-- 'n:N' for a write, 'err:XXXXX' when the statement or the check refused it). The check is set back to deferred after.
create function tests.at_commit(_uid uuid, _sql text) returns text language plpgsql as $$
declare
  n bigint;
  result text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    execute _sql;
    get diagnostics n = row_count;
    execute 'set constraints public.check_inventory_default_location immediate';
    execute 'set constraints public.check_inventory_default_location deferred';
    result := case when lower(ltrim(_sql)) like 'select%' then 'ok' else 'n:' || n end;
  exception when others then
    result := 'err:' || sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return result;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Structure, grants and revokes (an explicit list, so a widened grant fails here)
-- ---------------------------------------------------------------------------------------------------------------------
select has_function('public', 'create_purchase', array['uuid', 'date', 'text', 'text', 'jsonb'], 'create_purchase exists');
select has_function('public', 'replace_purchase_items', array['uuid', 'jsonb', 'jsonb'], 'replace_purchase_items exists');
select has_function('public', 'set_default_location', array['uuid'], 'set_default_location exists');
select is(
  (select count(*) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proname in ('create_purchase', 'replace_purchase_items', 'set_default_location',
                        'inventory_write_purchase_lines', 'check_inventory_default_location')
      and 'search_path=pg_catalog, pg_temp' = any (p.proconfig)),
  5::bigint, 'the five definer functions pin search_path to pg_catalog, pg_temp');
select is(
  (select array_agg(r || ' ' || p.proname order by r, p.proname)
     from pg_proc p cross join unnest(array['anon', 'authenticated']) r
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('create_purchase', 'replace_purchase_items', 'set_default_location',
                        'inventory_write_purchase_lines', 'check_inventory_default_location',
                        'guard_inventory_default_location')
      and has_function_privilege(r, p.oid, 'execute')),
  array['authenticated create_purchase', 'authenticated replace_purchase_items', 'authenticated set_default_location'],
  'authenticated executes exactly the three client functions; anon none; the helper and trigger functions nobody');
select is(
  (select count(*) from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('create_purchase', 'replace_purchase_items', 'set_default_location',
                        'inventory_write_purchase_lines', 'check_inventory_default_location',
                        'guard_inventory_default_location')
      and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))),
  0::bigint, 'PUBLIC executes none of the new functions (the default grant is revoked)');
select table_privs_are('public', 'inventory_purchase_items', 'authenticated', array['SELECT'],
  'authenticated may only read inventory_purchase_items: insert, update and delete are revoked');
select table_privs_are('public', 'inventory_purchases', 'authenticated', array['SELECT', 'UPDATE', 'DELETE'],
  'authenticated keeps select, update and delete on inventory_purchases: insert is revoked');
select is(
  (select count(*) from pg_policies
    where schemaname = 'public'
      and ((tablename = 'inventory_purchase_items' and cmd <> 'SELECT')
           or (tablename = 'inventory_purchases' and cmd = 'INSERT'))),
  0::bigint, 'the policies of the revoked privileges are dropped');
select has_trigger('public', 'inventory_locations', 'guard_inventory_default_location', 'the active-default guard exists');
select ok(
  (select t.tgconstraint <> 0 and t.tgdeferrable and t.tginitdeferred from pg_trigger t
    where t.tgrelid = 'public.inventory_locations'::regclass and t.tgname = 'check_inventory_default_location'),
  'the default-presence check is a constraint trigger, deferrable and initially deferred');

-- ---------------------------------------------------------------------------------------------------------------------
-- The direct path is closed
-- ---------------------------------------------------------------------------------------------------------------------
select tests.expect(tests.fx('PWA'),
  format('insert into public.inventory_purchase_items (purchase_id, dealer_id, product_id, location_id, quantity) values (%s, %s, %s, %s, 1)',
    tests.l('PUR'), tests.l('PWA'), tests.l('PA1'), tests.l('LA1')),
  'err:42501', 'A cannot insert a purchase line directly (F1: the racy path is gone)');
select tests.expect(tests.fx('PWA'),
  format('update public.inventory_purchase_items set quantity = 2 where purchase_id = %s', tests.l('PUR')),
  'err:42501', 'A cannot update a purchase line directly');
select tests.expect(tests.fx('PWA'),
  format('delete from public.inventory_purchase_items where purchase_id = %s', tests.l('PUR')),
  'err:42501', 'A cannot delete purchase lines directly');
select tests.expect(tests.fx('PWA'),
  format('insert into public.inventory_purchases (dealer_id, reference) values (%s, ''DIRECT'')', tests.l('PWA')),
  'err:42501', 'A cannot insert a purchase header directly');

-- ---------------------------------------------------------------------------------------------------------------------
-- create_purchase
-- ---------------------------------------------------------------------------------------------------------------------
select is(tests.create_p(tests.fx('PWA'), 'SA', 'CP-1',
            jsonb_build_array(tests.line('PA1', 'LA1', '5', '100'), tests.line('PA2', 'LA2', '2.5'))),
  'rows:1', 'A creates a draft with two lines');
select results_eq(
  $$select dealer_id = tests.fx('PWA'), supplier_id = tests.fx('SA'), status, purchased_on = current_date
      from public.inventory_purchases where reference = 'CP-1'$$,
  $$values (true, true, 'draft'::text, true)$$,
  'the header is A''s draft, with A''s supplier and today''s date');
select results_eq(
  $$select count(*), sum(i.quantity), sum(i.unit_cost), bool_and(i.dealer_id = tests.fx('PWA'))
      from public.inventory_purchase_items i join public.inventory_purchases p on p.id = i.purchase_id
     where p.reference = 'CP-1'$$,
  $$values (2::bigint, 7.5::numeric, 100::numeric, true)$$,
  'both lines are written, A''s, with their quantities and cost');
select is(tests.create_p(tests.fx('PWA'), null, 'CP-EMPTY', '[]'::jsonb), 'rows:1', 'A creates an empty draft');
select results_eq(
  $$select count(distinct p.id), count(i.id) from public.inventory_purchases p
      left join public.inventory_purchase_items i on i.purchase_id = p.id where p.reference = 'CP-EMPTY'$$,
  $$values (1::bigint, 0::bigint)$$,
  'the empty draft has a header and no lines');

-- Who may call it
select is(tests.create_p(tests.fx('PWB'), 'SA', 'BAD-1', '[]'::jsonb), 'err:42501', 'B cannot use A''s supplier');
select is(tests.create_p(tests.fx('PWB'), null, 'BAD-2', jsonb_build_array(tests.line('PA1', 'LB1', '1'))),
  'err:42501', 'B cannot buy A''s product');
select is(tests.create_p(tests.fx('PWP'), null, 'BAD-3', jsonb_build_array(tests.line('PP', 'LP', '1'))),
  'err:42501', 'a pending dealer cannot create a purchase, even with their own product and location');
select is(tests.create_p(tests.fx('PWS'), null, 'BAD-4', jsonb_build_array(tests.line('PS', 'LS', '1'))),
  'err:42501', 'a suspended dealer cannot create a purchase');
select is(tests.create_p(tests.fx('PWF'), null, 'BAD-5', '[]'::jsonb), 'err:42501', 'a farmer cannot create a purchase');
select is(tests.create_p(tests.fx('PWADM'), null, 'BAD-6', '[]'::jsonb, 'aal2'), 'err:42501',
  'the admin cannot create a purchase, even with aal2 (SRDS §15)');
select is(tests.create_p(null, null, 'BAD-7', '[]'::jsonb), 'err:42501', 'anon cannot call create_purchase');

-- Foreign or inactive references, and the figure guards
select is(tests.create_p(tests.fx('PWA'), 'SB', 'BAD-8', '[]'::jsonb), 'err:42501', 'A cannot name B''s supplier');
select is(tests.create_p(tests.fx('PWA'), null, 'BAD-9',
            jsonb_build_array(tests.line('PA1', 'LA1', '1'), tests.line('PB', 'LA1', '1'))),
  'err:42501', 'A cannot buy B''s product (refused at the second line)');
select is(tests.create_p(tests.fx('PWA'), null, 'BAD-10', jsonb_build_array(tests.line('PA1', 'LB1', '1'))),
  'err:42501', 'A cannot receive into B''s location');
select is(tests.create_p(tests.fx('PWA'), null, 'BAD-11', jsonb_build_array(tests.line('PA1', 'LA3', '1'))),
  'err:22023', 'A cannot use an inactive location');
select is(tests.create_p(tests.fx('PWA'), null, 'BAD-12', jsonb_build_array(tests.line('PA1', 'LA1', '"NaN"'))),
  'err:22023', 'a NaN quantity is refused');
select is(tests.create_p(tests.fx('PWA'), null, 'BAD-13', jsonb_build_array(tests.line('PA1', 'LA1', '1.005'))),
  'err:22023', 'a quantity with three decimals is refused, not rounded');
select is(tests.create_p(tests.fx('PWA'), null, 'BAD-14', jsonb_build_array(tests.line('PA1', 'LA1', '10000000000'))),
  'err:22023', 'a quantity of 10^10 is refused');
select is(tests.create_p(tests.fx('PWA'), null, 'BAD-15', jsonb_build_array(tests.line('PA1', 'LA1', '0'))),
  'err:22023', 'a zero quantity is refused');
select is(tests.create_p(tests.fx('PWA'), null, 'BAD-16', jsonb_build_array(tests.line('PA1', 'LA1', '1', '"NaN"'))),
  'err:22023', 'a NaN unit cost is refused');
select is(tests.create_p(tests.fx('PWA'), null, 'BAD-17', jsonb_build_array(tests.line('PA1', 'LA1', '1', '1.005'))),
  'err:22023', 'a unit cost with three decimals is refused');
select is(tests.create_p(tests.fx('PWA'), null, 'BAD-18', jsonb_build_array(tests.line('PA1', 'LA1', '1', '10000000000'))),
  'err:22023', 'a unit cost of 10^10 is refused');
select is(tests.create_p(tests.fx('PWA'), null, 'BAD-19', jsonb_build_array(tests.line('PA1', 'LA1', '1', '-1'))),
  'err:22023', 'a negative unit cost is refused');
select is(tests.create_p(tests.fx('PWA'), null, 'BAD-20', '{}'::jsonb), 'err:22023', 'lines that are not a list are refused');
select is(tests.create_p(tests.fx('PWA'), null, 'BAD-21',
            jsonb_build_array(tests.line('PA1', 'LA1', '1') || '{"dealer_id": null}'::jsonb)),
  'err:22023', 'a line with a field of its own (dealer_id) is refused');
select is(
  (select count(*) from public.inventory_purchases where reference like 'BAD-%'), 0::bigint,
  'no refused call left a header behind (F2: header and lines are one transaction)');

-- ---------------------------------------------------------------------------------------------------------------------
-- replace_purchase_items
-- ---------------------------------------------------------------------------------------------------------------------
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LA1', '3'), tests.line('PA2', 'LA2', '4'))),
  'rows:1', 'A replaces the draft''s one line with two');
select results_eq(
  format('select count(*), sum(quantity), count(*) filter (where quantity = 1) from public.inventory_purchase_items where purchase_id = %s', tests.l('PUR')),
  $$values (2::bigint, 7::numeric, 0::bigint)$$,
  'the draft holds exactly the two new lines; the old one is gone');
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LA1', '5'))),
  'rows:1', 'A replaces them again with one line of 5');
select results_eq(
  format('select count(*), sum(quantity) from public.inventory_purchase_items where purchase_id = %s', tests.l('PUR')),
  $$values (1::bigint, 5::numeric)$$,
  'exactly the last replacement remains: one line of 5, nothing added to what was there (F1)');
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LA1', '5')),
            jsonb_build_object('supplier_id', tests.fx('SA'), 'reference', 'PUR-EDIT', 'notes', 'checked',
                               'purchased_on', '2026-10-01')),
  'rows:1', 'A edits the header and the lines in one call');
select results_eq(
  format('select supplier_id = %s, reference, notes, purchased_on from public.inventory_purchases where id = %s', tests.l('SA'), tests.l('PUR')),
  $$values (true, 'PUR-EDIT'::text, 'checked'::text, '2026-10-01'::date)$$,
  'the header carries the edit');
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LA1', '5')), '{"status": "received"}'::jsonb),
  'err:22023', 'the header cannot set the status (or any field but the four)');
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LA1', '5')), '{"purchased_on": null}'::jsonb),
  'err:22023', 'the purchase date cannot be cleared');
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LA1', '5')),
            jsonb_build_object('supplier_id', tests.fx('SB'))),
  'err:42501', 'the header cannot name B''s supplier');

-- Who may call it
select is(tests.replace_p(tests.fx('PWB'), 'PUR', '[]'::jsonb), 'err:P0002', 'B cannot edit A''s purchase (not found for B)');
select is(tests.replace_p(tests.fx('PWP'), 'PUR', '[]'::jsonb), 'err:42501', 'a pending dealer cannot call it');
select is(tests.replace_p(tests.fx('PWS'), 'PUR', '[]'::jsonb), 'err:42501', 'a suspended dealer cannot call it');
select is(tests.replace_p(tests.fx('PWF'), 'PUR', '[]'::jsonb), 'err:42501', 'a farmer cannot call it');
select is(tests.replace_p(tests.fx('PWADM'), 'PUR', '[]'::jsonb, null, 'aal2'), 'err:42501', 'the admin cannot, even with aal2');
select is(tests.replace_p(null, 'PUR', '[]'::jsonb), 'err:42501', 'anon cannot call replace_purchase_items');

-- Foreign or inactive references, the figure guards; each refusal must leave the draft as it was
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LA1', '1'), tests.line('PB', 'LA1', '1')),
            '{"reference": "SHOULD-NOT-STICK"}'::jsonb),
  'err:42501', 'a line with B''s product is refused, after a good line and a header edit');
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LB1', '1'))), 'err:42501', 'a line at B''s location is refused');
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LA3', '1'))), 'err:22023', 'a line at an inactive location is refused');
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LA1', '"NaN"'))), 'err:22023', 'a NaN quantity is refused');
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LA1', '1.005'))), 'err:22023', 'a third decimal is refused');
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LA1', '10000000000'))), 'err:22023', 'a quantity of 10^10 is refused');
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LA1', '1', '"NaN"'))), 'err:22023', 'a NaN unit cost is refused');
select is(tests.replace_p(tests.fx('PWA'), 'PUR', null), 'err:22023', 'null lines are refused (a caller cannot wipe the lines by omission)');
select results_eq(
  format($q$select count(*), sum(i.quantity), min(p.reference)
              from public.inventory_purchases p join public.inventory_purchase_items i on i.purchase_id = p.id
             where p.id = %s$q$, tests.l('PUR')),
  $$values (1::bigint, 5::numeric, 'PUR-EDIT'::text)$$,
  'after every refusal the draft still holds its one line of 5 and its header');

-- Only a draft
select is(tests.replace_p(tests.fx('PWA'), 'PURR', jsonb_build_array(tests.line('PA1', 'LA1', '1'))), 'err:22023', 'a received purchase cannot be edited');
select is(tests.replace_p(tests.fx('PWA'), 'PURC', jsonb_build_array(tests.line('PA1', 'LA1', '1'))), 'err:22023', 'a cancelled purchase cannot be edited');
select is(
  (select count(*) from public.inventory_purchase_items where purchase_id = tests.fx('PURR')), 1::bigint,
  'the received purchase keeps its line');

-- Receiving brings in what the draft holds, once
select tests.expect(tests.fx('PWA'), format('select public.receive_purchase(%s)', tests.l('PUR')), 'rows:1', 'A receives the edited draft');
select results_eq(
  format($q$select count(*), sum(quantity),
                   (select quantity from public.inventory_stock where product_id = %s and location_id = %s)
              from public.inventory_movements where purchase_id = %s and source = 'PURCHASE'$q$,
    tests.l('PA1'), tests.l('LA1'), tests.l('PUR')),
  $$values (1::bigint, 5::numeric, 5::numeric)$$,
  'one PURCHASE movement of 5, and 5 in stock: the replaced lines were not added up');
select is(tests.replace_p(tests.fx('PWA'), 'PUR', jsonb_build_array(tests.line('PA1', 'LA1', '1'))), 'err:22023',
  'the received purchase can no longer be edited (F2)');
select tests.expect(tests.fx('PWA'), format('select public.replace_purchase_items(%L::uuid, %L::jsonb)', gen_random_uuid(), '[]'),
  'err:P0002', 'an unknown purchase is not found');
select is(
  tests.probe(tests.fx('PWA'), format('select public.replace_purchase_items((select id from public.inventory_purchases where reference = %L), %L::jsonb)', 'CP-1', '[]')),
  'rows:1', 'A empties a draft with an empty list');
select is(
  (select count(*) from public.inventory_purchase_items i join public.inventory_purchases p on p.id = i.purchase_id
    where p.reference = 'CP-1'), 0::bigint,
  'the emptied draft has no lines');

-- ---------------------------------------------------------------------------------------------------------------------
-- N3 (B2 re-verification): purchase dates, text lengths and the line cap, held in the database
-- ---------------------------------------------------------------------------------------------------------------------
-- create_purchase with a date, as A.
create function tests.create_dated(_day text, _ref text) returns text language sql as $$
  select tests.probe(tests.fx('PWA'), format('select public.create_purchase(null, %L::date, %L)', _day, _ref))
$$;
select is(
  tests.create_dated('infinity', 'D-1') || ' ' || tests.create_dated('-infinity', 'D-2') || ' ' ||
  tests.create_dated('epoch', 'D-3') || ' ' || tests.create_dated('0001-01-01', 'D-4') || ' ' ||
  tests.create_dated('9999-12-31', 'D-5') || ' ' || tests.create_dated('1999-12-31', 'D-6') || ' ' ||
  tests.create_dated((current_date + 367)::text, 'D-7'),
  'err:22023 err:22023 err:22023 err:22023 err:22023 err:22023 err:22023',
  'create_purchase refuses infinity, -infinity, epoch, year 1, 9999-12-31, 1999-12-31 and a year and two days ahead');
select is(
  tests.create_dated('2000-01-01', 'D-OK-1') || ' ' || tests.create_dated((current_date + 366)::text, 'D-OK-2'),
  'rows:1 rows:1', 'create_purchase accepts 2000-01-01 and today + 366');
select is(
  tests.replace_p(tests.fx('PWA'), 'PURD', '[]'::jsonb, '{"purchased_on": "infinity"}'::jsonb) || ' ' ||
  tests.replace_p(tests.fx('PWA'), 'PURD', '[]'::jsonb, '{"purchased_on": "0001-01-01"}'::jsonb),
  'err:22023 err:22023', 'replace_purchase_items refuses an infinite or year-1 date in the header');
select is(
  tests.probe(tests.fx('PWA'), format($q$update public.inventory_purchases set purchased_on = 'infinity' where id = %s$q$, tests.l('PURD'))) || ' ' ||
  tests.probe(tests.fx('PWA'), format($q$update public.inventory_purchases set purchased_on = '9999-12-31' where id = %s$q$, tests.l('PURD'))) || ' ' ||
  tests.probe(tests.fx('PWA'), format($q$update public.inventory_purchases set purchased_on = '2025-05-05' where id = %s$q$, tests.l('PURD'))),
  'err:22023 err:22023 n:1', 'a direct header update refuses infinity and 9999-12-31, and accepts a plausible date');
alter table public.inventory_purchases disable trigger guard_inventory_purchase_day;
select throws_ok(
  format($q$update public.inventory_purchases set purchased_on = '-infinity' where id = %s$q$, tests.l('PURD')),
  '23514', null, 'with the trigger off, the column check still refuses an infinite date');
alter table public.inventory_purchases enable trigger guard_inventory_purchase_day;

select is(
  tests.probe(tests.fx('PWA'), format('select public.create_purchase(null, null, %L)', repeat('r', 81))) || ' ' ||
  tests.replace_p(tests.fx('PWA'), 'PURD', '[]'::jsonb, jsonb_build_object('notes', repeat('n', 1001))) || ' ' ||
  tests.probe(tests.fx('PWA'), format('update public.inventory_purchases set notes = %L where id = %s', repeat('n', 1001), tests.l('PURD'))),
  'err:23514 err:23514 err:23514', 'a purchase reference over 80 or notes over 1000 characters are refused (function and direct)');
select is(
  tests.probe(tests.fx('PWA'), format('select public.create_purchase(null, null, %L)', repeat('r', 80))) || ' ' ||
  tests.probe(tests.fx('PWA'), format('update public.inventory_purchases set notes = %L where id = %s', repeat('n', 1000), tests.l('PURD'))),
  'rows:1 n:1', 'a reference of 80 and notes of 1000 characters are accepted');
select is(
  tests.probe(tests.fx('PWA'), format('insert into public.inventory_suppliers (dealer_id, name) values (%s, %L)', tests.l('PWA'), repeat('s', 121))) || ' ' ||
  tests.probe(tests.fx('PWA'), format('update public.inventory_suppliers set contact = %L where id = %s', repeat('c', 121), tests.l('SA'))) || ' ' ||
  tests.probe(tests.fx('PWA'), format('update public.inventory_suppliers set products_supplied = %L where id = %s', repeat('p', 1001), tests.l('SA'))) || ' ' ||
  tests.probe(tests.fx('PWA'), format('update public.inventory_suppliers set notes = %L where id = %s', repeat('n', 1001), tests.l('SA'))),
  'err:23514 err:23514 err:23514 err:23514', 'supplier name over 120, contact over 120, products and notes over 1000 are refused');
select is(
  tests.probe(tests.fx('PWA'), format('insert into public.inventory_suppliers (dealer_id, name, contact, products_supplied, notes) values (%s, %L, %L, %L, %L)',
    tests.l('PWA'), repeat('s', 120), repeat('c', 120), repeat('p', 1000), repeat('n', 1000))),
  'n:1', 'a supplier at every cap is accepted');
select is(
  tests.probe(tests.fx('PWA'), format('insert into public.inventory_locations (dealer_id, name) values (%s, %L)', tests.l('PWA'), repeat('l', 121))) || ' ' ||
  tests.probe(tests.fx('PWA'), format('update public.inventory_locations set address = %L where id = %s', repeat('a', 301), tests.l('LA2'))) || ' ' ||
  tests.probe(tests.fx('PWA'), format('insert into public.inventory_locations (dealer_id, name, address) values (%s, %L, %L)', tests.l('PWA'), repeat('l', 120), repeat('a', 300))),
  'err:23514 err:23514 n:1', 'a location name over 120 or address over 300 is refused; at the caps it is accepted');
select is(
  tests.probe(tests.fx('PWA'), format('insert into public.inventory_products (dealer_id, sku, name) values (%s, %L, ''x'')', tests.l('PWA'), repeat('k', 121))) || ' ' ||
  tests.probe(tests.fx('PWA'), format('update public.inventory_products set name = %L where id = %s', repeat('n', 121), tests.l('PA2'))) || ' ' ||
  tests.probe(tests.fx('PWA'), format('update public.inventory_products set unit = %L where id = %s', repeat('u', 41), tests.l('PA2'))) || ' ' ||
  tests.probe(tests.fx('PWA'), format('insert into public.inventory_products (dealer_id, sku, name, unit) values (%s, %L, %L, %L)', tests.l('PWA'), repeat('k', 120), repeat('n', 120), repeat('u', 40))),
  'err:23514 err:23514 err:23514 n:1', 'a product SKU or name over 120 or unit over 40 is refused; at the caps it is accepted');
select is(
  tests.probe(tests.fx('PWA'), format($q$select public.record_movement(%s, %s, 'in', 'RESTOCK', 1, %L)$q$, tests.l('PA2'), tests.l('LA2'), repeat('r', 1001))) || ' ' ||
  tests.probe(tests.fx('PWA'), format($q$select public.record_movement(%s, %s, 'in', 'RESTOCK', 1, %L)$q$, tests.l('PA2'), tests.l('LA2'), repeat('r', 1000))),
  'err:23514 rows:1', 'a ledger reason over 1000 characters is refused; 1000 is accepted');
select is(
  tests.create_p(tests.fx('PWA'), null, 'LINES-201', (select jsonb_agg(tests.line('PA1', 'LA2', '1')) from generate_series(1, 201))) || ' ' ||
  tests.replace_p(tests.fx('PWA'), 'PURD', (select jsonb_agg(tests.line('PA1', 'LA2', '1')) from generate_series(1, 201))) || ' ' ||
  tests.create_p(tests.fx('PWA'), null, 'LINES-200', (select jsonb_agg(tests.line('PA1', 'LA2', '1')) from generate_series(1, 200))),
  'err:22023 err:22023 rows:1', '201 lines are refused by both functions; 200 are accepted');
select is(
  (select count(*) from public.inventory_purchase_items i join public.inventory_purchases p on p.id = i.purchase_id
    where p.reference = 'LINES-200'), 200::bigint, 'the 200-line purchase holds its 200 lines');

-- ---------------------------------------------------------------------------------------------------------------------
-- F7: the default location stays active and present
-- ---------------------------------------------------------------------------------------------------------------------
select is(tests.at_commit(tests.fx('PWA'), format('select public.set_default_location(%s)', tests.l('LA2'))),
  'ok', 'A moves the default to the godown, and the commit check passes');
select is(
  (select array_agg(id) from public.inventory_locations where dealer_id = tests.fx('PWA') and is_default),
  array[tests.fx('LA2')], 'the godown is A''s one default');
select ok(
  (select prosrc like '%pg_advisory_xact_lock(hashtextextended(''inventory_default:''%' from pg_proc
    where oid = 'public.set_default_location(uuid)'::regprocedure),
  'N2: set_default_location queues concurrent moves of one dealer on a per-dealer advisory lock');
select ok(
  exists (select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and granted),
  'N2: the advisory lock is held for the rest of the transaction after a move');
select tests.expect(tests.fx('PWA'), format('select public.set_default_location(%s)', tests.l('LA3')),
  'err:22023', 'an inactive location cannot become the default');
select tests.expect(tests.fx('PWA'), format('select public.set_default_location(%s)', tests.l('LB1')),
  'err:P0002', 'A cannot make B''s location their default (not found for A)');
select tests.expect(tests.fx('PWB'), format('select public.set_default_location(%s)', tests.l('LA1')),
  'err:P0002', 'B cannot move A''s default');
select tests.expect(tests.fx('PWP'), format('select public.set_default_location(%s)', tests.l('LP')),
  'err:42501', 'a pending dealer cannot call set_default_location');
select tests.expect(tests.fx('PWS'), format('select public.set_default_location(%s)', tests.l('LS')),
  'err:42501', 'a suspended dealer cannot');
select tests.expect(tests.fx('PWF'), format('select public.set_default_location(%s)', tests.l('LA1')),
  'err:42501', 'a farmer cannot');
select tests.expect(tests.fx('PWADM'), format('select public.set_default_location(%s)', tests.l('LA1')),
  'err:42501', 'the admin cannot, even with aal2', 'aal2');
select tests.expect(null, format('select public.set_default_location(%s)', tests.l('LA1')),
  'err:42501', 'anon cannot call set_default_location');
select results_eq(
  $$select dealer_id = tests.fx('PWA'), id = tests.fx('LA2') or id = tests.fx('LB1')
      from public.inventory_locations where is_default and dealer_id in (tests.fx('PWA'), tests.fx('PWB')) order by name$$,
  $$values (true, true), (false, true)$$,
  'after the refusals A''s default is still the godown and B''s still B''s shop');

-- The direct path, refused: unset or deactivate the default
select is(tests.at_commit(tests.fx('PWA'), format('update public.inventory_locations set is_default = false where id = %s', tests.l('LA2'))),
  'err:23514', 'A cannot unset their default directly: refused at commit (F7)');
select tests.expect(tests.fx('PWA'), format('update public.inventory_locations set is_active = false where id = %s', tests.l('LA2')),
  'err:23514', 'A cannot deactivate their default');
select is(tests.at_commit(tests.fx('PWB'), format('update public.inventory_locations set is_default = false where id = %s', tests.l('LA2'))),
  'n:0', 'B cannot touch A''s default at all (row-level security)');
-- ... and allowed: everything else about a location still works
select is(tests.at_commit(tests.fx('PWA'), format('update public.inventory_locations set name = ''Main godown'' where id = %s', tests.l('LA2'))),
  'n:1', 'A renames the default');
select is(tests.at_commit(tests.fx('PWA'), format('update public.inventory_locations set is_active = false where id = %s', tests.l('LA1'))),
  'n:1', 'A deactivates a location that is no longer the default');

-- A dealer's first location must be the default, and the default goes only with the last location
select tests.expect(tests.fx('PWC'),
  format('insert into public.inventory_locations (dealer_id, name, is_default, is_active) values (%s, ''C closed'', true, false)', tests.l('PWC')),
  'err:23514', 'an inactive location cannot be created as the default');
select is(tests.at_commit(tests.fx('PWC'),
  format('insert into public.inventory_locations (dealer_id, name) values (%s, ''C godown'')', tests.l('PWC'))),
  'err:23514', 'a first location that is not the default is refused at commit');
select is(tests.at_commit(tests.fx('PWC'),
  format('insert into public.inventory_locations (dealer_id, name, is_default) values (%s, ''C shop'', true)', tests.l('PWC'))),
  'n:1', 'C creates their first location as the default');
select is(tests.at_commit(tests.fx('PWC'),
  format('insert into public.inventory_locations (dealer_id, name) values (%s, ''C godown'')', tests.l('PWC'))),
  'n:1', 'a second, non-default location is fine');
select is(tests.at_commit(tests.fx('PWC'),
  format('delete from public.inventory_locations where dealer_id = %s and name = ''C shop''', tests.l('PWC'))),
  'err:23514', 'C cannot delete the default while another location remains');
select is(tests.at_commit(tests.fx('PWC'),
  format('delete from public.inventory_locations where dealer_id = %s and name = ''C godown''', tests.l('PWC'))),
  'n:1', 'C deletes the other location');
select is(tests.at_commit(tests.fx('PWC'),
  format('delete from public.inventory_locations where dealer_id = %s and name = ''C shop''', tests.l('PWC'))),
  'n:1', 'and then the default, their last location: no location needs no default');

select * from finish();
rollback;
