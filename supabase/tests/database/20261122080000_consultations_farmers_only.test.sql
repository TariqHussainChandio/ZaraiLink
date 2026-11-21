-- Pair for migration 20261122080000_consultations_farmers_only.sql (D20).
-- Proves: a farmer still asks a verified expert; a buyer, a dealer and an expert are refused; the other conditions of
-- the policy (own row only, verified expert only) still hold for a farmer; an existing buyer consultation is untouched.
-- Users (helpers/rls_helpers.inc): F/F2 farmers, B buyer, D dealer, E expert; CONS1 is B's consultation with E.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();
select tests.world();

select tests.expect(tests.fx('F'), 'insert into public.consultations (user_id, expert_id, subject) values (' || tests.l('F') || ',' || tests.l('E') || $$, 'Leaf rust?')$$,
  'n:1', 'consultations: a farmer asks a verified expert');
select tests.expect(tests.fx('B'), 'insert into public.consultations (user_id, expert_id, subject) values (' || tests.l('B') || ',' || tests.l('E') || $$, 'From a buyer')$$,
  'err:42501', 'consultations: a buyer cannot ask an expert');
select tests.expect(tests.fx('D'), 'insert into public.consultations (user_id, expert_id, subject) values (' || tests.l('D') || ',' || tests.l('E') || $$, 'From a dealer')$$,
  'err:42501', 'consultations: nor can a dealer');
select tests.expect(tests.fx('F'), 'insert into public.consultations (user_id, expert_id, subject) values (' || tests.l('F2') || ',' || tests.l('E') || $$, 'Forged')$$,
  'err:42501', 'consultations: a farmer still cannot ask as another farmer');
select tests.expect(tests.fx('B'), 'select id from public.consultations where id = ' || tests.l('CONS1'),
  'rows:1', 'consultations: a buyer still reads a consultation they already had');

select * from finish();
rollback;
