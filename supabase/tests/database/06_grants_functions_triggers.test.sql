-- P6 (items 3, 4): grants, function privileges, trigger behaviour and the last update-policy edge cases.
--
-- Added after the independent verification showed the policy suite left these unprotected: an extra column on
-- profiles_public, a widened anon grant, EXECUTE on trigger functions, the payment and message guard triggers, and
-- update policies whose WITH CHECK could be replaced by `true` unnoticed. The two allow-lists below are snapshots of
-- the reviewed state: changing a grant or a function's privileges fails here until the list is edited on purpose.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();
select tests.world();
select tests.suspended_world();

-- table grants: anything a client role can do to a table, exactly ---------------------------------------
select is(
  (select array_agg(g order by g) from (
     select a.grantee::regrole::text || ' ' || c.relname || ' ' || string_agg(a.privilege_type, ',' order by a.privilege_type) as g
     from pg_class c cross join lateral aclexplode(c.relacl) a
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
       and a.grantee::regrole::text in ('anon', 'authenticated', 'service_role')
     group by a.grantee, c.relname) x),
  array[
    'anon categories SELECT',
    'anon crops SELECT',
    'anon currencies SELECT',
    'anon expert_specializations SELECT',
    'anon experts SELECT',
    'anon listings SELECT',
    'anon profiles SELECT',
    'anon profiles_public SELECT',
    'anon reviews SELECT',
    'anon units SELECT',
    -- Read-only event-name catalogue for the audit log screen (20261023080000).
    'authenticated audit_event_names SELECT',
    -- No INSERT since 20261023080000: the database's definer triggers write the log, no client does.
    'authenticated audit_logs SELECT',
    'authenticated categories DELETE,INSERT,SELECT,UPDATE',
    -- The expert's assessment of an AI case (20261022080000, BR-13).
    'authenticated consultation_assessments INSERT,SELECT',
    'authenticated consultation_messages INSERT,SELECT',
    'authenticated consultations INSERT,SELECT,UPDATE',
    'authenticated conversations INSERT,SELECT',
    'authenticated crops DELETE,INSERT,SELECT,UPDATE',
    'authenticated currencies DELETE,INSERT,SELECT,UPDATE',
    'authenticated dealer_documents DELETE,INSERT,SELECT',
    'authenticated dealer_profiles INSERT,SELECT,UPDATE',
    'authenticated disease_cases INSERT,SELECT',
    -- Admin-curated disease advice: an aal2 admin edits the 38 seeded classes, nobody adds or removes one (20261022080000).
    'authenticated disease_knowledge SELECT,UPDATE',
    'authenticated disease_predictions SELECT',
    'authenticated expert_documents DELETE,INSERT,SELECT',
    'authenticated expert_specializations DELETE,INSERT,SELECT,UPDATE',
    -- No INSERT since 20261012080000: submit_application() writes the submission record.
    'authenticated expert_verifications SELECT',
    'authenticated experts INSERT,SELECT,UPDATE',
    'authenticated farm_crops DELETE,INSERT,SELECT,UPDATE',
    'authenticated farmer_profiles INSERT,SELECT,UPDATE',
    'authenticated farms DELETE,INSERT,SELECT,UPDATE',
    'authenticated idempotency_keys DELETE,INSERT,SELECT,UPDATE',
    -- The dealer IMS (20261021080000, B1); the legacy dealer_stores, suppliers, inventory and inventory_transactions
    -- were dropped by 20261022090000 (B3). Stock, the ledger and the sync log are read-only: only the definer functions
    -- write them.
    'authenticated inventory_alert_settings DELETE,INSERT,SELECT,UPDATE',
    'authenticated inventory_locations DELETE,INSERT,SELECT,UPDATE',
    'authenticated inventory_movements SELECT',
    'authenticated inventory_products DELETE,INSERT,SELECT,UPDATE',
    -- Lines and new purchases only through create_purchase / replace_purchase_items (20261025090000, B2 verifier F1/F2);
    -- the header keeps UPDATE (header-only edits, cancel) and DELETE (a draft).
    'authenticated inventory_purchase_items SELECT',
    'authenticated inventory_purchases DELETE,SELECT,UPDATE',
    'authenticated inventory_stock SELECT',
    'authenticated inventory_suppliers DELETE,INSERT,SELECT,UPDATE',
    'authenticated inventory_sync_log SELECT',
    'authenticated listing_views INSERT,SELECT',
    'authenticated listings DELETE,INSERT,SELECT,UPDATE',
    'authenticated messages INSERT,SELECT',
    'authenticated notifications SELECT,UPDATE',
    'authenticated order_items INSERT,SELECT',
    'authenticated order_status_history SELECT',
    'authenticated orders INSERT,SELECT,UPDATE',
    'authenticated payment_transactions SELECT',
    'authenticated payments INSERT,SELECT,UPDATE',
    'authenticated profiles INSERT,SELECT,UPDATE',
    'authenticated profiles_public SELECT',
    'authenticated reports INSERT,SELECT,UPDATE',
    'authenticated required_documents INSERT,SELECT,UPDATE',
    -- Since 20261023080000: no DELETE (a review is hidden by moderation, never deleted), and INSERT and UPDATE are
    -- column grants (the author's own columns; the moderation columns), so they are not in the table's ACL.
    'authenticated reviews SELECT',
    'authenticated units DELETE,INSERT,SELECT,UPDATE',
    'service_role audit_event_names SELECT',
    'service_role audit_logs INSERT,SELECT',
    'service_role consultation_assessments INSERT,SELECT',
    'service_role crops SELECT',
    'service_role disease_cases INSERT,SELECT',
    'service_role disease_knowledge SELECT',
    'service_role disease_predictions INSERT,SELECT',
    'service_role inventory_alert_settings SELECT',
    'service_role inventory_locations SELECT',
    'service_role inventory_movements SELECT',
    'service_role inventory_products SELECT',
    'service_role inventory_purchase_items SELECT',
    'service_role inventory_purchases SELECT',
    'service_role inventory_stock SELECT',
    'service_role inventory_suppliers SELECT',
    'service_role inventory_sync_log SELECT',
    'service_role order_events SELECT'
  ],
  'table grants to anon, authenticated and service_role match the reviewed allow-list');

-- function privileges: who can call what ----------------------------------------------------------------
select is(
  (select array_agg('anon ' || p.oid::regprocedure::text order by p.oid::regprocedure::text) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  array[
    'anon guard_experts_verification_status()',
    'anon guard_profiles_role()',
    'anon is_admin_aal2()',
    'anon is_admin()',
    'anon is_approved_expert_id(uuid)',
    'anon is_suspended()',
    'anon listing_availability(uuid[])',
    'anon set_listings_seller_role()',
    'anon set_updated_at()'
  ],
  'the functions anon can execute are exactly the policy helpers, the trigger functions that cannot be called directly, and listing availability (a word per public listing, 20261019080000)');

select is(
  (select array_agg('authenticated ' || p.oid::regprocedure::text order by p.oid::regprocedure::text) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')),
  array[
    -- The admin dashboard's queue counts; refuses a non-admin inside (20261023080000).
    'authenticated admin_queue_counts()',
    -- available_stock is service_role only since 20261022090000 (B3 verifier F3: exact IMS stock stays server side).
    'authenticated caller_role()',
    -- Policy helper for conversation contexts (20261020080000).
    'authenticated conversation_context_allowed(conversation_context,uuid,uuid)',
    -- Atomic purchase writes and the default-location move (20261025090000, B2 verifier F1/F2/F7); each checks
    -- inventory_caller() inside. Their internal helper inventory_write_purchase_lines and the two location triggers'
    -- functions are revoked.
    'authenticated create_purchase(uuid,date,text,text,jsonb)',
    'authenticated decide_account_status(uuid,account_status,text)',
    -- IMS client functions (20261021080000, B1; retry 20261022090000, B3). Each checks inventory_caller() inside. The
    -- internal ones (inventory_apply_movement, inventory_caller, apply_dispatch_event, retry_dispatch_events_for,
    -- guard_inventory_references) are revoked, and the legacy adjust_stock was dropped by B3.
    'authenticated inventory_reconciliation()',
    'authenticated is_account_approved()',
    'authenticated is_application_editable()',
    'authenticated is_approved_dealer()',
    'authenticated is_approved_expert()',
    -- Policy helper for AI case access (20261022080000).
    'authenticated is_case_expert(uuid)',
    'authenticated is_seller_role(uuid)',
    'authenticated lock_editable_application(uuid)',
    'authenticated receive_purchase(uuid)',
    'authenticated record_movement(uuid,uuid,inventory_movement_direction,inventory_movement_source,numeric,text)',
    'authenticated replace_purchase_items(uuid,jsonb,jsonb)',
    'authenticated retry_dispatch_events()',
    'authenticated set_default_location(uuid)',
    'authenticated submit_application()',
    'authenticated transfer_stock(uuid,uuid,uuid,numeric,text)'
  ],
  'the extra functions signed-in users can execute: the IMS client functions (B1/B3), is_seller_role, and the account-status helpers and decisions (20261005080000), the application helper and submission (20261012080000)');

-- profiles_public: exactly id, name, avatar ------------------------------------------------------------
select is(
  (select array_agg(attname::text order by attnum) from pg_attribute
    where attrelid = 'public.profiles_public'::regclass and attnum > 0 and not attisdropped),
  array['id', 'full_name', 'avatar_url'],
  'profiles_public exposes only id, full_name and avatar_url (never phone or location)');
select tests.expect(null, 'select id, full_name, avatar_url from public.profiles_public where id = ' || tests.l('B'), 'rows:1', 'profiles_public: anon reads the three public columns');

-- profiles: a stranger of every role reads nothing -----------------------------------------------------
select tests.expect(tests.fx('F2'), 'select id from public.profiles where id = ' || tests.l('B'), 'rows:0', 'profiles: another farmer cannot read a buyer');
select tests.expect(tests.fx('D'), 'select id from public.profiles where id = ' || tests.l('B'), 'rows:0', 'profiles: a dealer cannot');
select tests.expect(tests.fx('E'), 'select id from public.profiles where id = ' || tests.l('B'), 'rows:0', 'profiles: an expert cannot');
select tests.expect(tests.fx('B2'), 'select id from public.profiles where id = ' || tests.l('F'), 'rows:0', 'profiles: a buyer cannot read a farmer');
select tests.expect(tests.fx('B2'), 'select id from public.profiles where id = ' || tests.l('E'), 'rows:0', 'profiles: a buyer cannot read an expert either (no role is more public than another)');
select tests.expect(tests.fx('B2'), 'select id from public.profiles where id = ' || tests.l('D'), 'rows:0', 'profiles: nor a dealer');
select tests.expect(tests.fx('F2'), 'select id from public.profiles where id = ' || tests.l('A'), 'rows:0', 'profiles: nor an admin');

-- Why there is no separate WITH CHECK case for notifications, consultations and payments updates: Postgres also
-- applies the table's SELECT policy to the new row of an UPDATE, and those select policies already require the
-- caller to own or take part in the row, so the update cases below are refused by the select policy even if the
-- update policy's own WITH CHECK were `true`. Replacing that WITH CHECK is therefore not observable behaviour.

-- update policies: the new row must still belong to the caller (WITH CHECK) -------------------------------
select tests.expect(tests.fx('B'), 'update public.notifications set user_id = ' || tests.l('B2') || ' where id = ' || tests.l('N1'), 'err:42501', 'notifications: cannot hand a notification to someone else');
select tests.expect(tests.fx('B'), 'update public.consultations set user_id = ' || tests.l('B2') || ' where id = ' || tests.l('CONS1'), 'err:42501', 'consultations: cannot reassign the requester');
select tests.expect(tests.fx('SF'), 'select id from public.messages where id = ' || tests.l('SM'), 'rows:1', 'messages: a suspended participant still reads their messages');
select tests.expect(tests.fx('SF'), 'update public.messages set read_at = now() where id = ' || tests.l('SM'), 'n:0', 'messages: but cannot mark them read');

-- guard triggers -----------------------------------------------------------------------------------------
select tests.expect(tests.fx('F'), 'update public.payments set amount = 1 where id = ' || tests.l('PAY1'), 'err:42501', 'guard_payments_update: a seller cannot change the amount');
select tests.expect(tests.fx('F'), 'update public.payments set order_id = ' || tests.l('O1') || ' where id = ' || tests.l('PAY1'), 'n:1', 'guard_payments_update: an unchanged column is fine');
select tests.expect(tests.fx('A'), 'update public.payments set amount = 2 where id = ' || tests.l('PAY1'), 'n:0', 'guard_payments_update: an admin has no payment action at all');
select tests.expect(tests.fx('F'), $$update public.messages set body = 'edited' where id = $$ || tests.l('M1'), 'err:P0001', 'guard_messages_updates: a participant cannot edit a body');
select tests.expect(tests.fx('F'), 'update public.messages set sender_id = ' || tests.l('F') || ' where id = ' || tests.l('M1'), 'err:42501', 'guard_messages_updates: nobody can change the sender (column grant)');
select tests.approval_world();
select tests.expect(tests.fx('PE0'), $$update public.experts set verification_status = 'approved' where id = $$ || tests.l('PE0'), 'err:42501', 'guard_experts_verification_status: an expert cannot approve themselves');
select tests.expect(tests.fx('A'), $$update public.experts set verification_status = 'approved' where id = $$ || tests.l('PE'), 'n:0', 'experts_update_own_or_admin: an admin without a second factor cannot decide (20260928090000)');
select tests.expect(tests.fx('A'), $$update public.experts set verification_status = 'approved' where id = $$ || tests.l('PE'), 'err:42501', 'guard_experts_verification_status: nor can an admin with a second factor, directly; decide_account_status() decides (20261005080000)', 'aal2');

-- notification triggers: the event reaches the right person --------------------------------------------------
select is((select count(*) from public.notifications where user_id = tests.fx('F') and type = 'order_new'), 1::bigint, 'notify_new_order: the seller is told of a new order');
select is((select count(*) from public.notifications where user_id = tests.fx('F') and type = 'new_message'), 1::bigint, 'notify_new_message: the recipient is told');
select is((select count(*) from public.notifications where user_id = tests.fx('E') and type = 'consultation_new'), 1::bigint, 'notify_consultation_created: the expert is told');
select is((select count(*) from public.notifications where user_id = tests.fx('S') and type = 'account_suspension_changed'), 1::bigint, 'notify_account_suspension_changed: a suspended user is told');
update public.payments set status = 'processing' where id = tests.fx('PAY1');
select is((select count(*) from public.notifications where user_id = tests.fx('B') and type = 'payment_status_changed'), 1::bigint, 'notify_payment_status_changed: the buyer is told');
update public.orders set status = 'confirmed' where id = tests.fx('O1');
select is((select count(*) from public.notifications where user_id = tests.fx('B') and type = 'order_status_changed'), 1::bigint, 'notify_order_status_changed: the buyer is told');
update public.listings set status = 'sold' where id = tests.fx('L1');
select is((select count(*) from public.notifications where user_id = tests.fx('F') and type = 'listing_status_changed'), 1::bigint, 'notify_listing_status_changed: the owner is told when someone else changes it');
select tests.expect(tests.fx('A'), 'select public.decide_account_status(' || tests.l('PE') || $$, 'approved')$$, 'rows:1', 'decide_account_status: an admin with a second factor approves the expert', 'aal2');
select is((select count(*) from public.notifications where user_id = tests.fx('PE') and type = 'account_status_changed'), 1::bigint, 'notify_account_status_changed: the applicant is told of the decision');
select is((select count(*) from public.notifications where user_id = tests.fx('PE') and type = 'expert_verification_changed'), 0::bigint, 'notify_expert_verification_changed: no second notification for the same decision');

select * from finish();
rollback;
