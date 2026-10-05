-- Pair for migration 20261005080000_account_status.sql (A3a; SRDS §8, §11, §13, §50, §51; D10). A dealer or expert
-- starts pending and may do nothing on the platform until an admin with a second factor approves them through
-- decide_account_status(), which writes the audit row itself. Every refused path sits next to the allowed one: the
-- pending dealer PD against the approved dealer D, the pending expert PE against the approved expert E.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();

select tests.world();
select tests.approval_world();

-- Structure ----------------------------------------------------------------------------------------------------------
select is(enum_range(null::public.account_status)::text, '{pending,approved,rejected}', 'account_status: pending, approved, rejected');
-- SRDS §3 and §53 rule 1: exactly five roles. A sixth label would need a migration, and this test with it.
select is(enum_range(null::public.user_role)::text, '{farmer,buyer,dealer,expert,admin}', 'user_role: exactly the five SRDS roles (§3, rule 1)');
select col_not_null('public', 'profiles', 'account_status', 'profiles.account_status is not null');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proname in ('is_account_approved', 'is_approved_dealer', 'is_approved_expert', 'caller_role',
                        'is_approved_expert_id', 'is_seller_role', 'decide_account_status',
                        'notify_account_status_changed', 'reset_expert_on_role_change')
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')),
  array['caller_role', 'decide_account_status', 'is_account_approved', 'is_approved_dealer', 'is_approved_expert',
        'is_approved_expert_id', 'is_seller_role', 'notify_account_status_changed', 'reset_expert_on_role_change'],
  'every new definer function sets search_path');
select tests.expect(null, 'select 1 where public.is_approved_dealer()', 'err:42501', 'helpers: anon cannot call the caller helpers');
select tests.expect(null, 'select public.decide_account_status(' || tests.l('PD') || $$, 'approved')$$, 'err:42501', 'decide_account_status: anon cannot call it');

-- Sign-up: who starts pending (SRDS §50) -----------------------------------------------------------------------------
select tests.make_user('ND', 'dealer');
select tests.make_user('NE', 'expert');
select tests.make_user('NF', 'farmer');
select tests.make_user('NB', 'buyer');
select tests.make_user('NA', 'admin');
select is((select account_status::text from public.profiles where id = tests.fx('ND')), 'pending', 'sign-up: a dealer starts pending');
select is((select account_status::text from public.profiles where id = tests.fx('NE')), 'pending', 'sign-up: an expert starts pending');
select is((select account_status::text from public.profiles where id = tests.fx('NF')), 'approved', 'sign-up: a farmer is usable at once');
select is((select account_status::text from public.profiles where id = tests.fx('NB')), 'approved', 'sign-up: a buyer is usable at once');
select is((select role::text || ' ' || account_status::text from public.profiles where id = tests.fx('NA')), 'buyer approved', 'sign-up: a forged admin sign-up is an approved buyer');

-- Helpers answer about the caller -----------------------------------------------------------------------------------
select tests.expect(tests.fx('D'), 'select 1 where public.is_approved_dealer()', 'rows:1', 'is_approved_dealer: true for an approved dealer');
select tests.expect(tests.fx('PD'), 'select 1 where public.is_approved_dealer()', 'rows:0', 'is_approved_dealer: false while pending');
select tests.expect(tests.fx('F'), 'select 1 where public.is_approved_dealer()', 'rows:0', 'is_approved_dealer: false for a farmer');
select tests.expect(tests.fx('E'), 'select 1 where public.is_approved_expert()', 'rows:1', 'is_approved_expert: true for an approved expert');
select tests.expect(tests.fx('PE'), 'select 1 where public.is_approved_expert()', 'rows:0', 'is_approved_expert: false while pending');
select tests.expect(tests.fx('F'), 'select 1 where public.is_account_approved()', 'rows:1', 'is_account_approved: true for a farmer');
select tests.expect(tests.fx('PD'), 'select 1 where public.is_account_approved()', 'rows:0', 'is_account_approved: false while pending');

-- The status columns: no user session writes them, an admin's included ----------------------------------------------
select tests.expect(tests.fx('PD'), $$update public.profiles set account_status = 'approved' where id = $$ || tests.l('PD'), 'err:42501', 'guard: a pending dealer cannot approve themselves');
select tests.expect(tests.fx('RD'), 'update public.profiles set account_status_reason = null where id = ' || tests.l('RD'), 'err:42501', 'guard: nor clear the rejection reason');
select tests.expect(tests.fx('A'), $$update public.profiles set account_status = 'approved' where id = $$ || tests.l('PD'), 'err:42501', 'guard: an admin with a second factor cannot decide by a direct write either (no audit row)', 'aal2');
select tests.expect(tests.fx('PD'), $$update public.profiles set full_name = 'Pending Dealer' where id = $$ || tests.l('PD'), 'n:1', 'guard: a pending dealer still edits their own profile');

-- Two-user proofs, before the decision: PD refused, D allowed --------------------------------------------------------
select tests.expect(tests.fx('PD'), 'insert into public.dealer_stores (dealer_id, name) values (' || tests.l('PD') || $$, 'Shop')$$, 'err:42501', 'dealer_stores: a pending dealer cannot open a store');
select tests.expect(tests.fx('D'), 'insert into public.dealer_stores (dealer_id, name) values (' || tests.l('D') || $$, 'Shop 2')$$, 'n:1', 'dealer_stores: an approved dealer can');
select tests.expect(tests.fx('B'), 'insert into public.dealer_stores (dealer_id, name) values (' || tests.l('B') || $$, 'Shop')$$, 'err:42501', 'dealer_stores: a buyer cannot (no role check until now)');
select tests.expect(tests.fx('PD'), 'insert into public.suppliers (dealer_id, name) values (' || tests.l('PD') || $$, 'Supplier')$$, 'err:42501', 'suppliers: a pending dealer cannot');
select tests.expect(tests.fx('D'), 'insert into public.suppliers (dealer_id, name) values (' || tests.l('D') || $$, 'Supplier 2')$$, 'n:1', 'suppliers: an approved dealer can');
select tests.expect(tests.fx('PD'), 'insert into public.inventory (dealer_id) values (' || tests.l('PD') || ')', 'err:42501', 'inventory: a pending dealer cannot');
select tests.expect(tests.fx('D'), 'insert into public.inventory (dealer_id) values (' || tests.l('D') || ')', 'n:1', 'inventory: an approved dealer can');
select tests.expect(tests.fx('PD'), 'insert into public.listings (owner_id, title, price, seller_role) values (' || tests.l('PD') || $$, 'Urea', 50, 'dealer')$$, 'err:42501', 'listings: a pending dealer cannot list');
select tests.expect(tests.fx('D'), 'insert into public.listings (owner_id, title, price, seller_role) values (' || tests.l('D') || $$, 'Urea', 50, 'dealer')$$, 'n:1', 'listings: an approved dealer can');
select tests.expect(tests.fx('E'), 'insert into public.listings (owner_id, title, price, seller_role) values (' || tests.l('E') || $$, 'Advice', 50, 'farmer')$$, 'err:42501', 'listings: an expert is not a seller (no role check until now)');
select tests.expect(tests.fx('PD'), $$insert into storage.objects (bucket_id, name, owner) values ('listing-images', $$ || quote_literal(tests.fx('PD') || '/a.jpg') || ', ' || tests.l('PD') || ')', 'err:42501', 'listing-images: a pending dealer cannot upload');
select tests.expect(tests.fx('D'), $$insert into storage.objects (bucket_id, name, owner) values ('listing-images', $$ || quote_literal(tests.fx('D') || '/a.jpg') || ', ' || tests.l('D') || ')', 'n:1', 'listing-images: an approved dealer can');
select tests.expect(tests.fx('PD'), 'insert into public.conversations (participant_one, participant_two) values (' || tests.l('PD') || ', ' || tests.l('F2') || ')', 'err:42501', 'conversations: a pending dealer cannot start a chat');
select tests.expect(tests.fx('D'), 'insert into public.conversations (participant_one, participant_two) values (' || tests.l('D') || ', ' || tests.l('F2') || ')', 'n:1', 'conversations: an approved dealer can');
select tests.expect(tests.fx('PD'), 'insert into public.orders (buyer_id, seller_id, delivery_charge) values (' || tests.l('PD') || ', ' || tests.l('F') || ', 0)', 'err:42501', 'orders: a pending dealer cannot buy');
select tests.expect(tests.fx('B2'), 'insert into public.orders (buyer_id, seller_id, delivery_charge) values (' || tests.l('B2') || ', ' || tests.l('PD') || ', 0)', 'err:23514', 'orders: nobody can buy from a pending dealer (is_seller_role)');
select tests.expect(tests.fx('B2'), 'insert into public.orders (buyer_id, seller_id, delivery_charge) values (' || tests.l('B2') || ', ' || tests.l('D') || ', 0)', 'n:1', 'orders: but from an approved dealer, yes');
select tests.expect(tests.fx('PD'), 'insert into public.reports (reporter_id, target_type, target_id, reason) values (' || tests.l('PD') || $$, 'user', $$ || tests.l('F') || $$, 'spam')$$, 'err:42501', 'reports: a pending dealer cannot file a report');
select tests.expect(tests.fx('PD'), 'insert into public.farms (owner_id, name) values (' || tests.l('PD') || $$, 'Farm')$$, 'err:42501', 'farms: a pending dealer cannot');
select tests.expect(tests.fx('PD'), 'insert into public.disease_cases (user_id, storage_path) values (' || tests.l('PD') || ', ' || quote_literal(tests.fx('PD') || '/leaf.jpg') || ')', 'err:42501', 'disease_cases: a pending dealer cannot scan');
select tests.expect(tests.fx('PD'), 'insert into public.listing_views (listing_id, viewer_id) values (' || tests.l('L1') || ', ' || tests.l('PD') || ')', 'err:42501', 'listing_views: a pending dealer records no view');
select tests.expect(tests.fx('PD'), 'update public.notifications set read = true where user_id = ' || tests.l('PD'), 'n:0', 'notifications: a pending dealer still marks their own (none yet)');

-- Experts: the application stays open to a pending expert, the work does not. PE0's application is a draft; since
-- 20261012080000 one under review (PE) is frozen, which that migration's own test file proves.
select tests.expect(tests.fx('PE0'), $$update public.experts set qualifications = 'MSc Plant Pathology' where id = $$ || tests.l('PE0'), 'n:1', 'experts: a pending expert edits their application');
select tests.expect(tests.fx('PE0'), 'insert into public.expert_specializations (expert_id, specialization) values (' || tests.l('PE0') || $$, 'soil_management')$$, 'n:1', 'expert_specializations: a pending expert adds one');
select tests.expect(tests.fx('PE0'), $$insert into storage.objects (bucket_id, name, owner) values ('expert-documents', $$ || quote_literal(tests.fx('PE0') || '/degree.pdf') || ', ' || tests.l('PE0') || ')', 'n:1', 'expert-documents: a pending expert uploads into their own folder');
select tests.expect(tests.fx('PE0'), $$insert into storage.objects (bucket_id, name, owner) values ('expert-documents', $$ || quote_literal(tests.fx('E') || '/degree.pdf') || ', ' || tests.l('PE0') || ')', 'err:42501', 'expert-documents: not into someone else''s folder');
select tests.expect(tests.fx('B'), $$insert into storage.objects (bucket_id, name, owner) values ('expert-documents', $$ || quote_literal(tests.fx('B') || '/degree.pdf') || ', ' || tests.l('B') || ')', 'err:42501', 'expert-documents: a buyer cannot upload at all');
select tests.expect(tests.fx('B'), 'insert into public.expert_specializations (expert_id, specialization) values (' || tests.l('B') || $$, 'soil_management')$$, 'err:42501', 'expert_specializations: a buyer cannot add one');
select tests.expect(tests.fx('B'), 'insert into public.consultations (user_id, expert_id, subject) values (' || tests.l('B') || ', ' || tests.l('PE') || $$, 'Help')$$, 'err:42501', 'consultations: nobody can consult a pending expert');
select tests.expect(tests.fx('B'), 'insert into public.consultations (user_id, expert_id, subject) values (' || tests.l('B') || ', ' || tests.l('E') || $$, 'Help')$$, 'n:1', 'consultations: but an approved expert, yes');
select tests.expect(tests.fx('B'), 'select id from public.experts where id = ' || tests.l('PE'), 'rows:0', 'experts: a pending expert is not in the directory');
-- A consultation that reached PE before (planted as the owner): the pending expert cannot act on it, E can on theirs.
with x as (insert into public.consultations (user_id, expert_id, subject) values (tests.fx('B2'), tests.fx('PE'), 'Old') returning id)
  insert into tests.fixtures select 'PCONS', id from x;
select tests.expect(tests.fx('PE'), $$update public.consultations set status = 'accepted' where id = $$ || tests.l('PCONS'), 'n:0', 'consultations: a pending expert cannot accept a request');
select tests.expect(tests.fx('E'), $$update public.consultations set status = 'accepted' where id = $$ || tests.l('CONS1'), 'n:1', 'consultations: an approved expert can');
select tests.expect(tests.fx('PE'), 'insert into public.consultation_messages (consultation_id, sender_id, body) values (' || tests.l('PCONS') || ', ' || tests.l('PE') || $$, 'hello')$$, 'err:42501', 'consultation_messages: a pending expert cannot write');

-- decide_account_status: only an admin with a second factor, only a pending dealer or expert -------------------------
select tests.expect(tests.fx('D'), 'select public.decide_account_status(' || tests.l('PD') || $$, 'approved')$$, 'err:42501', 'decide: a dealer cannot decide');
select tests.expect(tests.fx('A'), 'select public.decide_account_status(' || tests.l('PD') || $$, 'approved')$$, 'err:42501', 'decide: an admin without a second factor cannot');
select tests.expect(tests.fx('A'), 'select public.decide_account_status(' || tests.l('PD') || $$, 'rejected', 'no')$$, 'err:23514', 'decide: a rejection needs a reason of 10 characters', 'aal2');
select tests.expect(tests.fx('A'), 'select public.decide_account_status(' || tests.l('F') || $$, 'approved')$$, 'err:23514', 'decide: farmers are not reviewed', 'aal2');
select tests.expect(tests.fx('A'), 'select public.decide_account_status(' || tests.l('PE0') || $$, 'approved')$$, 'err:23514', 'decide: an expert who has not submitted cannot be approved (20261012080000)', 'aal2');
select tests.expect(tests.fx('A'), 'select public.decide_account_status(' || tests.l('D') || $$, 'rejected', 'Taking the approval back')$$, 'err:23514', 'decide: an approval is not taken back by a decision (suspension is the tool)', 'aal2');
select tests.expect(tests.fx('A'), 'select public.decide_account_status(' || tests.l('PD') || $$, 'approved')$$, 'rows:1', 'decide: an admin with a second factor approves', 'aal2');
select is((select account_status::text from public.profiles where id = tests.fx('PD')), 'approved', 'decide: the dealer is approved');
select is(
  (select previous_state ->> 'account_status' || ' > ' || (new_state ->> 'account_status') from public.audit_logs
    where action = 'dealer_application_approved' and target_id = tests.fx('PD') and actor_id = tests.fx('A')),
  'pending > approved',
  'decide: the audit row is written with the decision (BR-15, SRDS §51)');
select is((select count(*) from public.notifications where user_id = tests.fx('PD') and type = 'account_status_changed'), 1::bigint, 'decide: the dealer is told');
select tests.expect(tests.fx('A'), 'select public.decide_account_status(' || tests.l('PD') || $$, 'approved')$$, 'err:23514', 'decide: an application is decided once', 'aal2');
select tests.expect(tests.fx('PD'), 'insert into public.dealer_stores (dealer_id, name) values (' || tests.l('PD') || $$, 'Shop')$$, 'n:1', 'dealer_stores: after approval the dealer opens a store');

-- An expert: the verification follows, and the latest verification row records the decision ------------------------
select tests.expect(tests.fx('A'), 'select public.decide_account_status(' || tests.l('PE') || $$, 'rejected', 'Please upload your degree certificate.')$$, 'rows:1', 'decide: an admin rejects an expert with a reason', 'aal2');
select is((select account_status::text || ' / ' || account_status_reason from public.profiles where id = tests.fx('PE')), 'rejected / Please upload your degree certificate.', 'decide: the applicant can read the reason');
select is((select verification_status::text from public.experts where id = tests.fx('PE')), 'rejected', 'decide: the expert verification follows');
select is((select decision::text || ' by ' || (reviewed_by = tests.fx('A'))::text from public.expert_verifications where id = tests.fx('PEV')), 'rejected by true', 'decide: the verification row records the decision and the reviewer');
select ok(exists (select 1 from public.audit_logs where action = 'expert_application_rejected' and target_id = tests.fx('PE')), 'decide: the rejection is audited');

-- Sending it again (D10): since 20261012080000 through submit_application(), which checks the application first ---
select tests.expect(tests.fx('ND'), 'select public.submit_application()', 'err:23514', 'resubmit: a pending applicant with nothing filled in cannot submit');
select tests.expect(tests.fx('F'), 'select public.submit_application()', 'err:23514', 'resubmit: a farmer has no application');
select tests.expect(tests.fx('RD'), 'select public.submit_application()', 'rows:1', 'resubmit: a rejected dealer sends it again');
select is((select account_status::text || ' / ' || coalesce(account_status_reason, 'no reason') from public.profiles where id = tests.fx('RD')), 'pending / no reason', 'resubmit: back to pending, the reason cleared');
select tests.expect(tests.fx('PE'), 'select public.submit_application()', 'rows:1', 'resubmit: a rejected expert sends it again');
select is((select verification_status::text from public.experts where id = tests.fx('PE')), 'pending', 'resubmit: the expert verification goes back to pending');

-- A role change is not an approval ---------------------------------------------------------------------------------
select tests.expect(tests.fx('A'), $$update public.profiles set role = 'dealer' where id = $$ || tests.l('F2'), 'n:1', 'role change: an admin with a second factor makes a farmer a dealer', 'aal2');
select is((select account_status::text from public.profiles where id = tests.fx('F2')), 'pending', 'role change: the new dealer waits for a decision');
select tests.expect(tests.fx('B2'), 'insert into public.orders (buyer_id, seller_id, delivery_charge) values (' || tests.l('B2') || ', ' || tests.l('F2') || ', 0)', 'err:23514', 'role change: and cannot be sold to until approved');

-- No decision outside decide_account_status(): an admin with a second factor cannot write an expert record's decision
-- either (verification round 1, L1).
select tests.expect(tests.fx('A'), $$update public.expert_verifications set decision = 'approved' where id = $$ || tests.l('PEV'), 'err:42501', 'expert_verifications: no direct decision, even with a second factor', 'aal2');

-- An approved expert made a farmer and then an expert again is decided again in Approvals (verification round 1, L2).
select tests.expect(tests.fx('A'), $$update public.profiles set role = 'farmer' where id = $$ || tests.l('E'), 'n:1', 'role change: the approved expert is made a farmer', 'aal2');
select tests.expect(tests.fx('A'), $$update public.profiles set role = 'expert' where id = $$ || tests.l('E'), 'n:1', 'role change: and an expert again', 'aal2');
select is((select account_status::text || ' / ' || e.verification_status::text from public.profiles p join public.experts e using (id) where p.id = tests.fx('E')), 'pending / pending', 'role change: the account and the expert record both wait for a new decision');

-- Ratchet: every write policy that checks suspension also checks the account, except the few a pending user keeps ---
select is(
  (select array_agg(schemaname || '.' || tablename || ' ' || policyname order by 1) from pg_policies
    where schemaname in ('public', 'storage') and cmd <> 'SELECT'
      and coalesce(qual, '') || coalesce(with_check, '') like '%is_suspended%'
      and coalesce(qual, '') || coalesce(with_check, '') !~ '(is_account_approved|is_approved_dealer|is_approved_expert|caller_role|is_seller_role|is_application_editable)'),
  array['public.notifications notifications_update_own', 'public.profiles profiles_update_own_or_admin'],
  'ratchet: only the own profile and notifications stay open while pending (the expert application checks editability since 20261012080000)');

select * from finish();
rollback;
