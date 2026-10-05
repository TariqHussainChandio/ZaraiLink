-- Pair for migration 20260928090000_admin_write_scope.sql: an expert cannot approve themselves, an expert verification
-- record carries no decision from its author, and an admin moderates another user's listing only by its status, with a
-- second factor. Each refused path sits next to the allowed one.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();

select tests.world();

-- Experts: an application from a user session starts pending ------------------------------------------------------
select tests.make_user('X', 'expert');
select tests.expect(tests.fx('X'), $$insert into public.experts (id, verification_status) values ($$ || tests.l('X') || $$, 'approved')$$, 'err:P0001', 'experts: an expert cannot apply already approved');
select tests.expect(tests.fx('X'), $$insert into public.experts (id, verification_status) values ($$ || tests.l('X') || $$, 'rejected')$$, 'err:P0001', 'experts: nor with any other decision');
select tests.expect(tests.fx('X'), 'insert into public.experts (id) values (' || tests.l('X') || ')', 'n:1', 'experts: a pending application is accepted');
select is((select verification_status::text from public.experts where id = tests.fx('X')), 'pending', 'experts: and stays pending');
select tests.expect(tests.fx('X'), 'update public.experts set updated_at = now() where id = ' || tests.l('X'), 'n:1', 'experts: the expert still edits their own application');
select tests.expect(tests.fx('X'), $$update public.experts set verification_status = 'approved' where id = $$ || tests.l('X'), 'err:42501', 'experts: but cannot decide it');

-- The guard itself asks for the second factor, not only the policy: an admin who owns an expert row passes the owner
-- branch of experts_update_own_or_admin, so only the guard refuses a password-only session.
insert into public.experts (id) values (tests.fx('A'));
select tests.expect(tests.fx('A'), $$update public.experts set verification_status = 'approved' where id = $$ || tests.l('A'), 'err:42501', 'experts guard: an admin without a second factor cannot decide, even on a row they own');
select tests.expect(tests.fx('A'), $$update public.experts set verification_status = 'approved' where id = $$ || tests.l('X'), 'n:0', 'experts policy: an admin without a second factor cannot decide another expert');
select tests.expect(tests.fx('A'), $$update public.experts set verification_status = 'approved' where id = $$ || tests.l('X'), 'err:42501', 'experts: nor an admin with a second factor, directly; decide_account_status() decides, with its audit row (20261005080000)', 'aal2');
select tests.expect(tests.fx('A'), $$update public.experts set qualifications = 'Rewritten' where id = $$ || tests.l('X'), 'err:42501', 'experts guard: an admin with a second factor cannot rewrite the profile', 'aal2');
select tests.expect(tests.fx('X'), $$update public.experts set qualifications = 'MSc' where id = $$ || tests.l('X'), 'n:1', 'experts guard: the expert edits their own profile');
select tests.expect(tests.fx('A'), 'select public.guard_experts_admin_update()', 'err:42501', 'guard_experts_admin_update: not callable by users');

-- Server-side sessions keep their old freedom on insert (fixtures, migrations).
select tests.make_user('Y', 'expert');
insert into public.experts (id, verification_status) values (tests.fx('Y'), 'approved');
select is((select verification_status::text from public.experts where id = tests.fx('Y')), 'approved', 'experts: a server-side insert is not limited');

-- Expert verification records: never the decision. Since 20261012080000 the expert files no record at all:
-- submit_application() writes one per submission.
select tests.expect(tests.fx('X'), 'insert into public.expert_verifications (expert_id, document_url) values (' || tests.l('X') || $$, 'x/cert.jpg')$$, 'err:42501', 'expert_verifications: an expert files no record directly (20261012080000)');
select tests.expect(tests.fx('X'), $$insert into public.expert_verifications (expert_id, decision) values ($$ || tests.l('X') || $$, 'approved')$$, 'err:42501', 'expert_verifications: but cannot file a decision');
select tests.expect(tests.fx('X'), 'insert into public.expert_verifications (expert_id, reviewed_by) values (' || tests.l('X') || ', ' || tests.l('A') || ')', 'err:42501', 'expert_verifications: nor name a reviewer');
select tests.expect(tests.fx('X'), 'insert into public.expert_verifications (expert_id, decision_at) values (' || tests.l('X') || ', now())', 'err:42501', 'expert_verifications: nor date a decision');
select tests.expect(tests.fx('X'), $$insert into public.expert_verifications (expert_id, notes) values ($$ || tests.l('X') || $$, 'approved')$$, 'err:42501', 'expert_verifications: nor write the reviewer notes');
-- The whole insert grant, pinned: none since 20261012080000.
select is(
  (select array_agg(column_name::text order by column_name) from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'expert_verifications' and grantee = 'authenticated' and privilege_type = 'INSERT'),
  null::text[],
  'expert_verifications: authenticated may insert no column (20261012080000)'
);

-- Listings: the owner edits; an admin with a second factor moderates the status only ---------------------------------
select tests.expect(tests.fx('F'), $$update public.listings set price = 11, title = 'Owner edit' where id = $$ || tests.l('L1'), 'n:1', 'listings guard: the owner edits every field');
select tests.expect(tests.fx('A'), $$update public.listings set title = 'Admin edit' where id = $$ || tests.l('L1'), 'err:42501', 'listings guard: an admin with a second factor cannot change the title', 'aal2');
select tests.expect(tests.fx('A'), 'update public.listings set owner_id = ' || tests.l('A') || ' where id = ' || tests.l('L1'), 'err:42501', 'listings guard: nor take the listing over', 'aal2');
select tests.expect(tests.fx('A'), $$update public.listings set status = 'inactive' where id = $$ || tests.l('L1'), 'n:1', 'listings guard: the status alone is moderation', 'aal2');
select tests.expect(tests.fx('A'), $$delete from public.listings where id = $$ || tests.l('L1'), 'n:0', 'listings: an admin cannot delete it', 'aal2');
select tests.expect(tests.fx('F'), $$delete from public.listings where id = $$ || tests.l('L2'), 'n:1', 'listings: the owner can');
update public.listings set title = 'Server-side' where id = tests.fx('L1');
select is((select title from public.listings where id = tests.fx('L1')), 'Server-side', 'listings guard: a server-side update is not limited');
select tests.expect(tests.fx('A'), 'select public.guard_listings_admin_update()', 'err:42501', 'guard_listings_admin_update: not callable by users');

select * from finish();
rollback;
