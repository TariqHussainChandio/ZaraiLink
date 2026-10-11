-- Pair for migration 20261019090000_inventory_boundary.sql (B0, SRDS §15-§16, BR-03/04): only the approved dealer who
-- owns a row reads it. Another dealer, a pending or rejected dealer, a farmer and the admin (with or without the second
-- factor) read nothing in stores, suppliers, inventory or its ledger; a suspended dealer still reads their own rows.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();
select tests.world();
select tests.approval_world();

-- PD is a pending dealer (approval_world); give them a row of each kind, as the owner, as data from before approval would be.
do $$
declare inv uuid;
begin
  insert into public.dealer_stores (dealer_id, name) values (tests.fx('PD'), 'Pending store');
  insert into public.suppliers (dealer_id, name) values (tests.fx('PD'), 'Pending supplier');
  insert into public.inventory (dealer_id) values (tests.fx('PD')) returning id into inv;
  insert into public.inventory_transactions (inventory_id, type, quantity) values (inv, 'addition', 1);
  insert into tests.fixtures values ('PDINV', inv);
end $$;

create function tests.reads(_uid uuid, _dealer uuid, _aal text default 'aal1') returns text language sql as $$
  select tests.probe(_uid, format('select id from public.dealer_stores where dealer_id = %L', _dealer), _aal) || ' ' ||
         tests.probe(_uid, format('select id from public.suppliers where dealer_id = %L', _dealer), _aal) || ' ' ||
         tests.probe(_uid, format('select id from public.inventory where dealer_id = %L', _dealer), _aal) || ' ' ||
         tests.probe(_uid, format('select t.id from public.inventory_transactions t join public.inventory i on i.id = t.inventory_id where i.dealer_id = %L', _dealer), _aal)
$$;

select is(tests.reads(tests.fx('D'), tests.fx('D')), 'rows:1 rows:1 rows:1 rows:1', 'the approved owner reads their store, supplier, stock and ledger');
select is(tests.reads(tests.fx('D2'), tests.fx('D')), 'rows:0 rows:0 rows:0 rows:0', 'another approved dealer reads none of it');
select is(tests.reads(tests.fx('F'), tests.fx('D')), 'rows:0 rows:0 rows:0 rows:0', 'a farmer reads none of it');
select is(tests.reads(tests.fx('A'), tests.fx('D')), 'rows:0 rows:0 rows:0 rows:0', 'the admin reads none of it (SRDS §15)');
select is(tests.reads(tests.fx('A'), tests.fx('D'), 'aal2'), 'rows:0 rows:0 rows:0 rows:0', 'not even with the second factor');
select is(tests.reads(tests.fx('PD'), tests.fx('PD')), 'rows:0 rows:0 rows:0 rows:0', 'a pending dealer reads not even their own rows (SRDS §16)');

update public.profiles set account_status = 'rejected', account_status_reason = 'Licence expired, please resend' where id = tests.fx('PD');
select is(tests.reads(tests.fx('PD'), tests.fx('PD')), 'rows:0 rows:0 rows:0 rows:0', 'nor a rejected one');

update public.profiles set is_suspended = true where id = tests.fx('D');
select is(tests.reads(tests.fx('D'), tests.fx('D')), 'rows:1 rows:1 rows:1 rows:1', 'a suspended dealer still reads their own rows (suspended users read, never write)');
update public.profiles set is_suspended = false where id = tests.fx('D');

update public.profiles set account_status = 'approved' where id = tests.fx('PD');
select is(tests.reads(tests.fx('PD'), tests.fx('PD')), 'rows:1 rows:1 rows:1 rows:1', 'once approved, the dealer reads their rows');

select is(
  (select count(*) from pg_policies
   where schemaname = 'public' and tablename in ('dealer_stores', 'suppliers', 'inventory', 'inventory_transactions')
     and (qual ilike '%is_admin%' or with_check ilike '%is_admin%')),
  0::bigint, 'no inventory policy has an admin branch');

select * from finish();
rollback;
