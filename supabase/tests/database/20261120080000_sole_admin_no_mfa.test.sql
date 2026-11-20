-- Pair for migration 20261120080000_sole_admin_no_mfa.sql (D19).
-- Proves: the admin's writes need no second factor (aal1 is enough) while a non-admin is still refused; there is one
-- admin and a second one is refused by any path; nobody is made an admin from a user session; the admin's role,
-- suspension and personal details do not change from a user session; everyone else still edits their own profile.
-- Users (helpers/rls_helpers.inc): A admin, B/B2 buyers, F farmer, D dealer, E expert.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();
select tests.world();

-- 1. No second factor: an admin write at aal1 reaches the row; a buyer's does not.
select ok(public.is_admin_aal2() is not distinct from public.is_admin(), 'is_admin_aal2: now the same as is_admin');
select tests.expect(tests.fx('A'), 'update public.profiles set is_suspended = true where id = ' || tests.l('B2'),
  'n:1', 'profiles: the admin suspends a user at aal1, with no second factor');
select tests.expect(tests.fx('A'), 'update public.profiles set is_suspended = false where id = ' || tests.l('B2'),
  'n:1', 'profiles: and reactivates them at aal1');
select tests.expect(tests.fx('B'), 'update public.profiles set is_suspended = true where id = ' || tests.l('B2'),
  'n:0', 'profiles: a buyer reaches no other profile, at aal1');
select tests.expect(tests.fx('B'), 'update public.profiles set is_suspended = true where id = ' || tests.l('B2'),
  'n:0', 'profiles: nor with a second factor (a second factor is no admin)', 'aal2');

-- 2. One admin.
select is((select count(*) from public.profiles where role = 'admin'), 1::bigint, 'profiles: the world has one admin');
-- The runbook's own path: the owner, with the role guard paused for the one statement.
alter table public.profiles disable trigger guard_profiles_role;
select throws_ok(
  format($$update public.profiles set role = 'admin' where id = %L$$, tests.fx('B2')),
  '23505', null, 'profiles: a second admin is refused even on the runbook''s path (profiles_single_admin)');
alter table public.profiles enable trigger guard_profiles_role;

-- 3. Nobody becomes an admin from a user session, the admin included.
select tests.expect(tests.fx('A'), $$update public.profiles set role = 'admin' where id = $$ || tests.l('F'),
  'err:42501', 'profiles: the admin cannot make another admin');
select tests.expect(tests.fx('B'), $$update public.profiles set role = 'admin' where id = $$ || tests.l('B'),
  'err:42501', 'profiles: a user cannot make themselves an admin');

-- 4. The admin row is fixed from a user session.
select tests.expect(tests.fx('A'), $$update public.profiles set role = 'buyer' where id = $$ || tests.l('A'),
  'err:42501', 'profiles: the admin cannot change their own role');
select tests.expect(tests.fx('A'), 'update public.profiles set is_suspended = true where id = ' || tests.l('A'),
  'err:42501', 'profiles: the admin cannot suspend themselves');
select tests.expect(tests.fx('A'), $$update public.profiles set phone = '+923001234567' where id = $$ || tests.l('A'),
  'err:42501', 'profiles: the admin''s phone is set by the system');
select tests.expect(tests.fx('A'), $$update public.profiles set street = 'Mall Road', city = 'Lahore' where id = $$ || tests.l('A'),
  'err:42501', 'profiles: and the admin''s address');
select tests.expect(tests.fx('A'), $$update public.profiles set full_name = 'Someone else' where id = $$ || tests.l('A'),
  'err:42501', 'profiles: and the admin''s name');
select tests.expect(tests.fx('A'), 'update public.profiles set notifications_enabled = false where id = ' || tests.l('A'),
  'n:1', 'profiles: a preference that is not a personal detail still changes');

-- 5. Everyone else is unchanged: their own details, and the admin's role changes between the other roles.
select tests.expect(tests.fx('F'), $$update public.profiles set phone = '+923001234567', street = 'Canal Road' where id = $$ || tests.l('F'),
  'n:1', 'profiles: a farmer still edits their own phone and address');
select tests.expect(tests.fx('A'), $$update public.profiles set role = 'farmer' where id = $$ || tests.l('B2'),
  'n:1', 'profiles: the admin still changes a user''s role between the other roles, at aal1');

select * from finish();
rollback;
