-- Shared helpers for the pgTAP suite (P6 item 3). Included with `\ir ../helpers/rls_helpers.inc` at the top
-- of each test file, inside that file's transaction, so nothing here outlives a test run. It is not named
-- *.sql on purpose: `supabase test db` runs every .sql file under supabase/tests as a test.
--
-- tests.probe(user, statement, aal) runs one statement AS that user through row-level security and returns
--   'rows:N'  for a select (N rows visible),
--   'n:N'     for insert/update/delete (N rows affected; 0 means the policy hid every row),
--   'err:XXXXX' when Postgres raised (42501 = policy or grant refused it).
-- A null user is the anon role. `aal` sets the authentication level claim ('aal2' = second factor done).
-- tests.world() builds the fixtures every policy test reads, as the postgres owner (bypassing RLS), and
-- tests.fx('L1') returns one fixture id.

create schema if not exists tests;
create extension if not exists pgtap with schema extensions;
create table if not exists tests.fixtures (k text primary key, v uuid not null);

create or replace function tests.fx(_key text) returns uuid language sql stable as $$
  select v from tests.fixtures where k = _key
$$;

create or replace function tests.probe(_uid uuid, _sql text, _aal text default 'aal1') returns text
language plpgsql as $$
declare
  n bigint;
  result text;
begin
  if _uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
  else
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', _uid, 'role', 'authenticated', 'aal', _aal)::text,
      true
    );
    execute 'set local role authenticated';
  end if;
  begin
    if lower(ltrim(_sql)) like 'select%' then
      execute 'select count(*) from (' || _sql || ') q' into n;
      result := 'rows:' || n;
    else
      execute _sql;
      get diagnostics n = row_count;
      result := 'n:' || n;
    end if;
  exception when others then
    result := 'err:' || sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return result;
end;
$$;

create or replace function tests.make_user(_key text, _role text) returns uuid language plpgsql as $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, instance_id, raw_user_meta_data)
  values (uid, 'authenticated', 'authenticated', _key || '@pgtap.test', '00000000-0000-0000-0000-000000000000',
          json_build_object('role', _role, 'full_name', 'pgTAP ' || _key)::jsonb);
  insert into tests.fixtures values (_key, uid);
  return uid;
end;
$$;

-- Approve accounts as the owner (a user session may not write the status; only decide_account_status() decides),
-- with the decision notification paused for the statement.
create or replace function tests.approve(_ids uuid[]) returns void language plpgsql as $$
begin
  alter table public.profiles disable trigger notify_account_status_changed;
  update public.profiles set account_status = 'approved' where id = any (_ids);
  alter table public.profiles enable trigger notify_account_status_changed;
end;
$$;

create or replace function tests.world() returns void language plpgsql as $$
declare
  f uuid; f2 uuid; b uuid; b2 uuid; d uuid; d2 uuid; e uuid; s uuid; a uuid;
  l1 uuid; l2 uuid; o1 uuid; pay1 uuid; c1 uuid; farm1 uuid; inv1 uuid; cons1 uuid; dc1 uuid; ev1 uuid;
begin
  f := tests.make_user('F', 'farmer');
  f2 := tests.make_user('F2', 'farmer');
  b := tests.make_user('B', 'buyer');
  b2 := tests.make_user('B2', 'buyer');
  d := tests.make_user('D', 'dealer');
  d2 := tests.make_user('D2', 'dealer');
  e := tests.make_user('E', 'expert');
  s := tests.make_user('S', 'buyer');
  a := tests.make_user('A', 'buyer');
  -- Public signup can never make an admin (handle_new_user), so promote as the owner, with the role guard
  -- trigger paused for this one statement; the whole thing is rolled back with the test.
  alter table public.profiles disable trigger guard_profiles_role;
  update public.profiles set role = 'admin' where id = a;
  alter table public.profiles enable trigger guard_profiles_role;
  update public.profiles set is_suspended = true where id = s;
  -- Dealers and experts start pending (20261005080000_account_status.sql); the policy fixtures are approved ones, so
  -- approve them as the owner, with the decision notification paused so no fixture notification appears.
  perform tests.approve(array[d, d2, e]);

  insert into public.listings (owner_id, title, price, quantity, status, seller_role)
    values (f, 'L active', 100, 10, 'active', 'farmer') returning id into l1;
  insert into public.listings (owner_id, title, price, quantity, status, seller_role)
    values (f, 'L inactive', 100, 10, 'inactive', 'farmer') returning id into l2;
  insert into tests.fixtures values ('L1', l1), ('L2', l2);

  insert into public.orders (buyer_id, seller_id, product_subtotal, delivery_charge)
    values (b, f, 100, 10) returning id into o1;
  insert into tests.fixtures values ('O1', o1);
  with x as (insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o1, l1, 1, 100) returning id)
    insert into tests.fixtures select 'OI1', id from x;
  with x as (insert into public.order_status_history (order_id, to_status, changed_by) values (o1, 'pending', b) returning id)
    insert into tests.fixtures select 'OSH1', id from x;
  insert into public.payments (order_id, buyer_id, amount, method, provider)
    values (o1, b, 110, 'cod', 'manual') returning id into pay1;
  insert into tests.fixtures values ('PAY1', pay1);
  with x as (insert into public.payment_transactions (payment_id, event_type) values (pay1, 'created') returning id)
    insert into tests.fixtures select 'PTX1', id from x;

  insert into public.conversations (participant_one, participant_two) values (b, f) returning id into c1;
  insert into tests.fixtures values ('C1', c1);
  with x as (insert into public.messages (conversation_id, sender_id, body) values (c1, b, 'hello') returning id)
    insert into tests.fixtures select 'M1', id from x;
  -- Notification triggers already wrote rows for B; one explicit row makes the id known.
  with x as (insert into public.notifications (user_id, type) values (b, 'pgtap') returning id)
    insert into tests.fixtures select 'N1', id from x;

  insert into public.farms (owner_id, name) values (f, 'Farm') returning id into farm1;
  insert into tests.fixtures values ('FARM1', farm1);
  with x as (insert into public.farm_crops (farm_id) values (farm1) returning id)
    insert into tests.fixtures select 'FC1', id from x;
  insert into public.farmer_profiles (id) values (f);

  with x as (insert into public.dealer_stores (dealer_id, name) values (d, 'Store') returning id)
    insert into tests.fixtures select 'DS1', id from x;
  with x as (insert into public.suppliers (dealer_id, name) values (d, 'Supplier') returning id)
    insert into tests.fixtures select 'SUP1', id from x;
  insert into public.inventory (dealer_id) values (d) returning id into inv1;
  insert into tests.fixtures values ('INV1', inv1);
  with x as (insert into public.inventory_transactions (inventory_id, type, quantity) values (inv1, 'addition', 1) returning id)
    insert into tests.fixtures select 'IT1', id from x;

  insert into public.experts (id, verification_status) values (e, 'approved');
  insert into public.expert_specializations (expert_id, specialization) values (e, 'plant_diseases');
  insert into public.expert_verifications (expert_id) values (e) returning id into ev1;
  insert into tests.fixtures values ('EV1', ev1);
  insert into public.consultations (user_id, expert_id, subject) values (b, e, 'Help') returning id into cons1;
  insert into tests.fixtures values ('CONS1', cons1);
  with x as (insert into public.consultation_messages (consultation_id, sender_id, body) values (cons1, b, 'hi') returning id)
    insert into tests.fixtures select 'CM1', id from x;

  insert into public.disease_cases (user_id, storage_path) values (b, b || '/leaf.jpg') returning id into dc1;
  insert into tests.fixtures values ('DC1', dc1);
  with x as (insert into public.disease_predictions (disease_case_id, predicted_disease, confidence_score)
    values (dc1, 'healthy', 0.9) returning id)
    insert into tests.fixtures select 'DP1', id from x;
  with x as (insert into public.reports (reporter_id, target_type, target_id, reason)
    values (b, 'user', f, 'spam') returning id)
    insert into tests.fixtures select 'REP1', id from x;
  with x as (insert into public.reviews (seller_id, buyer_id, rating, order_id) values (f, b, 5, o1) returning id)
    insert into tests.fixtures select 'REV1', id from x;
  with x as (insert into public.listing_views (listing_id, viewer_id) values (l1, b2) returning id)
    insert into tests.fixtures select 'LV1', id from x;
end;
$$;

-- One-line assertion: the probe result for (user, statement) must equal `_expected`.
create or replace function tests.expect(_uid uuid, _sql text, _expected text, _label text, _aal text default 'aal1')
returns text language sql as $$
  select extensions.is(tests.probe(_uid, _sql, _aal), _expected, _label)
$$;

-- A fixture id as a quoted uuid literal, for building statements: 'where id = ' || tests.l('O1').
create or replace function tests.l(_key text) returns text language sql stable as $$
  select quote_literal(tests.fx(_key)::text) || '::uuid'
$$;

-- Suspended owners of one row each, so a policy's "and not suspended" half is exercised: the owner can still
-- READ their row (select policies allow it) but every write must be refused. Without these cases a write policy
-- whose predicate equals the select policy's could be replaced by `true` and no test would notice.
create or replace function tests.suspended_world() returns void language plpgsql as $$
declare
  sf uuid := tests.make_user('SF', 'farmer');
  sd uuid := tests.make_user('SD', 'dealer');
  se uuid := tests.make_user('SE', 'expert');
  farm uuid;
begin
  update public.profiles set is_suspended = true where id in (sf, sd, se);
  perform tests.approve(array[sd, se]);
  insert into public.farms (owner_id, name) values (sf, 'Suspended farm') returning id into farm;
  insert into tests.fixtures values ('SFARM', farm);
  with x as (insert into public.farm_crops (farm_id) values (farm) returning id)
    insert into tests.fixtures select 'SFC', id from x;
  insert into public.farmer_profiles (id) values (sf);
  with x as (insert into public.listings (owner_id, title, price, seller_role) values (sf, 'Suspended listing', 5, 'farmer') returning id)
    insert into tests.fixtures select 'SL', id from x;
  with x as (insert into public.dealer_stores (dealer_id, name) values (sd, 'Suspended store') returning id)
    insert into tests.fixtures select 'SDS', id from x;
  with x as (insert into public.suppliers (dealer_id, name) values (sd, 'Suspended supplier') returning id)
    insert into tests.fixtures select 'SSUP', id from x;
  with x as (insert into public.inventory (dealer_id) values (sd) returning id)
    insert into tests.fixtures select 'SINV', id from x;
  insert into public.experts (id) values (se);
  with x as (insert into public.notifications (user_id, type) values (sf, 'pgtap') returning id)
    insert into tests.fixtures select 'SN', id from x;
  with x as (insert into public.consultations (user_id, subject) values (sf, 'Suspended question') returning id)
    insert into tests.fixtures select 'SCONS', id from x;
  with x as (insert into public.conversations (participant_one, participant_two) values (sf, tests.fx('F')) returning id)
    insert into tests.fixtures select 'SC', id from x;
  with x as (insert into public.messages (conversation_id, sender_id, body) values (tests.fx('SC'), tests.fx('F'), 'to the suspended') returning id)
    insert into tests.fixtures select 'SM', id from x;
end;
$$;

-- Accounts waiting for a decision, for the account-status tests (A3a): PD a pending dealer, PE a pending expert who
-- has sent an application, PE0 a pending expert who has not, RD a dealer an admin rejected with a reason. Kept out
-- of world() so the other tests' row counts do not move.
create or replace function tests.approval_world() returns void language plpgsql as $$
declare
  pd uuid := tests.make_user('PD', 'dealer');
  pe uuid := tests.make_user('PE', 'expert');
  pe0 uuid := tests.make_user('PE0', 'expert');
  rd uuid := tests.make_user('RD', 'dealer');
begin
  insert into public.experts (id) values (pe);
  with x as (insert into public.expert_verifications (expert_id) values (pe) returning id)
    insert into tests.fixtures select 'PEV', id from x;
  alter table public.profiles disable trigger notify_account_status_changed;
  update public.profiles
     set account_status = 'rejected', account_status_reason = 'The business licence is missing.'
   where id = rd;
  alter table public.profiles enable trigger notify_account_status_changed;
end;
$$;
