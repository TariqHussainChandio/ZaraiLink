-- Pair for migration 20261023080000_admin_moderation.sql (A7; SRDS §14, §15, §51, §53.10; BR-03/04, BR-11, BR-15).
-- Proves: the §51 vocabulary and its foreign key; reviews hidden with a reason and restored, never deleted, by an admin
-- with a second factor only, and who still sees a hidden review; the admin's order and consultation actions (cancel or
-- close before the end, and a dispute resolved, each with a second factor; nothing else); the database-written audit
-- rows; the dashboard counts; and that no admin branch, at aal1 or aal2, reaches the dealer inventory (B0).
-- Users (helpers/rls_helpers.inc): A admin, B/B2 buyers, F farmer seller, D/D2 dealers, E expert, PD a pending dealer
-- (approval_world); null is anon. There is no pending admin: an admin is promoted by the owner, never applies, and
-- is_admin() reads the role only, so the pending account in the two-user proofs is the dealer PD.
-- The legacy-row mapping runs once, inside the migration, on rows that existed before it; a fresh test database has
-- none. The migration's mapping was proven on planted legacy rows (reset to 20261022090000, rows inserted, migration up:
-- 19 rows, every one named, the old name in metadata.change); here the lasting consequences are asserted: no old name is
-- in the vocabulary, every target is, and no row in the log is outside the vocabulary.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();
select tests.world();
select tests.approval_world();

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. The SRDS §51 vocabulary
-- ---------------------------------------------------------------------------------------------------------------------

-- The nine examples the SRDS names, by their label, as the audit screen shows them.
select is(
  (select array_agg(label order by label) from public.audit_event_names where label in (
    'Dealer Application Approved', 'Expert Application Approved', 'Dealer Application Rejected',
    'Expert Application Rejected', 'User Suspended', 'Product Moderated', 'Review Moderated',
    'Order Administrative Action', 'AI Configuration Changed')),
  array['AI Configuration Changed', 'Dealer Application Approved', 'Dealer Application Rejected',
        'Expert Application Approved', 'Expert Application Rejected', 'Order Administrative Action',
        'Product Moderated', 'Review Moderated', 'User Suspended'],
  'audit_event_names: every SRDS §51 example is in the vocabulary');

-- Every name the migration declares (the §51 examples and the other admin actions of §14), exactly.
select is(
  (select array_agg(name order by name) from public.audit_event_names),
  array['account_self_deleted', 'admin_email_changed', 'ai_configuration_changed', 'category_changed',
        'consultation_moderated', 'dealer_application_approved', 'dealer_application_rejected',
        'expert_application_approved', 'expert_application_rejected', 'message_redacted', 'order_administrative_action',
        'product_moderated', 'reference_data_changed', 'report_dismissed', 'report_resolved', 'report_updated', 'required_document_changed',
        'review_moderated', 'user_reactivated', 'user_role_changed', 'user_suspended'],
  'audit_event_names: the vocabulary is exactly the declared names (a fresh database has no legacy names)');

-- The names the backend writes through log_admin_action and the database functions write (decide_account_status,
-- audit_required_documents, audit_admin_email_change, audit_disease_knowledge) are all in it.
select is(
  (select count(*) from unnest(array['user_suspended', 'user_reactivated', 'user_role_changed', 'product_moderated',
     'review_moderated', 'order_administrative_action', 'report_resolved', 'report_dismissed', 'message_redacted',
     'category_changed', 'reference_data_changed', 'required_document_changed', 'consultation_moderated',
     'ai_configuration_changed', 'admin_email_changed', 'account_self_deleted', 'dealer_application_approved',
     'dealer_application_rejected', 'expert_application_approved', 'expert_application_rejected']) n
   where not exists (select 1 from public.audit_event_names e where e.name = n)),
  0::bigint, 'audit_event_names: every name the code writes exists');

-- The old ad-hoc names were mapped, not kept: none is a valid action any more, so no row can stay under one.
select is(
  (select count(*) from public.audit_event_names where name in ('suspend_user', 'reactivate_user', 'change_role',
     'update_listing_status', 'delete_review', 'resolve_order_dispute', 'resolve_report', 'dismiss_report',
     'redact_message', 'create_category', 'update_category', 'delete_category', 'create_reference_data',
     'update_reference_data', 'delete_reference_data', 'required_document_created', 'required_document_updated')),
  0::bigint, 'audit_event_names: none of the seventeen old names survives as a name');
select is(
  (select count(*) from public.audit_logs a where not exists (select 1 from public.audit_event_names n where n.name = a.action)),
  0::bigint, 'audit_logs: no row is outside the vocabulary');

-- The foreign key: an unknown action is refused, whoever writes it; a known one is accepted.
select throws_ok(
  $$insert into public.audit_logs (action, target_entity) values ('made_up_event', 'pgtap')$$,
  '23503', null, 'audit_logs: the owner cannot write an unknown action (foreign key)');
select throws_ok(
  $$insert into public.audit_logs (action, target_entity) values ('Review Moderated', 'pgtap')$$,
  '23503', null, 'audit_logs: a label is not a name');
select lives_ok(
  $$insert into public.audit_logs (action, target_entity) values ('review_moderated', 'pgtap')$$,
  'audit_logs: a §51 name is accepted');
-- No client inserts at all (the database writes the log): the admin with a second factor is refused by the grant.
select tests.expect(tests.fx('A'), 'insert into public.audit_logs (actor_id, action, target_entity) values (' || tests.l('A') || $$, 'review_moderated', 'pgtap')$$,
  'err:42501', 'audit_logs: an admin with a second factor cannot insert directly', 'aal2');
select ok(not has_table_privilege('authenticated', 'public.audit_logs', 'insert')
      and not has_table_privilege('anon', 'public.audit_logs', 'insert')
      and has_table_privilege('service_role', 'public.audit_logs', 'insert'),
  'audit_logs: no insert grant for authenticated or anon; the service role keeps its own (account_self_deleted)');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and cmd = 'INSERT'), 0::bigint,
  'audit_logs: no insert policy remains');
select ok(
  (select confupdtype = 'c' and confdeltype = 'a' from pg_constraint where conname = 'audit_logs_action_fkey'),
  'audit_logs: a rename cascades to the history; a name in use cannot be deleted');

-- Who reads and writes the vocabulary: the admin reads it; nobody else reads it; no client writes it.
select tests.expect(tests.fx('A'), 'select name from public.audit_event_names', 'rows:21', 'audit_event_names: the admin reads it');
select tests.expect(tests.fx('B'), 'select name from public.audit_event_names', 'rows:0', 'audit_event_names: a buyer reads nothing');
select tests.expect(tests.fx('PD'), 'select name from public.audit_event_names', 'rows:0', 'audit_event_names: nor a pending dealer');
select tests.expect(null, 'select name from public.audit_event_names', 'err:42501', 'audit_event_names: anon has no grant');
select tests.expect(tests.fx('A'), $$insert into public.audit_event_names (name, label) values ('new_event', 'New Event')$$,
  'err:42501', 'audit_event_names: even the admin with a second factor cannot add a name', 'aal2');
select tests.expect(tests.fx('A'), $$update public.audit_event_names set label = 'Renamed' where name = 'user_suspended'$$,
  'err:42501', 'audit_event_names: nor rename one', 'aal2');
select tests.expect(tests.fx('A'), $$delete from public.audit_event_names where name = 'user_suspended'$$,
  'err:42501', 'audit_event_names: nor delete one', 'aal2');

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Reviews: hidden with a reason and restored by an admin with a second factor; never deleted
-- ---------------------------------------------------------------------------------------------------------------------

-- REV1: seller F, author B. Who may hide it.
select tests.expect(tests.fx('A'), $$update public.reviews set hidden_at = now(), hidden_reason = 'Abusive' where id = $$ || tests.l('REV1'),
  'n:0', 'reviews: an admin without a second factor cannot hide a review');
select tests.expect(tests.fx('B'), $$update public.reviews set hidden_at = now(), hidden_reason = 'Mine' where id = $$ || tests.l('REV1'),
  'n:0', 'reviews: the author cannot hide it');
select tests.expect(tests.fx('F'), $$update public.reviews set hidden_at = now(), hidden_reason = 'Unfair' where id = $$ || tests.l('REV1'),
  'n:0', 'reviews: the seller cannot hide it');
select tests.expect(tests.fx('PD'), $$update public.reviews set hidden_at = now(), hidden_reason = 'x' where id = $$ || tests.l('REV1'),
  'n:0', 'reviews: nor a pending dealer');
select tests.expect(null, $$update public.reviews set hidden_at = now(), hidden_reason = 'x' where id = $$ || tests.l('REV1'),
  'err:42501', 'reviews: nor anon');
select tests.expect(tests.fx('A'), $$update public.reviews set hidden_at = now() where id = $$ || tests.l('REV1'),
  'err:23514', 'reviews: hiding needs a reason', 'aal2');
select tests.expect(tests.fx('A'), $$update public.reviews set hidden_at = now(), hidden_reason = '   ' where id = $$ || tests.l('REV1'),
  'err:23514', 'reviews: a blank reason is no reason', 'aal2');
select tests.expect(tests.fx('A'), $$update public.reviews set rating = 1 where id = $$ || tests.l('REV1'),
  'err:42501', 'reviews: the admin cannot change the rating (column grant)', 'aal2');
select tests.expect(tests.fx('A'), $$update public.reviews set hidden_at = now() - interval '9 days', hidden_reason = ' Abusive language ', hidden_by = $$
  || tests.l('B') || ' where id = ' || tests.l('REV1'), 'n:1', 'reviews: the admin with a second factor hides it', 'aal2');
select is(
  (select hidden_reason || ' | ' || (hidden_by = tests.fx('A')) || ' | ' || (hidden_at > now() - interval '1 minute') from public.reviews where id = tests.fx('REV1')),
  'Abusive language | true | true',
  'reviews: the guard trims the reason and stamps the time and the acting admin, whatever the client sent');

-- Who sees the hidden review.
select tests.expect(tests.fx('A'), 'select id from public.reviews where id = ' || tests.l('REV1'), 'rows:1', 'hidden review: the admin sees it (to restore it)');
select tests.expect(tests.fx('B'), 'select id from public.reviews where id = ' || tests.l('REV1'), 'rows:1', 'hidden review: its author still sees it');
select tests.expect(tests.fx('F'), 'select id from public.reviews where id = ' || tests.l('REV1'), 'rows:0', 'hidden review: the seller it is about does not');
select tests.expect(tests.fx('B2'), 'select id from public.reviews where id = ' || tests.l('REV1'), 'rows:0', 'hidden review: another buyer does not');
select tests.expect(tests.fx('D'), 'select id from public.reviews where id = ' || tests.l('REV1'), 'rows:0', 'hidden review: a dealer does not');
select tests.expect(tests.fx('PD'), 'select id from public.reviews where id = ' || tests.l('REV1'), 'rows:0', 'hidden review: a pending dealer does not');
select tests.expect(null, 'select id from public.reviews where id = ' || tests.l('REV1'), 'rows:0', 'hidden review: anon does not');
select tests.expect(null, 'select avg(rating) from public.reviews where seller_id = ' || tests.l('F') || ' and rating is not null having count(*) > 0',
  'rows:0', 'hidden review: a public rating of the seller cannot count it');

-- A second hide keeps the first time and takes the new reason; the admin cannot touch anything else.
select tests.expect(tests.fx('A'), $$update public.reviews set hidden_reason = 'Spam' where id = $$ || tests.l('REV1'), 'n:1', 'reviews: the admin may change the reason', 'aal2');
select is((select hidden_reason from public.reviews where id = tests.fx('REV1')), 'Spam', 'reviews: the new reason is kept');
select tests.expect(tests.fx('A'), $$update public.reviews set comment = 'edited' where id = $$ || tests.l('REV1'), 'err:42501', 'reviews: the admin cannot edit the comment (column grant)', 'aal2');

-- Restoring clears all three moderation columns, whatever the client sends.
select tests.expect(tests.fx('A'), $$update public.reviews set hidden_at = null where id = $$ || tests.l('REV1'), 'n:0', 'reviews: an admin without a second factor cannot restore it');
select tests.expect(tests.fx('B'), $$update public.reviews set hidden_at = null, hidden_reason = null, hidden_by = null where id = $$ || tests.l('REV1'), 'n:0', 'reviews: nor can its author');
select tests.expect(tests.fx('A'), $$update public.reviews set hidden_at = null, hidden_reason = 'left over' where id = $$ || tests.l('REV1'), 'n:1', 'reviews: the admin with a second factor restores it', 'aal2');
select is((select row(hidden_at, hidden_reason, hidden_by)::text from public.reviews where id = tests.fx('REV1')), '(,,)', 'reviews: restoring clears the time, the reason and the admin');
select tests.expect(tests.fx('F'), 'select id from public.reviews where id = ' || tests.l('REV1'), 'rows:1', 'restored review: the seller sees it again');
select tests.expect(null, 'select id from public.reviews where id = ' || tests.l('REV1'), 'rows:1', 'restored review: anon sees it again');

-- The constraint holds for server-side writes too (the guard is for user sessions).
select throws_ok($$update public.reviews set hidden_at = now() where id = '$$ || tests.fx('REV1') || $$'$$, '23514', null,
  'reviews: a hidden review without a reason is refused even for the owner (check constraint)');
select throws_ok($$update public.reviews set hidden_reason = 'x' where id = '$$ || tests.fx('REV1') || $$'$$, '23514', null,
  'reviews: a visible review carries no reason (check constraint)');

-- An author files a review with the review's own columns only: never one already hidden under an admin's name.
do $$
declare done uuid;
begin
  insert into public.orders (buyer_id, seller_id, product_subtotal, status)
    values (tests.fx('B2'), tests.fx('F'), 10, 'completed') returning id into done;
  insert into tests.fixtures values ('O_REV', done);
end $$;
select tests.expect(tests.fx('B2'), 'insert into public.reviews (seller_id, buyer_id, rating, order_id, hidden_at, hidden_reason, hidden_by) values ('
  || tests.l('F') || ',' || tests.l('B2') || ',1,' || tests.l('O_REV') || $$, now(), 'pre-hidden', $$ || tests.l('A') || ')',
  'err:42501', 'reviews: an author cannot file a review already hidden under an admin''s name (column grant)');
select tests.expect(tests.fx('B2'), 'insert into public.reviews (seller_id, buyer_id, rating, order_id) values ('
  || tests.l('F') || ',' || tests.l('B2') || ',4,' || tests.l('O_REV') || ')', 'n:1', 'reviews: the same author files a plain review');

-- Nobody deletes a review: no client role holds delete, the admin included.
select tests.expect(tests.fx('A'), 'delete from public.reviews where id = ' || tests.l('REV1'), 'err:42501', 'reviews: an admin cannot delete one');
select tests.expect(tests.fx('A'), 'delete from public.reviews where id = ' || tests.l('REV1'), 'err:42501', 'reviews: not even with a second factor', 'aal2');
select tests.expect(tests.fx('B'), 'delete from public.reviews where id = ' || tests.l('REV1'), 'err:42501', 'reviews: nor its author');
select tests.expect(tests.fx('F'), 'delete from public.reviews where id = ' || tests.l('REV1'), 'err:42501', 'reviews: nor the seller');
select tests.expect(null, 'delete from public.reviews where id = ' || tests.l('REV1'), 'err:42501', 'reviews: nor anon');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'reviews' and cmd = 'DELETE'), 0::bigint,
  'reviews: no delete policy remains');

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Orders: an admin cancels before dispatch with a reason and a second factor; resolves a dispute; nothing else
-- ---------------------------------------------------------------------------------------------------------------------

do $$
declare k text; s text; ord uuid;
begin
  for k, s in select * from (values ('OA_PEND', 'pending'), ('OA_PEND2', 'pending'), ('OA_CONF', 'confirmed'),
      ('OA_PROC', 'processing'), ('OA_READY', 'ready'), ('OA_DISP', 'dispatched'), ('OA_COMP', 'completed'),
      ('OA_CANC', 'cancelled'), ('OA_DISPUTED', 'disputed'), ('OA_DISPUTED2', 'disputed')) v loop
    insert into public.orders (buyer_id, seller_id, product_subtotal, delivery_charge, status)
      values (tests.fx('B'), tests.fx('F'), 100, 10, s::public.order_status) returning id into ord;
    insert into tests.fixtures values (k, ord);
  end loop;
end $$;

-- Cancelling before dispatch.
select tests.expect(tests.fx('A'), $$update public.orders set status = 'cancelled', admin_action_reason = 'Fraud report' where id = $$ || tests.l('OA_PEND'),
  'n:0', 'admin cancel: without a second factor the admin does not reach a pending order');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'cancelled' where id = $$ || tests.l('OA_PEND'),
  'err:23514', 'admin cancel: never without a reason', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'cancelled', admin_action_reason = '  ' where id = $$ || tests.l('OA_PEND'),
  'err:23514', 'admin cancel: a blank reason is no reason', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'cancelled', admin_action_reason = repeat('x', 501) where id = $$ || tests.l('OA_PEND'),
  'err:23514', 'admin cancel: a reason is at most 500 characters', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'cancelled', admin_action_reason = ' Fraud report ' where id = $$ || tests.l('OA_PEND'),
  'n:1', 'admin cancel: a pending order, with a reason and a second factor', 'aal2');
select is((select status::text || ' | ' || admin_action_reason from public.orders where id = tests.fx('OA_PEND')), 'cancelled | Fraud report',
  'admin cancel: the order is cancelled and the trimmed reason kept');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'cancelled', admin_action_reason = 'Stock issue' where id = $$ || tests.l('OA_CONF'),
  'n:1', 'admin cancel: a confirmed order', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'cancelled', admin_action_reason = 'Stock issue' where id = $$ || tests.l('OA_PROC'),
  'n:1', 'admin cancel: a processing order', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'cancelled', admin_action_reason = 'Stock issue' where id = $$ || tests.l('OA_READY'),
  'n:1', 'admin cancel: a ready order', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'cancelled', admin_action_reason = 'Too late' where id = $$ || tests.l('OA_DISP'),
  'n:0', 'admin cancel: not a dispatched order (D5: the goods have left the seller)', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'cancelled', admin_action_reason = 'Too late' where id = $$ || tests.l('OA_COMP'),
  'n:0', 'admin cancel: not a completed order', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'cancelled', admin_action_reason = 'Settle' where id = $$ || tests.l('OA_DISPUTED'),
  'err:23514', 'admin cancel: not a disputed order (a dispute is refunded or completed)', 'aal2');

-- The admin takes no seller or buyer step, and gives no reason without the action it explains.
select tests.expect(tests.fx('A'), $$update public.orders set status = 'confirmed' where id = $$ || tests.l('OA_PEND2'),
  'err:42501', 'admin: cannot confirm an order for the seller', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'rejected' where id = $$ || tests.l('OA_PEND2'),
  'err:42501', 'admin: cannot reject an order for the seller', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set admin_action_reason = 'Note' where id = $$ || tests.l('OA_PEND2'),
  'err:23514', 'admin: a reason without an action is refused', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'pending' where id = $$ || tests.l('OA_CANC'),
  'n:0', 'admin: does not reach a cancelled order (no reopening)', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set delivery_charge = 0, status = 'cancelled', admin_action_reason = 'x' where id = $$ || tests.l('OA_PEND2'),
  'err:42501', 'admin: cannot change the charges while cancelling (BR-09)', 'aal2');

-- Resolving a dispute: a second-factor admin write since A7 (A0 allowed it at aal1), always with a reason.
select tests.expect(tests.fx('A'), $$update public.orders set status = 'completed' where id = $$ || tests.l('OA_DISPUTED'),
  'n:0', 'admin dispute: an admin without a second factor does not reach a disputed order');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'refunded', admin_action_reason = 'x' where id = $$ || tests.l('OA_DISPUTED'),
  'n:0', 'admin dispute: nor with a reason');
select is((select status::text from public.orders where id = tests.fx('OA_DISPUTED')), 'disputed', 'admin dispute: the aal1 attempts left it disputed');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'refunded' where id = $$ || tests.l('OA_DISPUTED'),
  'err:42501', 'admin dispute: the buyer cannot settle it (the second user of the proof)');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'completed' where id = $$ || tests.l('OA_DISPUTED'),
  'err:23514', 'admin dispute: never settled without a reason', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'completed', admin_action_reason = '   ' where id = $$ || tests.l('OA_DISPUTED'),
  'err:23514', 'admin dispute: a blank reason is no reason', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'completed', admin_action_reason = 'Delivered as described' where id = $$ || tests.l('OA_DISPUTED'),
  'n:1', 'admin dispute: an admin with a second factor resolves it as completed, with a reason', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'refunded', admin_action_reason = 'Seller agreed to refund off the platform' where id = $$ || tests.l('OA_DISPUTED2'),
  'n:1', 'admin dispute: resolved as refunded, with a reason (BR-11: no money moves on the platform)', 'aal2');
select is((select admin_action_reason from public.orders where id = tests.fx('OA_DISPUTED2')), 'Seller agreed to refund off the platform',
  'admin dispute: the reason is kept with the resolution');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'disputed' where id = $$ || tests.l('OA_COMP'),
  'n:0', 'admin: cannot open a dispute on a completed order (only the buyer does)', 'aal2');

-- Participants: the buyer still cancels a pending order; nobody but the admin writes the reason.
select tests.expect(tests.fx('F'), $$update public.orders set status = 'cancelled', admin_action_reason = 'Mine' where id = $$ || tests.l('OA_PEND2'),
  'err:42501', 'reason: the seller cannot give an administrative reason');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'cancelled', admin_action_reason = 'Mine' where id = $$ || tests.l('OA_PEND2'),
  'err:42501', 'reason: nor the buyer');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'cancelled' where id = $$ || tests.l('OA_PEND2'),
  'n:1', 'reason: the buyer still cancels their pending order, without one');
select is((select admin_action_reason from public.orders where id = tests.fx('OA_PEND2')), null, 'reason: a participant''s cancellation carries none');
select tests.expect(tests.fx('B2'), $$update public.orders set status = 'cancelled', admin_action_reason = 'x' where id = $$ || tests.l('O1'),
  'n:0', 'orders: another buyer does not reach the order at all');
select tests.expect(tests.fx('B'), 'insert into public.orders (buyer_id, seller_id, product_subtotal, delivery_charge, admin_action_reason) values ('
  || tests.l('B') || ',' || tests.l('F') || $$, 0, 0, 'forged')$$, 'n:1', 'reason: a buyer may send one with a new order...');
select is((select count(*) from public.orders where buyer_id = tests.fx('B') and admin_action_reason = 'forged'), 0::bigint,
  'reason: ...but a new order never carries one (the insert guard clears it)');

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Consultations: an admin closes or cancels an open one, with a reason and a second factor
-- ---------------------------------------------------------------------------------------------------------------------

do $$
declare k text; s text; c uuid;
begin
  for k, s in select * from (values ('CA_REQ', 'requested'), ('CA_ACC', 'accepted'), ('CA_PROG', 'in_progress'),
      ('CA_RES', 'resolved'), ('CA_CLOSED', 'closed')) v loop
    insert into public.consultations (user_id, expert_id, subject, status)
      values (tests.fx('B'), tests.fx('E'), 'Moderation ' || k, s::public.consultation_status) returning id into c;
    insert into tests.fixtures values (k, c);
  end loop;
end $$;

select tests.expect(tests.fx('A'), $$update public.consultations set status = 'cancelled', moderation_reason = 'Abuse' where id = $$ || tests.l('CA_REQ'),
  'n:0', 'consultation moderation: not without a second factor (the admin does not reach the row)');
select tests.expect(tests.fx('A'), $$update public.consultations set status = 'cancelled' where id = $$ || tests.l('CA_REQ'),
  'n:0', 'consultation moderation: and without one the admin takes no requester step either');
select tests.expect(tests.fx('A'), $$update public.consultations set status = 'cancelled' where id = $$ || tests.l('CA_REQ'),
  'err:23514', 'consultation moderation: never without a reason', 'aal2');
select tests.expect(tests.fx('A'), $$update public.consultations set status = 'cancelled', moderation_reason = repeat('x', 501) where id = $$ || tests.l('CA_REQ'),
  'err:23514', 'consultation moderation: a reason is at most 500 characters', 'aal2');
select tests.expect(tests.fx('A'), $$update public.consultations set status = 'cancelled', moderation_reason = ' Abuse ' where id = $$ || tests.l('CA_REQ'),
  'n:1', 'consultation moderation: cancels a requested one', 'aal2');
select is((select status::text || ' | ' || moderation_reason from public.consultations where id = tests.fx('CA_REQ')), 'cancelled | Abuse',
  'consultation moderation: the trimmed reason is kept');
select tests.expect(tests.fx('A'), $$update public.consultations set status = 'closed', moderation_reason = 'Stale' where id = $$ || tests.l('CA_ACC'),
  'n:1', 'consultation moderation: closes an accepted one', 'aal2');
select tests.expect(tests.fx('A'), $$update public.consultations set status = 'closed', moderation_reason = 'Stale' where id = $$ || tests.l('CA_PROG'),
  'n:1', 'consultation moderation: closes one in progress', 'aal2');
select tests.expect(tests.fx('A'), $$update public.consultations set status = 'closed', moderation_reason = 'Stale' where id = $$ || tests.l('CA_RES'),
  'n:1', 'consultation moderation: closes a resolved one', 'aal2');
select tests.expect(tests.fx('A'), $$update public.consultations set status = 'cancelled', moderation_reason = 'Again' where id = $$ || tests.l('CA_CLOSED'),
  'err:23514', 'consultation moderation: not one already closed', 'aal2');
select tests.expect(tests.fx('A'), $$update public.consultations set status = 'resolved', moderation_reason = 'x' where id = $$ || tests.l('CONS1'),
  'err:23514', 'consultation moderation: the admin lands only on closed or cancelled', 'aal2');
select tests.expect(tests.fx('A'), $$update public.consultations set moderation_reason = 'Note' where id = $$ || tests.l('CONS1'),
  'err:23514', 'consultation moderation: a reason without an action is refused', 'aal2');
select tests.expect(tests.fx('E'), $$update public.consultations set status = 'rejected', moderation_reason = 'Mine' where id = $$ || tests.l('CONS1'),
  'err:42501', 'consultation moderation: the expert cannot give a moderation reason');
select tests.expect(tests.fx('B'), $$update public.consultations set status = 'cancelled', moderation_reason = 'Mine' where id = $$ || tests.l('CONS1'),
  'err:42501', 'consultation moderation: nor the requester');
select tests.expect(tests.fx('B'), $$update public.consultations set status = 'cancelled' where id = $$ || tests.l('CONS1'),
  'n:1', 'consultation moderation: the requester still cancels their own, without one');
select tests.expect(tests.fx('B'), 'insert into public.consultations (user_id, expert_id, subject, moderation_reason) values (' || tests.l('B') || ',' || tests.l('E') || $$, 'New', 'forged')$$,
  'n:1', 'consultation moderation: a requester may send a reason with a new consultation...');
select is((select count(*) from public.consultations where moderation_reason = 'forged'), 0::bigint,
  'consultation moderation: ...but a new consultation never carries one');

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Audit rows written by the database (BR-15)
-- ---------------------------------------------------------------------------------------------------------------------

-- The required-document trigger: one row per admin change, under the §51 name, created or updated in metadata.change.
create temporary table audit_before on commit drop as select id from public.audit_logs;
grant select on audit_before to authenticated;
select tests.expect(tests.fx('A'), $$insert into public.required_documents (role, code, label) values ('dealer', 'pgtap_doc', 'pgTAP document')$$,
  'n:1', 'audit: the admin adds a required document', 'aal2');
select tests.expect(tests.fx('A'), $$update public.required_documents set label = 'pgTAP document, renamed' where code = 'pgtap_doc'$$,
  'n:1', 'audit: and renames it', 'aal2');
select is(
  (select array_agg(action || ':' || (metadata ->> 'change') || ':' || (actor_id = tests.fx('A')) order by metadata ->> 'change')
     from public.audit_logs where id not in (select id from audit_before)),
  array['required_document_changed:required_document_created:true', 'required_document_changed:required_document_updated:true'],
  'audit: exactly one row per change, the §51 name, the change and the acting admin');

-- decide_account_status: one row under {role}_application_{decision}.
truncate audit_before;
insert into audit_before select id from public.audit_logs;
select tests.expect(tests.fx('A'), 'select public.decide_account_status(' || tests.l('PD') || $$, 'approved')$$, 'rows:1',
  'audit: the admin approves the pending dealer', 'aal2');
select is(
  (select array_agg(action) from public.audit_logs where id not in (select id from audit_before)),
  array['dealer_application_approved'], 'audit: the decision writes exactly one dealer_application_approved row');

-- The admin's email change (written where Supabase Auth lands it).
truncate audit_before;
insert into audit_before select id from public.audit_logs;
update auth.users set email = 'a-renamed@pgtap.test' where id = tests.fx('A');
update auth.users set email = 'b-renamed@pgtap.test' where id = tests.fx('B');
select is(
  (select array_agg(action || ':' || (target_id = tests.fx('A'))) from public.audit_logs where id not in (select id from audit_before)),
  array['admin_email_changed:true'], 'audit: an admin''s email change writes one admin_email_changed row; a buyer''s writes none');

-- Every other admin write is audited by its table's trigger (section 7 of the migration): exactly one row per action,
-- the §51 name, the backend's metadata.change, actor A, the target, and only the columns the action is about. The
-- helper lists the rows written since the last mark as 'action entity change actor target', sorted (rows written in one
-- transaction share now(), so their time does not order them).
create function tests.audit_mark() returns void language sql as $$
  truncate audit_before;
  insert into audit_before select id from public.audit_logs;
$$;
create function tests.audit_new(_target text default null) returns text language sql as $$
  select coalesce(string_agg(line, '; ' order by line), '')
    from (select concat_ws(' ', action, target_entity, coalesce(metadata ->> 'change', '-'),
                   case when actor_id = tests.fx('A') then 'A' else coalesce(actor_id::text, 'nobody') end,
                   case when target_id is null then '-' when target_id = tests.fx(_target) then 'T' else target_id::text end) as line
            from public.audit_logs where id not in (select id from audit_before)) x
$$;
-- The one row written since the mark (or, given a change, the one with that metadata.change).
create function tests.audit_last(_change text default null) returns public.audit_logs language sql as $$
  select * from public.audit_logs
   where id not in (select id from audit_before) and (_change is null or metadata ->> 'change' = _change)
$$;

do $$
declare r uuid; o uuid;
begin
  insert into public.reports (reporter_id, target_type, target_id, reason) values (tests.fx('B'), 'user', tests.fx('F'), 'spam')
    returning id into r;
  insert into tests.fixtures values ('REP2', r);
  insert into public.reports (reporter_id, target_type, target_id, reason) values (tests.fx('B'), 'user', tests.fx('F'), 'spam')
    returning id into r;
  insert into tests.fixtures values ('REP3', r);
  insert into public.orders (buyer_id, seller_id, product_subtotal, status) values (tests.fx('B'), tests.fx('F'), 10, 'disputed')
    returning id into o;
  insert into tests.fixtures values ('OA_D3', o);
  insert into public.orders (buyer_id, seller_id, product_subtotal) values (tests.fx('B'), tests.fx('F'), 10) returning id into o;
  insert into tests.fixtures values ('OA_SELLER', o);
  insert into tests.fixtures select 'CONS_NEW', id from public.consultations where subject = 'New';
  insert into public.consultations (user_id, expert_id, subject) values (tests.fx('B'), tests.fx('E'), 'Audit question')
    returning id into o;
  insert into tests.fixtures values ('CONS_E', o);
end $$;

-- profiles: suspension, reactivation, role
select tests.audit_mark();
select tests.expect(tests.fx('A'), 'update public.profiles set is_suspended = true where id = ' || tests.l('F2'), 'n:1', 'audit profiles: the admin suspends F2', 'aal2');
select is(tests.audit_new('F2'), 'user_suspended profiles - A T', 'audit profiles: one user_suspended row');
select is((select row(previous_state, new_state)::text from tests.audit_last()), row('{"is_suspended": false}'::jsonb, '{"is_suspended": true}'::jsonb)::text,
  'audit profiles: the suspension before and after, nothing else');
select tests.audit_mark();
select tests.expect(tests.fx('A'), 'update public.profiles set is_suspended = false where id = ' || tests.l('F2'), 'n:1', 'audit profiles: the admin reactivates F2', 'aal2');
select is(tests.audit_new('F2'), 'user_reactivated profiles - A T', 'audit profiles: one user_reactivated row');
select tests.audit_mark();
select tests.expect(tests.fx('A'), $$update public.profiles set role = 'farmer' where id = $$ || tests.l('B2'), 'n:1', 'audit profiles: the admin changes B2''s role', 'aal2');
select is(tests.audit_new('B2'), 'user_role_changed profiles - A T', 'audit profiles: one user_role_changed row');
select is((select row(previous_state, new_state)::text from tests.audit_last()), row('{"role": "buyer"}'::jsonb, '{"role": "farmer"}'::jsonb)::text,
  'audit profiles: the role before and after');
select tests.audit_mark();
select tests.expect(tests.fx('B'), $$update public.profiles set full_name = 'Renamed' where id = $$ || tests.l('B'), 'n:1', 'audit profiles: a buyer edits their own profile');
select tests.expect(tests.fx('A'), 'update public.profiles set is_suspended = true where id = ' || tests.l('F2'), 'n:0', 'audit profiles: an admin without a second factor suspends nobody');
select is(tests.audit_new(), '', 'audit profiles: neither the buyer''s own edit nor the refused suspension writes a row');

-- listings: moderation of another user's listing
select tests.audit_mark();
select tests.expect(tests.fx('A'), $$update public.listings set status = 'inactive' where id = $$ || tests.l('L1'), 'n:1', 'audit listings: the admin moderates F''s listing', 'aal2');
select is(tests.audit_new('L1'), 'product_moderated listings - A T', 'audit listings: one product_moderated row');
select is((select row(previous_state, new_state)::text from tests.audit_last()), row('{"status": "active"}'::jsonb, '{"status": "inactive"}'::jsonb)::text,
  'audit listings: the status before and after');
select tests.audit_mark();
select tests.expect(tests.fx('F'), $$update public.listings set status = 'active' where id = $$ || tests.l('L1'), 'n:1', 'audit listings: the owner reactivates it');
select is(tests.audit_new(), '', 'audit listings: the owner''s own change writes no row');

-- reports: resolved, dismissed, anything else
select tests.audit_mark();
select tests.expect(tests.fx('A'), $$update public.reports set status = 'resolved', resolution_notes = 'Handled' where id = $$ || tests.l('REP1'), 'n:1', 'audit reports: the admin resolves one', 'aal2');
select is(tests.audit_new('REP1'), 'report_resolved reports - A T', 'audit reports: one report_resolved row');
select is((select row(previous_state - 'resolved_at', new_state - 'resolved_at', metadata)::text from tests.audit_last()),
  row('{"status": "open", "resolved_by": null, "resolution_notes": null}'::jsonb,
      jsonb_build_object('status', 'resolved', 'resolved_by', tests.fx('A'), 'resolution_notes', 'Handled'), '{"notes": "Handled"}'::jsonb)::text,
  'audit reports: only the changed columns (the resolver set by the guard), the notes in metadata');
select tests.audit_mark();
select tests.expect(tests.fx('A'), $$update public.reports set status = 'dismissed' where id = $$ || tests.l('REP2'), 'n:1', 'audit reports: dismisses one', 'aal2');
select tests.expect(tests.fx('A'), $$update public.reports set status = 'investigating' where id = $$ || tests.l('REP3'), 'n:1', 'audit reports: investigates one', 'aal2');
select is(tests.audit_new(), concat_ws('; ', 'report_dismissed reports - A ' || tests.fx('REP2'), 'report_updated reports - A ' || tests.fx('REP3')),
  'audit reports: report_dismissed, and report_updated for a change that neither resolves nor dismisses');
select tests.audit_mark();
select tests.expect(tests.fx('B'), $$update public.reports set status = 'dismissed' where id = $$ || tests.l('REP3'), 'n:0', 'audit reports: the reporter cannot act');
select is(tests.audit_new(), '', 'audit reports: and writes no row');

-- reviews: hide and restore
select tests.audit_mark();
select tests.expect(tests.fx('A'), $$update public.reviews set hidden_at = now(), hidden_reason = 'Spam' where id = $$ || tests.l('REV1'), 'n:1', 'audit reviews: the admin hides one', 'aal2');
select tests.expect(tests.fx('A'), 'update public.reviews set hidden_at = null where id = ' || tests.l('REV1'), 'n:1', 'audit reviews: and restores it', 'aal2');
select is(tests.audit_new('REV1'), 'review_moderated reviews hide A T; review_moderated reviews restore A T', 'audit reviews: one hide row, one restore row');
select is((select new_state - 'hidden_at' from tests.audit_last('restore')), '{"hidden_reason": null}'::jsonb, 'audit reviews: the moderation columns only');
select tests.audit_mark();
select tests.expect(tests.fx('B'), $$update public.reviews set hidden_at = now(), hidden_reason = 'x' where id = $$ || tests.l('REV1'), 'n:0', 'audit reviews: the author cannot hide it');
select is(tests.audit_new(), '', 'audit reviews: and writes no row');

-- orders: cancellation and dispute settlement
select tests.audit_mark();
select tests.expect(tests.fx('A'), $$update public.orders set status = 'cancelled', admin_action_reason = 'Fraud' where id = $$ || tests.l('O1'), 'n:1', 'audit orders: the admin cancels one', 'aal2');
select is(tests.audit_new('O1'), 'order_administrative_action order cancel A T', 'audit orders: one cancel row (target "order", as the backend named it)');
select is((select row(previous_state, new_state)::text from tests.audit_last()),
  row('{"status": "pending"}'::jsonb, '{"status": "cancelled", "admin_action_reason": "Fraud"}'::jsonb)::text, 'audit orders: the status and the reason');
select tests.audit_mark();
select tests.expect(tests.fx('A'), $$update public.orders set status = 'refunded', admin_action_reason = 'Agreed' where id = $$ || tests.l('OA_D3'), 'n:1', 'audit orders: settles a dispute', 'aal2');
select is(tests.audit_new('OA_D3'), 'order_administrative_action order resolve_dispute A T', 'audit orders: one resolve_dispute row');
select tests.audit_mark();
select tests.expect(tests.fx('F'), $$update public.orders set status = 'confirmed' where id = $$ || tests.l('OA_SELLER'), 'n:1', 'audit orders: the seller confirms an order');
select is(tests.audit_new(), '', 'audit orders: a participant''s move writes no row');

-- consultations: moderation
select tests.audit_mark();
select tests.expect(tests.fx('A'), $$update public.consultations set status = 'closed', moderation_reason = 'Stale' where id = $$ || tests.l('CONS_NEW'), 'n:1', 'audit consultations: the admin closes one', 'aal2');
select is(tests.audit_new('CONS_NEW'), 'consultation_moderated consultations close A T', 'audit consultations: one close row');
select is((select row(previous_state, new_state)::text from tests.audit_last()),
  row('{"status": "requested", "moderation_reason": null}'::jsonb, '{"status": "closed", "moderation_reason": "Stale"}'::jsonb)::text,
  'audit consultations: the status and the reason');
select tests.audit_mark();
select tests.expect(tests.fx('E'), $$update public.consultations set status = 'accepted' where id = $$ || tests.l('CONS_E'), 'n:1', 'audit consultations: the expert accepts one');
select is(tests.audit_new(), '', 'audit consultations: a participant''s move writes no row');

-- messages: redaction
select tests.audit_mark();
select tests.expect(tests.fx('A'), $$update public.messages set body = '[removed by moderator]' where id = $$ || tests.l('M1'), 'n:1', 'audit messages: the admin redacts one', 'aal2');
select is(tests.audit_new('M1'), 'message_redacted messages - A T', 'audit messages: one message_redacted row');
select is((select row(previous_state, new_state, metadata ->> 'conversation_id')::text from tests.audit_last()), row(null::jsonb, null::jsonb, tests.fx('C1'))::text,
  'audit messages: the redacted text is not copied into the log');
select tests.audit_mark();
select tests.expect(tests.fx('F'), 'update public.messages set read_at = now() where id = ' || tests.l('M1'), 'n:1', 'audit messages: the recipient marks it read');
select is(tests.audit_new(), '', 'audit messages: and writes no row');

-- categories and the reference data: create, update, delete
select tests.audit_mark();
select tests.expect(tests.fx('A'), $$insert into public.categories (name, slug) values ('Audit cat', 'audit-cat')$$, 'n:1', 'audit categories: the admin adds one', 'aal2');
select tests.expect(tests.fx('A'), $$update public.categories set name = 'Audit cat 2' where slug = 'audit-cat'$$, 'n:1', 'audit categories: renames it', 'aal2');
select is((select row(previous_state, new_state)::text from tests.audit_last('update')), row('{"name": "Audit cat"}'::jsonb, '{"name": "Audit cat 2"}'::jsonb)::text,
  'audit categories: an update records the changed column only');
select tests.expect(tests.fx('A'), $$delete from public.categories where slug = 'audit-cat'$$, 'n:1', 'audit categories: deletes it', 'aal2');
select is((select array_agg(concat_ws(' ', action, target_entity, metadata ->> 'change', (actor_id = tests.fx('A'))::text) order by metadata ->> 'change')
             from public.audit_logs where id not in (select id from audit_before)),
  array['category_changed categories create true', 'category_changed categories delete true', 'category_changed categories update true'],
  'audit categories: one row per change');
select tests.audit_mark();
select tests.expect(tests.fx('A'), $$insert into public.crops (name) values ('Audit crop')$$, 'n:1', 'audit crops: the admin adds one', 'aal2');
select tests.expect(tests.fx('A'), $$insert into public.currencies (code, symbol, name) values ('ZZA', 'Z', 'Audit')$$, 'n:1', 'audit currencies: adds one', 'aal2');
select tests.expect(tests.fx('A'), $$insert into public.units (code, label) values ('aud', 'Audit')$$, 'n:1', 'audit units: adds one', 'aal2');
select is((select array_agg(concat_ws(' ', action, target_entity, metadata ->> 'change') order by target_entity)
             from public.audit_logs where id not in (select id from audit_before)),
  array['reference_data_changed crops create', 'reference_data_changed currencies create', 'reference_data_changed units create'],
  'audit reference data: one reference_data_changed row per table, named by the table');
select tests.audit_mark();
select tests.expect(tests.fx('B'), $$insert into public.crops (name) values ('Buyer crop')$$, 'err:42501', 'audit crops: a buyer cannot add one');
insert into public.categories (name, slug) values ('Owner cat', 'owner-cat');
select is(tests.audit_new(), '', 'audit reference data: a refused write and a server-side write (no admin user) write no row');

-- The functions: definer, fixed search_path, not callable by a client.
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('audit_admin_moderation', 'audit_reference_write')
      and p.prosecdef and 'search_path=public, pg_temp' = any (p.proconfig)
      and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')),
  array['audit_admin_moderation', 'audit_reference_write'],
  'audit functions: security definer, search_path = public, pg_temp, no client execute');

-- F2: no forged row: neither in someone else's name nor in nobody's, and a remaining writer cannot back-date one.
select tests.expect(tests.fx('A'), 'insert into public.audit_logs (actor_id, action, target_entity) values (' || tests.l('B') || $$, 'report_dismissed', 'pgtap-forged')$$,
  'err:42501', 'audit_logs: an admin cannot write a row in someone else''s name', 'aal2');
select tests.expect(tests.fx('A'), $$insert into public.audit_logs (actor_id, action, target_entity) values (null, 'report_dismissed', 'pgtap-forged')$$,
  'err:42501', 'audit_logs: nor in nobody''s', 'aal2');
set local role service_role;
insert into public.audit_logs (actor_id, action, target_entity, created_at) values (null, 'account_self_deleted', 'pgtap-dated', '2020-01-01');
reset role;
select ok((select created_at > now() - interval '1 minute' from public.audit_logs where target_entity = 'pgtap-dated'),
  'audit_logs: the service role still writes the self-deletion row, and its time is the database''s, not the 2020 it sent');

-- F6: a suspended admin is no admin.
do $$
declare a2 uuid := tests.make_user('A2', 'buyer');
begin
  alter table public.profiles disable trigger guard_profiles_role;
  update public.profiles set role = 'admin', is_suspended = true where id = a2;
  alter table public.profiles enable trigger guard_profiles_role;
end $$;
select tests.expect(tests.fx('A2'), $$insert into public.categories (name, slug) values ('Suspended cat', 'suspended-cat')$$,
  'err:42501', 'suspended admin: cannot add a category, even with a second factor', 'aal2');
select tests.expect(tests.fx('A2'), 'select id from public.audit_logs', 'rows:0', 'suspended admin: reads no audit log', 'aal2');
select tests.expect(tests.fx('A2'), 'update public.profiles set is_suspended = true where id = ' || tests.l('F'), 'n:0', 'suspended admin: suspends nobody', 'aal2');
select tests.expect(tests.fx('A'), 'select id from public.audit_logs', 'rows:' || (select count(*) from public.audit_logs), 'suspended admin: while the active admin reads the whole log');

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. The dashboard's queue counts
-- ---------------------------------------------------------------------------------------------------------------------

-- One consultation open for more than a week and one open dispute, so every count but the dealers' has something.
insert into public.consultations (user_id, expert_id, subject, created_at)
  values (tests.fx('B2'), tests.fx('E'), 'Stale question', now() - interval '8 days');
insert into public.orders (buyer_id, seller_id, product_subtotal, status) values (tests.fx('B2'), tests.fx('F'), 10, 'disputed');

-- The counts as a session sees them (definer rights: whole, whatever a policy would hide), against the owner's count.
-- Compared with the owner's view, not fixed numbers: the local database may hold rows other runs committed.
create function tests.counts_as(_uid uuid) returns int[] language plpgsql as $$
declare r int[];
begin
  perform set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  select array[c.pending_dealer_applications, c.pending_expert_applications, c.open_reports, c.disputed_orders,
               c.stale_consultations] into r from public.admin_queue_counts() c;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end;
$$;

select tests.expect(tests.fx('A'), 'select * from public.admin_queue_counts()', 'rows:1', 'admin_queue_counts: the admin reads the counts (aal1: a read)');
select is(tests.counts_as(tests.fx('A')),
  array[(select count(*)::int from public.profiles where role = 'dealer' and account_status = 'pending' and application_submitted_at is not null),
        (select count(*)::int from public.profiles where role = 'expert' and account_status = 'pending' and application_submitted_at is not null),
        (select count(*)::int from public.reports where status in ('open', 'investigating')),
        (select count(*)::int from public.orders where status = 'disputed'),
        (select count(*)::int from public.consultations where status in ('requested', 'accepted', 'in_progress')
           and created_at < now() - interval '7 days')],
  'admin_queue_counts: every queue is counted whole');
select ok((tests.counts_as(tests.fx('A')))[2] >= 1 and (tests.counts_as(tests.fx('A')))[3] >= 1
          and (tests.counts_as(tests.fx('A')))[4] >= 1 and (tests.counts_as(tests.fx('A')))[5] >= 1,
  'admin_queue_counts: the fixtures are counted (PE''s application, REP1, the open dispute, the stale consultation)');
select cmp_ok((tests.counts_as(tests.fx('A')))[2], '<',
  (select count(*)::int from public.profiles where role = 'expert' and account_status = 'pending'),
  'admin_queue_counts: a draft application (PE0) is not waiting for the admin');
select tests.expect(tests.fx('B'), 'select * from public.admin_queue_counts()', 'err:42501', 'admin_queue_counts: a buyer is refused');
select tests.expect(tests.fx('PD'), 'select * from public.admin_queue_counts()', 'err:42501', 'admin_queue_counts: a pending dealer is refused');
select tests.expect(null, 'select * from public.admin_queue_counts()', 'err:42501', 'admin_queue_counts: anon has no execute');

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. The admin reaches no dealer inventory, at aal1 or aal2 (SRDS §15, BR-03/04, B0)
-- ---------------------------------------------------------------------------------------------------------------------

-- By policy: no policy on any inventory table, or on the inventory exports bucket, has an admin branch.
select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename like 'inventory\_%'
      and (coalesce(qual, '') ilike '%admin%' or coalesce(with_check, '') ilike '%admin%')),
  0::bigint, 'inventory: no policy on any inventory_* table (inventory_sync_log included) has an admin branch');
select is(
  (select count(*) from pg_policies
    where schemaname = 'storage' and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%inventory%'
      and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%admin%'),
  0::bigint, 'inventory: no policy on the inventory exports bucket has an admin branch');
-- By grant: the admin has no role of its own; it is an authenticated session, so no inventory grant may go beyond what
-- the dealer's own-row policies need, and none goes to anon.
select is(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name like 'inventory\_%' and grantee = 'anon'),
  0::bigint, 'inventory: anon holds no grant on any inventory table');
-- The functions a session can call that touch inventory all start from inventory_caller() (an approved, unsuspended
-- dealer only), except the two that read by row-level security or show a public availability label.
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosrc ilike '%inventory%'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and p.prosrc not ilike '%inventory_caller()%'),
  array['inventory_reconciliation', 'listing_availability'],
  'inventory: every callable inventory function but two gates on inventory_caller()');
select ok(
  (select not prosecdef from pg_proc where oid = 'public.inventory_reconciliation'::regproc),
  'inventory: inventory_reconciliation runs with the caller''s rights, so row-level security applies to the admin');
-- A7's own function reads no inventory.
select is(
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('admin_queue_counts', 'guard_reviews_update', 'guard_orders_update', 'guard_orders_insert',
                    'guard_consultations_update', 'guard_consultations_insert', 'audit_required_documents')
    and prosrc ilike '%inventory%'),
  0::bigint, 'inventory: no A7 function touches inventory');

-- In practice, as the admin at aal1 and at aal2: dealer D's rows in every inventory table read as none and no write lands.
do $$
declare d uuid := tests.fx('D'); pur uuid;
begin
  insert into public.inventory_purchases (dealer_id, supplier_id, status) values (d, tests.fx('SUP1'), 'draft') returning id into pur;
  insert into public.inventory_purchase_items (purchase_id, dealer_id, product_id, location_id, quantity, unit_cost)
    values (pur, d, tests.fx('INV1'), tests.fx('DS1'), 1, 10);
  insert into public.inventory_alert_settings (dealer_id) values (d) on conflict do nothing;
  -- One sync log row: a dispatch event of D's listing that failed to apply, as the owner.
  with o as (insert into public.orders (buyer_id, seller_id, product_subtotal, status)
               values (tests.fx('B'), d, 50, 'dispatched') returning id),
       i as (insert into public.order_items (order_id, listing_id, quantity, unit_price)
               select o.id, tests.fx('LD1'), 1, 50 from o returning id, order_id),
       e as (insert into public.order_events (order_id, order_item_id, seller_id, listing_id, quantity, type)
               select i.order_id, i.id, d, tests.fx('LD1'), 1, 'dispatched' from i returning id, order_id, order_item_id)
  insert into public.inventory_sync_log (dealer_id, order_event_id, order_id, order_item_id, listing_id, status, error)
    select d, e.id, e.order_id, e.order_item_id, tests.fx('LD1'), 'failed', 'pgTAP' from e
  on conflict (order_event_id) do nothing;
  insert into tests.fixtures values ('PUR1', pur);
  insert into storage.objects (bucket_id, name, owner, metadata)
    values ('inventory-exports', d || '/stock.csv', d, '{"mimetype": "text/csv", "size": 10}');
end $$;

create function tests.inv_reads(_uid uuid, _aal text) returns text language sql as $$
  select string_agg(t || '=' || tests.probe(_uid, format('select 1 from public.%I where dealer_id = %L', t, tests.fx('D')), _aal), ' ' order by t)
    from unnest(array['inventory_alert_settings', 'inventory_locations', 'inventory_movements', 'inventory_products',
                      'inventory_purchase_items', 'inventory_purchases', 'inventory_stock', 'inventory_suppliers',
                      'inventory_sync_log']) t
$$;

select is(tests.inv_reads(tests.fx('D'), 'aal1'),
  'inventory_alert_settings=rows:1 inventory_locations=rows:1 inventory_movements=rows:1 inventory_products=rows:1 inventory_purchase_items=rows:1 inventory_purchases=rows:1 inventory_stock=rows:1 inventory_suppliers=rows:1 inventory_sync_log=rows:1',
  'inventory: the owning dealer reads a row in each of the nine tables (the fixtures are real)');
select is(tests.inv_reads(tests.fx('A'), 'aal1'),
  'inventory_alert_settings=rows:0 inventory_locations=rows:0 inventory_movements=rows:0 inventory_products=rows:0 inventory_purchase_items=rows:0 inventory_purchases=rows:0 inventory_stock=rows:0 inventory_suppliers=rows:0 inventory_sync_log=rows:0',
  'inventory: the admin at aal1 reads none of them');
select is(tests.inv_reads(tests.fx('A'), 'aal2'),
  'inventory_alert_settings=rows:0 inventory_locations=rows:0 inventory_movements=rows:0 inventory_products=rows:0 inventory_purchase_items=rows:0 inventory_purchases=rows:0 inventory_stock=rows:0 inventory_suppliers=rows:0 inventory_sync_log=rows:0',
  'inventory: nor at aal2');
select is(tests.inv_reads(tests.fx('D2'), 'aal1'),
  'inventory_alert_settings=rows:0 inventory_locations=rows:0 inventory_movements=rows:0 inventory_products=rows:0 inventory_purchase_items=rows:0 inventory_purchases=rows:0 inventory_stock=rows:0 inventory_suppliers=rows:0 inventory_sync_log=rows:0',
  'inventory: nor another dealer (the second user of the proof)');

create function tests.inv_writes(_uid uuid, _aal text) returns text language sql as $$
  select concat_ws(' ',
    tests.probe(_uid, format($q$update public.inventory_products set name = 'admin' where dealer_id = %L$q$, tests.fx('D')), _aal),
    tests.probe(_uid, format($q$update public.inventory_locations set name = 'admin' where dealer_id = %L$q$, tests.fx('D')), _aal),
    tests.probe(_uid, format($q$update public.inventory_suppliers set name = 'admin' where dealer_id = %L$q$, tests.fx('D')), _aal),
    tests.probe(_uid, format($q$update public.inventory_purchases set notes = 'admin' where dealer_id = %L$q$, tests.fx('D')), _aal),
    tests.probe(_uid, format($q$update public.inventory_alert_settings set dealer_id = dealer_id where dealer_id = %L$q$, tests.fx('D')), _aal),
    tests.probe(_uid, format('delete from public.inventory_products where dealer_id = %L', tests.fx('D')), _aal),
    tests.probe(_uid, format('delete from public.inventory_suppliers where dealer_id = %L', tests.fx('D')), _aal),
    tests.probe(_uid, format('delete from public.inventory_purchases where dealer_id = %L', tests.fx('D')), _aal),
    tests.probe(_uid, format('delete from public.inventory_alert_settings where dealer_id = %L', tests.fx('D')), _aal),
    tests.probe(_uid, format($q$insert into public.inventory_products (dealer_id, sku, name) values (%L, 'ADM-1', 'admin')$q$, tests.fx('D')), _aal),
    tests.probe(_uid, format($q$insert into public.inventory_suppliers (dealer_id, name) values (%L, 'admin')$q$, tests.fx('D')), _aal),
    tests.probe(_uid, format($q$insert into public.inventory_locations (dealer_id, name) values (%L, 'admin')$q$, tests.fx('D')), _aal),
    tests.probe(_uid, format('update public.inventory_stock set quantity = 0 where dealer_id = %L', tests.fx('D')), _aal),
    tests.probe(_uid, format('delete from public.inventory_movements where dealer_id = %L', tests.fx('D')), _aal),
    tests.probe(_uid, format($q$update public.inventory_sync_log set status = 'applied' where dealer_id = %L$q$, tests.fx('D')), _aal),
    tests.probe(_uid, format('delete from public.inventory_sync_log where dealer_id = %L', tests.fx('D')), _aal))
$$;

select is(tests.inv_writes(tests.fx('A'), 'aal1'),
  'n:0 n:0 n:0 n:0 n:0 n:0 n:0 n:0 n:0 err:42501 err:42501 err:42501 err:42501 err:42501 err:42501 err:42501',
  'inventory: the admin at aal1 changes, deletes and creates nothing in a dealer''s inventory');
select is(tests.inv_writes(tests.fx('A'), 'aal2'),
  'n:0 n:0 n:0 n:0 n:0 n:0 n:0 n:0 n:0 err:42501 err:42501 err:42501 err:42501 err:42501 err:42501 err:42501',
  'inventory: nor at aal2');

-- The inventory functions, as the admin: each refuses (inventory_caller), and the reconciliation shows no dealer's rows.
create function tests.inv_calls(_uid uuid, _aal text) returns text language sql as $$
  select concat_ws(' ',
    tests.probe(_uid, format($q$select public.record_movement(%L, %L, 'in', 'RESTOCK', 1, null)$q$, tests.fx('INV1'), tests.fx('DS1')), _aal),
    tests.probe(_uid, format($q$select public.transfer_stock(%L, %L, %L, 1, null)$q$, tests.fx('INV1'), tests.fx('DS1'), tests.fx('DS1')), _aal),
    tests.probe(_uid, format('select public.set_default_location(%L)', tests.fx('DS1')), _aal),
    tests.probe(_uid, format($q$select public.create_purchase(%L, current_date, null, null, '[]'::jsonb)$q$, tests.fx('SUP1')), _aal),
    tests.probe(_uid, format('select public.receive_purchase(%L)', tests.fx('PUR1')), _aal),
    tests.probe(_uid, format($q$select public.replace_purchase_items(%L, '[]'::jsonb, '{}'::jsonb)$q$, tests.fx('PUR1')), _aal),
    tests.probe(_uid, 'select public.retry_dispatch_events()', _aal),
    tests.probe(_uid, format($q$select public.inventory_apply_movement(%L, %L, %L, 'in', 'RESTOCK', 1, null, %L)$q$,
      tests.fx('D'), tests.fx('INV1'), tests.fx('DS1'), _uid), _aal),
    -- In FROM: the probe counts rows, and a stable function left in an unused select list is planned away unexecuted.
    tests.probe(_uid, format('select * from public.inventory_sellable(%L, %L, null)', tests.fx('INV1'), tests.fx('D')), _aal),
    tests.probe(_uid, 'select * from public.inventory_reconciliation()', _aal))
$$;

select is(tests.inv_calls(tests.fx('A'), 'aal1'),
  'err:42501 err:42501 err:42501 err:42501 err:42501 err:42501 err:42501 err:42501 err:42501 rows:0',
  'inventory: the admin at aal1 calls no inventory function and the reconciliation shows no dealer''s products');
select is(tests.inv_calls(tests.fx('A'), 'aal2'),
  'err:42501 err:42501 err:42501 err:42501 err:42501 err:42501 err:42501 err:42501 err:42501 rows:0',
  'inventory: nor at aal2');
select tests.expect(tests.fx('D'), 'select * from public.inventory_reconciliation()', 'rows:1',
  'inventory: the owning dealer''s reconciliation shows their product (the probe is not empty by accident)');

-- The inventory exports bucket: the dealer's file is theirs alone.
select tests.expect(tests.fx('D'), $$select 1 from storage.objects where bucket_id = 'inventory-exports'$$, 'rows:1', 'inventory exports: the dealer reads their file');
select tests.expect(tests.fx('A'), $$select 1 from storage.objects where bucket_id = 'inventory-exports'$$, 'rows:0', 'inventory exports: the admin at aal1 does not');
select tests.expect(tests.fx('A'), $$select 1 from storage.objects where bucket_id = 'inventory-exports'$$, 'rows:0', 'inventory exports: nor at aal2', 'aal2');

-- ---------------------------------------------------------------------------------------------------------------------
-- 8. Every admin write needs a second factor (section 6 of the migration)
-- ---------------------------------------------------------------------------------------------------------------------

-- The sweep, kept: no write policy anywhere admits a plain is_admin(); reads may.
select is(
  (select array_agg(schemaname || '.' || tablename || '.' || policyname order by 1) from pg_policies
    where cmd <> 'SELECT' and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'is_admin\(\)'),
  null, 'aal2: no insert, update or delete policy admits an admin without a second factor');

-- The farm and expert tables lost their admin branch (section 6): the admin cannot write them at aal1 or aal2, while
-- the owner still can (categories, crops and the audit log are in 02_policies_identity_and_marketplace).
-- Farmer F owns FARM1, FC1 and a farmer_profiles row; expert E has one specialisation; F2 is the other farmer.
select tests.expect(tests.fx('F'), $$update public.farms set name = 'Renamed by F' where id = $$ || tests.l('FARM1'), 'n:1', 'farms: the owner edits their farm');
select tests.expect(tests.fx('F'), 'insert into public.farm_crops (farm_id) values (' || tests.l('FARM1') || ')', 'n:1', 'farm_crops: the owner adds a crop');
select tests.expect(tests.fx('F'), 'update public.farmer_profiles set id = id where id = ' || tests.l('F'), 'n:1', 'farmer_profiles: the owner edits theirs');
select tests.expect(tests.fx('E'), 'update public.expert_specializations set specialization = specialization where expert_id = ' || tests.l('E'), 'n:1', 'expert_specializations: the expert edits theirs');
select tests.expect(tests.fx('A'), $$update public.farms set name = 'By admin' where id = $$ || tests.l('FARM1'), 'n:0', 'farms: an admin without a second factor cannot edit a farm');
select tests.expect(tests.fx('F2'), $$update public.farms set name = 'By F2' where id = $$ || tests.l('FARM1'), 'n:0', 'farms: nor another farmer');
select tests.expect(tests.fx('A'), $$update public.farms set name = 'By admin' where id = $$ || tests.l('FARM1'), 'n:0', 'farms: nor with a second factor (no admin write path)', 'aal2');
select tests.expect(tests.fx('A'), 'insert into public.farms (owner_id, name) values (' || tests.l('F') || $$, 'Admin farm')$$, 'err:42501', 'farms: an admin without a second factor cannot add one');
select tests.expect(tests.fx('A'), 'insert into public.farms (owner_id, name) values (' || tests.l('F') || $$, 'Admin farm')$$, 'err:42501', 'farms: nor with a second factor (no admin write path)', 'aal2');
select tests.expect(tests.fx('A'), $$delete from public.farms where name = 'Admin farm'$$, 'n:0', 'farms: an admin without a second factor cannot delete one');
select tests.expect(tests.fx('A'), $$delete from public.farms where name = 'Admin farm'$$, 'n:0', 'farms: nor with a second factor (no admin write path)', 'aal2');
select tests.expect(tests.fx('A'), 'update public.farm_crops set farm_id = farm_id where id = ' || tests.l('FC1'), 'n:0', 'farm_crops: an admin without a second factor cannot edit one');
select tests.expect(tests.fx('A'), 'update public.farm_crops set farm_id = farm_id where id = ' || tests.l('FC1'), 'n:0', 'farm_crops: nor with a second factor (no admin write path)', 'aal2');
select tests.expect(tests.fx('A'), 'insert into public.farm_crops (farm_id) values (' || tests.l('FARM1') || ')', 'err:42501', 'farm_crops: an admin without a second factor cannot add one');
select tests.expect(tests.fx('A'), 'insert into public.farm_crops (farm_id) values (' || tests.l('FARM1') || ')', 'err:42501', 'farm_crops: nor with a second factor (no admin write path)', 'aal2');
select tests.expect(tests.fx('A'), 'delete from public.farm_crops where id = ' || tests.l('FC1'), 'n:0', 'farm_crops: an admin without a second factor cannot delete one');
select tests.expect(tests.fx('A'), 'delete from public.farm_crops where id = ' || tests.l('FC1'), 'n:0', 'farm_crops: nor with a second factor (no admin write path)', 'aal2');
select tests.expect(tests.fx('A'), 'update public.farmer_profiles set id = id where id = ' || tests.l('F'), 'n:0', 'farmer_profiles: an admin without a second factor cannot edit one');
select tests.expect(tests.fx('A'), 'update public.farmer_profiles set id = id where id = ' || tests.l('F'), 'n:0', 'farmer_profiles: nor with a second factor (no admin write path)', 'aal2');
select tests.expect(tests.fx('A'), 'insert into public.farmer_profiles (id) values (' || tests.l('F2') || ')', 'err:42501', 'farmer_profiles: an admin without a second factor cannot add one');
select tests.expect(tests.fx('A'), 'insert into public.farmer_profiles (id) values (' || tests.l('F2') || ')', 'err:42501', 'farmer_profiles: nor with a second factor (no admin write path)', 'aal2');
select tests.expect(tests.fx('A'), 'update public.expert_specializations set specialization = specialization where expert_id = ' || tests.l('E'), 'n:0', 'expert_specializations: an admin without a second factor cannot edit one');
select tests.expect(tests.fx('A'), 'update public.expert_specializations set specialization = specialization where expert_id = ' || tests.l('E'), 'n:0', 'expert_specializations: nor with a second factor (no admin write path)', 'aal2');
select tests.expect(tests.fx('A'), 'insert into public.expert_specializations (expert_id, specialization) values (' || tests.l('E') || $$, 'soil_management')$$, 'err:42501', 'expert_specializations: an admin without a second factor cannot add one');
select tests.expect(tests.fx('A'), 'insert into public.expert_specializations (expert_id, specialization) values (' || tests.l('E') || $$, 'soil_management')$$, 'err:42501', 'expert_specializations: nor with a second factor (no admin write path)', 'aal2');
select tests.expect(tests.fx('A'), $$delete from public.expert_specializations where specialization = 'soil_management' and expert_id = $$ || tests.l('E'), 'n:0', 'expert_specializations: an admin without a second factor cannot delete one');
select tests.expect(tests.fx('A'), $$delete from public.expert_specializations where specialization = 'soil_management' and expert_id = $$ || tests.l('E'), 'n:0', 'expert_specializations: nor with a second factor (no admin write path)', 'aal2');
select tests.expect(tests.fx('A'), $$update public.consultations set status = 'closed', moderation_reason = 'Stale' where id = $$ || tests.l('CA_CLOSED'), 'n:0', 'consultations: an admin without a second factor does not reach one');

-- ---------------------------------------------------------------------------------------------------------------------
-- 9. What an admin's direct write may change (migration section 8; A7 re-verification G1-G4)
-- ---------------------------------------------------------------------------------------------------------------------

do $$
declare m uuid;
begin
  insert into public.messages (conversation_id, sender_id, body) values (tests.fx('C1'), tests.fx('B'), 'Price is fine') returning id into m;
  insert into tests.fixtures values ('M_G', m);
end $$;

-- G1: a redaction is the marker, nothing else.
select tests.expect(tests.fx('A'), $$update public.messages set body = 'I agree to pay Rs 50000 extra in cash' where id = $$ || tests.l('M_G'),
  'err:42501', 'G1: an admin cannot put other words in a buyer''s message', 'aal2');
select is((select body from public.messages where id = tests.fx('M_G')), 'Price is fine', 'G1: the message is unchanged');
select tests.expect(tests.fx('F'), $$update public.messages set body = 'edited' where id = $$ || tests.l('M_G'),
  'err:P0001', 'G1: a participant cannot edit a body at all (the second user of the proof)');
select tests.audit_mark();
select tests.expect(tests.fx('A'), $$update public.messages set body = '[removed by moderator]' where id = $$ || tests.l('M_G'),
  'n:1', 'G1: the admin redacts it with the marker', 'aal2');
select is(tests.audit_new('M_G'), 'message_redacted messages - A T', 'G1: one message_redacted row');
-- G4: the same marker again changes nothing and writes no row.
select tests.audit_mark();
select tests.expect(tests.fx('A'), $$update public.messages set body = '[removed by moderator]' where id = $$ || tests.l('M_G'),
  'n:1', 'G4: a re-redaction runs', 'aal2');
select is(tests.audit_new(), '', 'G4: but writes no audit row');

-- G2: on a conversation the admin is not part of, nothing but the body moves.
select tests.expect(tests.fx('A'), 'update public.messages set read_at = now() where id = ' || tests.l('M_G'),
  'err:42501', 'G2: an admin cannot mark another user''s message read', 'aal2');
select tests.expect(tests.fx('A'), $$update public.messages set body = '[removed by moderator]', read_at = now() where id = $$ || tests.l('M_G'),
  'err:42501', 'G2: not even together with a redaction', 'aal2');
select tests.expect(tests.fx('F'), 'update public.messages set read_at = now() where id = ' || tests.l('M_G'),
  'n:1', 'G2: the recipient still marks it read');

-- G3: no admin changes their own role or suspension; another admin does.
do $$
declare a3 uuid := tests.make_user('A3', 'buyer');
begin
  alter table public.profiles disable trigger guard_profiles_role;
  update public.profiles set role = 'admin' where id = a3;
  alter table public.profiles enable trigger guard_profiles_role;
end $$;
select tests.expect(tests.fx('A'), $$update public.profiles set role = 'buyer' where id = $$ || tests.l('A'),
  'err:42501', 'G3: an admin cannot change their own role', 'aal2');
select tests.expect(tests.fx('A'), 'update public.profiles set is_suspended = true where id = ' || tests.l('A'),
  'err:42501', 'G3: nor suspend themselves', 'aal2');
select tests.expect(tests.fx('B'), 'update public.profiles set is_suspended = true where id = ' || tests.l('B'),
  'err:42501', 'G3: a user cannot suspend themselves either');
select tests.expect(tests.fx('B'), $$update public.profiles set role = 'admin' where id = $$ || tests.l('B'),
  'err:P0001', 'G3: a user''s own role change is still refused by the role guard');
select tests.audit_mark();
select tests.expect(tests.fx('A'), 'update public.profiles set is_suspended = true where id = ' || tests.l('A3'),
  'n:1', 'G3: another admin suspends A3', 'aal2');
select is(tests.audit_new('A3'), 'user_suspended profiles - A T', 'G3: and that is audited');

-- G4: no row when nothing the action is about changed.
select tests.audit_mark();
select tests.expect(tests.fx('A'), 'update public.profiles set is_suspended = true where id = ' || tests.l('A3'), 'n:1', 'G4: suspending a suspended user runs', 'aal2');
select tests.expect(tests.fx('A'), $$update public.profiles set role = 'farmer' where id = $$ || tests.l('B2'), 'n:1', 'G4: setting the role B2 already has runs', 'aal2');
select tests.expect(tests.fx('A'), 'update public.reviews set hidden_at = null where id = ' || tests.l('REV1'), 'n:1', 'G4: restoring a visible review runs', 'aal2');
select tests.expect(tests.fx('A'), $$update public.listings set status = 'active' where id = $$ || tests.l('L1'), 'n:1', 'G4: setting the status a listing has runs', 'aal2');
select tests.expect(tests.fx('A'), $$update public.categories set name = name where slug is not null and id = (select min(id::text)::uuid from public.categories)$$, 'n:1', 'G4: an unchanged category update runs', 'aal2');
select is(tests.audit_new(), '', 'G4: none of those no-ops writes an audit row');

-- G4: the resolver is the admin who resolved the report, whatever the client sent.
do $$
declare r uuid;
begin
  insert into public.reports (reporter_id, target_type, target_id, reason) values (tests.fx('B'), 'user', tests.fx('F'), 'spam') returning id into r;
  insert into tests.fixtures values ('REP_G', r);
end $$;
select tests.expect(tests.fx('A'), 'update public.reports set status = ''resolved'', resolved_by = ' || tests.l('A3') || $$, resolved_at = '2020-01-01' where id = $$ || tests.l('REP_G'),
  'n:1', 'G4: the admin resolves a report naming another admin as resolver', 'aal2');
select is((select row(resolved_by = tests.fx('A'), resolved_at > now() - interval '1 minute')::text from public.reports where id = tests.fx('REP_G')),
  '(t,t)', 'G4: the resolver is the acting admin and the time is now');
select tests.expect(tests.fx('A'), $$update public.reports set status = 'investigating' where id = $$ || tests.l('REP_G'), 'n:1', 'G4: moved back to investigating', 'aal2');
select is((select row(resolved_by, resolved_at)::text from public.reports where id = tests.fx('REP_G')), '(,)', 'G4: an open report carries no resolver');

select ok(
  (select bool_and(not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('guard_messages_updates', 'guard_reports_admin_update', 'guard_profiles_admin_update')),
  'G1-G4: the guards are not callable by a client');

select * from finish();
rollback;
