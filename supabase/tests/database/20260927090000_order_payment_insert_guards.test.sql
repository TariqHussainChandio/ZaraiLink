-- Pair for migration 20260927090000_order_payment_insert_guards.sql. The allowed and rejected paths for the guards are in
-- 03_policies_orders_and_payments.test.sql and 04_policies_messaging_and_consultations.test.sql; this file pins what the
-- migration creates: the triggers exist, the definer functions pin their search_path and cannot be called by clients,
-- and the client INSERT paths that were closed stay closed.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();

select is(
  (select count(*) from pg_trigger
   where not tgisinternal
     and tgname in ('a_guard_orders_insert', 'a_guard_order_items_insert', 'sync_order_subtotal', 'a_guard_orders_update',
                    'record_order_history_insert', 'record_order_history_update', 'commit_stock_on_confirm',
                    'a_guard_payments_insert', 'a_guard_payments_update', 'record_payment_event',
                    'a_guard_consultations_update')),
  11::bigint, 'all the guard and derived-data triggers exist');

select is(
  (select count(*) from pg_trigger where tgname = 'guard_payments_columns' and not tgisinternal),
  0::bigint, 'the old payments guard, which exempted admins, is gone');

select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('is_seller_role', 'sync_order_subtotal', 'record_order_history', 'commit_stock_on_confirm', 'record_payment_event')
     and p.prosecdef
     and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=public, pg_temp')),
  array['commit_stock_on_confirm', 'is_seller_role', 'record_order_history', 'record_payment_event', 'sync_order_subtotal'],
  'every definer function pins search_path with pg_temp last');

select is(
  (select count(*) from information_schema.routine_privileges
   where routine_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
     and routine_name in ('guard_orders_insert', 'guard_order_items_insert', 'sync_order_subtotal', 'record_order_history',
                          'commit_stock_on_confirm', 'guard_payments_insert', 'guard_payments_update', 'record_payment_event',
                          'reduce_stock_for_order')),
  0::bigint, 'clients cannot call any trigger function, or the stock function, directly');

select is(
  (select count(*) from information_schema.role_table_grants
   where grantee = 'authenticated' and privilege_type = 'INSERT'
     and table_name in ('order_status_history', 'payment_transactions')),
  0::bigint, 'history and payment events have no client INSERT grant');

select tests.world();
select tests.expect(tests.fx('B'), 'select 1 where public.is_seller_role(' || tests.l('F') || ')', 'rows:1', 'is_seller_role answers for a signed-in user (F is a farmer)');
select tests.expect(null, 'select 1 where public.is_seller_role(' || tests.l('F') || ')', 'err:42501', 'and is not callable by anon');

select * from finish();
rollback;
