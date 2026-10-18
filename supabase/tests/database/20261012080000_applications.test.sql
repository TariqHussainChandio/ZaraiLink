-- Pair for migration 20261012080000_applications.sql (A3b; SRDS §4–§13, §45, §53 rules 4–9). An applicant fills in
-- their details and documents while the application is a draft (or after a rejection), submit_application() puts a
-- complete one in the queue and freezes it, and only then can an admin decide it. Every refused path sits next to the
-- allowed one: the draft dealer PD0 against the dealer under review PD and another dealer D2, a buyer, an expert.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();

select tests.world();
select tests.approval_world();
-- Storage refuses direct deletes unless its API sets this flag; the policies are what is under test here.
select set_config('storage.allow_delete_query', 'true', true);

-- Structure ----------------------------------------------------------------------------------------------------------
select is(enum_range(null::public.dealer_business_type)::text,
  '{agri_input_retailer,wholesaler,distributor,manufacturer,other}', 'dealer_business_type: the five decided types');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proname in ('is_application_editable', 'submit_application', 'decide_account_status', 'handle_new_user',
                        'audit_admin_email_change', 'audit_required_documents')
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')),
  array['audit_admin_email_change', 'audit_required_documents', 'decide_account_status', 'handle_new_user',
        'is_application_editable', 'submit_application'],
  'every new or redefined definer function sets search_path');
select is((select count(*) from pg_proc where proname = 'resubmit_application'), 0::bigint, 'resubmit_application is gone: submit_application checks the application first');
select tests.expect(null, 'select public.submit_application()', 'err:42501', 'submit_application: anon cannot call it');
select tests.expect(null, 'select 1 where public.is_application_editable()', 'err:42501', 'is_application_editable: anon cannot call it');
select is(
  (select public::text || ' ' || file_size_limit::text || ' ' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'dealer-documents'),
  'false 10485760 application/pdf,image/jpeg,image/png,image/webp',
  'dealer-documents: a private bucket, 10 MB, PDF and images');

-- is_application_editable: draft and rejected yes; under review, approved and other roles no -------------------------
select tests.expect(tests.fx('PD0'), 'select 1 where public.is_application_editable()', 'rows:1', 'editable: a draft');
select tests.expect(tests.fx('RD'), 'select 1 where public.is_application_editable()', 'rows:1', 'editable: a rejected application');
select tests.expect(tests.fx('PD'), 'select 1 where public.is_application_editable()', 'rows:0', 'editable: not one under review');
select tests.expect(tests.fx('D'), 'select 1 where public.is_application_editable()', 'rows:0', 'editable: not an approved account');
select tests.expect(tests.fx('B'), 'select 1 where public.is_application_editable()', 'rows:0', 'editable: a buyer has no application');

-- The submission marker: only submit_application() writes it -------------------------------------------------------
select tests.expect(tests.fx('PD0'), 'update public.profiles set application_submitted_at = now() where id = ' || tests.l('PD0'), 'err:42501', 'marker: a draft cannot put itself in the queue');
select tests.expect(tests.fx('PD'), 'update public.profiles set application_submitted_at = null where id = ' || tests.l('PD'), 'err:42501', 'marker: nor can one under review unlock itself');
select tests.expect(tests.fx('A'), 'update public.profiles set application_submitted_at = null where id = ' || tests.l('PD'), 'err:42501', 'marker: nor an admin with a second factor', 'aal2');

-- required_documents: everyone signed in reads, only an admin with a second factor writes, every write audited ------
select tests.expect(tests.fx('B'), $$select id from public.required_documents where code in ('business_registration', 'business_licence', 'other', 'degree', 'experience', 'institution')$$, 'rows:7', 'required_documents: a signed-in user reads the list (the seven starting rows)');
select tests.expect(tests.fx('B'), 'select id from public.required_documents', 'rows:' || (select count(*) from public.required_documents), 'required_documents: and every other row');
select tests.expect(null, 'select id from public.required_documents', 'err:42501', 'required_documents: anon does not');
select tests.expect(tests.fx('A'), $$insert into public.required_documents (role, code, label) values ('dealer', 'tax_certificate', 'Tax certificate')$$, 'err:42501', 'required_documents: an admin without a second factor cannot add one');
select tests.expect(tests.fx('D'), $$insert into public.required_documents (role, code, label) values ('dealer', 'tax_certificate', 'Tax certificate')$$, 'err:42501', 'required_documents: a dealer cannot');
select tests.expect(tests.fx('A'), $$insert into public.required_documents (role, code, label) values ('dealer', 'tax_certificate', 'Tax certificate')$$, 'n:1', 'required_documents: an admin with a second factor adds one', 'aal2');
select tests.expect(tests.fx('D'), $$update public.required_documents set label = 'Anything' where code = 'tax_certificate'$$, 'n:0', 'required_documents: a dealer cannot edit one');
select tests.expect(tests.fx('A'), $$update public.required_documents set active = false where code = 'tax_certificate'$$, 'n:1', 'required_documents: the admin retires it', 'aal2');
select tests.expect(tests.fx('A'), $$delete from public.required_documents where code = 'tax_certificate'$$, 'err:42501', 'required_documents: nobody deletes a row (documents point at it)', 'aal2');
-- A7 (20261023080000): the event is the SRDS §51 name, required_document_changed; created or updated is the change,
-- kept in metadata.change (the same split the migration gave the older rows).
select is(
  (select array_agg(action || ':' || (metadata ->> 'change') order by created_at, metadata ->> 'change') from public.audit_logs
    where target_entity = 'required_documents' and actor_id = tests.fx('A')),
  array['required_document_changed:required_document_created', 'required_document_changed:required_document_updated'],
  'required_documents: each admin change is audited (BR-15)');
select is((select count(*) from public.audit_logs where target_entity = 'required_documents' and actor_id is null), 0::bigint, 'required_documents: the starting rows are setup, not audited admin actions');

-- dealer_profiles ----------------------------------------------------------------------------------------------------
select tests.expect(tests.fx('PD0'), 'insert into public.dealer_profiles (id, business_name, business_type, registration_number, business_address, country, province, city) values ('
  || tests.l('PD0') || $$, 'Kisan Store', 'wholesaler', 'NTN-77', '5 Grain Market', 'Pakistan', 'Punjab', 'Multan')$$, 'n:1', 'dealer_profiles: a draft dealer fills in their business');
select tests.expect(tests.fx('PD0'), 'insert into public.dealer_profiles (id, business_name, business_type, registration_number, business_address, country, province, city) values ('
  || tests.l('D2') || $$, 'Fake', 'other', 'X-1', '1 Fake Road', 'Pakistan', 'Punjab', 'Multan')$$, 'err:42501', 'dealer_profiles: not for another dealer');
select tests.expect(tests.fx('B'), 'insert into public.dealer_profiles (id, business_name, business_type, registration_number, business_address, country, province, city) values ('
  || tests.l('B') || $$, 'Buyer Biz', 'other', 'X-1', '1 Fake Road', 'Pakistan', 'Punjab', 'Multan')$$, 'err:42501', 'dealer_profiles: a buyer has no dealer application');
select tests.expect(tests.fx('PE0'), 'insert into public.dealer_profiles (id, business_name, business_type, registration_number, business_address, country, province, city) values ('
  || tests.l('PE0') || $$, 'Expert Biz', 'other', 'X-1', '1 Fake Road', 'Pakistan', 'Punjab', 'Multan')$$, 'err:42501', 'dealer_profiles: nor does an expert');
select tests.expect(tests.fx('PD'), $$update public.dealer_profiles set business_name = 'Changed' where id = $$ || tests.l('PD'), 'n:0', 'dealer_profiles: frozen while under review');
select tests.expect(tests.fx('RD'), $$update public.dealer_profiles set business_name = 'Corrected' where id = $$ || tests.l('RD'), 'n:1', 'dealer_profiles: a rejected dealer corrects theirs');
select tests.expect(tests.fx('D'), 'insert into public.dealer_profiles (id, business_name, business_type, registration_number, business_address, country, province, city) values ('
  || tests.l('D') || $$, 'Approved Inputs', 'distributor', 'REG-9', '9 Main Road', 'Pakistan', 'Sindh', 'Sukkur')$$, 'n:1', 'dealer_profiles: an approved dealer keeps their business details current');
select tests.expect(tests.fx('A'), $$update public.dealer_profiles set business_name = 'Admin edit' where id = $$ || tests.l('PD'), 'n:0', 'dealer_profiles: an admin reads but never edits an application', 'aal2');
select tests.expect(tests.fx('D2'), 'select id from public.dealer_profiles where id = ' || tests.l('PD'), 'rows:0', 'dealer_profiles: another dealer cannot read one');
select tests.expect(tests.fx('A'), 'select id from public.dealer_profiles where id = ' || tests.l('PD'), 'rows:1', 'dealer_profiles: an admin reads it to review');
select tests.expect(tests.fx('PD'), 'select id from public.dealer_profiles where id = ' || tests.l('PD'), 'rows:1', 'dealer_profiles: the dealer reads their own');

-- dealer-documents bucket ---------------------------------------------------------------------------------------------
select tests.expect(tests.fx('PD0'), $$insert into storage.objects (bucket_id, name, owner, metadata) values ('dealer-documents', $$
  || quote_literal(tests.fx('PD0') || '/licence.pdf') || ', ' || tests.l('PD0') || $$, '{"mimetype": "application/pdf", "size": 2048}')$$, 'n:1', 'dealer-documents: a draft dealer uploads into their own folder');
select tests.expect(tests.fx('PD0'), $$insert into storage.objects (bucket_id, name, owner) values ('dealer-documents', $$ || quote_literal(tests.fx('D2') || '/licence.pdf') || ', ' || tests.l('PD0') || ')', 'err:42501', 'dealer-documents: not into another dealer''s folder');
select tests.expect(tests.fx('B'), $$insert into storage.objects (bucket_id, name, owner) values ('dealer-documents', $$ || quote_literal(tests.fx('B') || '/licence.pdf') || ', ' || tests.l('B') || ')', 'err:42501', 'dealer-documents: a buyer cannot upload');
select tests.expect(tests.fx('PE0'), $$insert into storage.objects (bucket_id, name, owner) values ('dealer-documents', $$ || quote_literal(tests.fx('PE0') || '/licence.pdf') || ', ' || tests.l('PE0') || ')', 'err:42501', 'dealer-documents: nor an expert (their bucket is expert-documents)');
select tests.expect(tests.fx('PD'), $$insert into storage.objects (bucket_id, name, owner) values ('dealer-documents', $$ || quote_literal(tests.fx('PD') || '/late.pdf') || ', ' || tests.l('PD') || ')', 'err:42501', 'dealer-documents: nothing is added while under review');
select tests.expect(tests.fx('D2'), $$select id from storage.objects where bucket_id = 'dealer-documents' and owner = $$ || tests.l('PD0'), 'rows:0', 'dealer-documents: another dealer cannot read the file');
select tests.expect(tests.fx('A'), $$select id from storage.objects where bucket_id = 'dealer-documents' and owner = $$ || tests.l('PD0'), 'rows:1', 'dealer-documents: an admin reads it to review');

-- dealer_documents: the row names the caller's own uploaded file; size and type come from Storage ---------------------
select tests.expect(tests.fx('PD0'), 'insert into public.dealer_documents (dealer_id, required_document_id, storage_path, file_name, mime_type, size_bytes) select '
  || tests.l('PD0') || ', id, ' || quote_literal(tests.fx('PD0') || '/licence.pdf') || $$, 'licence.pdf', 'text/plain', 1 from public.required_documents where role = 'dealer' and code = 'business_licence'$$,
  'n:1', 'dealer_documents: a draft dealer registers their uploaded file');
select is(
  (select mime_type || ' ' || size_bytes from public.dealer_documents where storage_path = tests.fx('PD0') || '/licence.pdf'),
  'application/pdf 2048', 'dealer_documents: the type and size are Storage''s, not what the client claimed');
select tests.expect(tests.fx('PD0'), 'insert into public.dealer_documents (dealer_id, storage_path, file_name) values (' || tests.l('PD0') || ', ' || quote_literal(tests.fx('PD0') || '/missing.pdf') || $$, 'missing.pdf')$$, 'err:22023', 'dealer_documents: not a file that was never uploaded');
select tests.expect(tests.fx('PD0'), 'insert into public.dealer_documents (dealer_id, storage_path, file_name) values (' || tests.l('PD0') || ', ' || quote_literal(tests.fx('PD') || '/business_licence.pdf') || $$, 'theirs.pdf')$$, 'err:22023', 'dealer_documents: not a path in another dealer''s folder');
select tests.expect(tests.fx('D2'), 'insert into public.dealer_documents (dealer_id, storage_path, file_name) values (' || tests.l('PD0') || ', ' || quote_literal(tests.fx('PD0') || '/licence.pdf') || $$, 'x.pdf')$$, 'err:42501', 'dealer_documents: nor in another dealer''s name');
select tests.expect(tests.fx('PD'), 'delete from public.dealer_documents where dealer_id = ' || tests.l('PD'), 'n:0', 'dealer_documents: none removed while under review');
select tests.expect(tests.fx('D2'), 'select id from public.dealer_documents where dealer_id = ' || tests.l('PD'), 'rows:0', 'dealer_documents: another dealer cannot read the list');
select tests.expect(tests.fx('A'), 'select id from public.dealer_documents where dealer_id = ' || tests.l('PD'), 'rows:2', 'dealer_documents: an admin reads the list to review');
select tests.expect(tests.fx('A'), 'delete from public.dealer_documents where dealer_id = ' || tests.l('PD'), 'n:0', 'dealer_documents: an admin removes nothing', 'aal2');
select tests.expect(tests.fx('PD0'), $$delete from storage.objects where bucket_id = 'dealer-documents' and owner = $$ || tests.l('D2'), 'n:0', 'dealer-documents: a dealer deletes no one else''s file');

-- A registered file stays while its document does (A3b verification, M1 and L2) -------------------------------------
select tests.expect(tests.fx('PD0'), $$delete from storage.objects where bucket_id = 'dealer-documents' and name = $$ || quote_literal(tests.fx('PD0') || '/licence.pdf'), 'n:0', 'dealer-documents: a file a document still names cannot be deleted');
select tests.expect(tests.fx('PD0'), $$update storage.objects set metadata = '{"mimetype": "image/png"}' where bucket_id = 'dealer-documents' and owner = $$ || tests.l('PD0'), 'n:0', 'dealer-documents: nor overwritten (no update policy)');
insert into storage.objects (bucket_id, name, owner) values ('dealer-documents', tests.fx('PD0') || '/stray.pdf', tests.fx('PD0'));
select tests.expect(tests.fx('PD0'), $$delete from storage.objects where bucket_id = 'dealer-documents' and name = $$ || quote_literal(tests.fx('PD0') || '/stray.pdf'), 'n:1', 'dealer-documents: a file no document names can be deleted (the app cleans up a refused attach)');

-- One lock orders document changes against a submission (A3b verification, L1)
select tests.expect(tests.fx('PD0'), 'select 1 where public.lock_editable_application(' || tests.l('PD0') || ')', 'rows:1', 'lock_editable_application: a draft may change, on the locked row');
select tests.expect(tests.fx('PD'), 'select 1 where public.lock_editable_application(' || tests.l('PD') || ')', 'rows:0', 'lock_editable_application: one under review may not');
select tests.expect(tests.fx('PD0'), 'select 1 where public.lock_editable_application(' || tests.l('PD') || ')', 'rows:0', 'lock_editable_application: nor anyone else''s');

-- submit_application: complete applications only ----------------------------------------------------------------------
select tests.expect(tests.fx('A'), 'select public.decide_account_status(' || tests.l('PD0') || $$, 'approved')$$, 'err:23514', 'decide: a draft cannot be approved', 'aal2');
select tests.expect(tests.fx('PD0'), 'select public.submit_application()', 'err:23514', 'submit: an incomplete application is refused');
select set_config('request.jwt.claims', json_build_object('sub', tests.fx('PD0'), 'role', 'authenticated')::text, true);
select throws_like('select public.submit_application()', '%Business registration certificate%',
  'submit: the refusal names what is missing (the registration certificate; the licence is there)');
select set_config('request.jwt.claims', '', true);
select tests.expect(tests.fx('B'), 'select public.submit_application()', 'err:23514', 'submit: a buyer has no application');
select tests.expect(tests.fx('D'), 'select public.submit_application()', 'err:23514', 'submit: an approved dealer has nothing to submit');
select tests.expect(tests.fx('PD'), 'select public.submit_application()', 'err:23514', 'submit: one under review is not submitted twice');
select tests.complete_application(tests.fx('PD0'));
-- A document whose file is gone (only the owner could remove it, as the database owner) does not count.
delete from storage.objects where bucket_id = 'dealer-documents' and name = tests.fx('PD0') || '/business_registration.pdf';
select tests.expect(tests.fx('PD0'), 'select public.submit_application()', 'err:23514', 'submit: a document without its file in Storage does not count (A3b verification, M1)');
insert into storage.objects (bucket_id, name, owner) values ('dealer-documents', tests.fx('PD0') || '/business_registration.pdf', tests.fx('PD0'));
select tests.expect(tests.fx('PD0'), 'select public.submit_application()', 'rows:1', 'submit: a complete application goes in the queue');
select ok((select account_status = 'pending' and application_submitted_at is not null from public.profiles where id = tests.fx('PD0')), 'submit: pending, with the submission time');
select tests.expect(tests.fx('PD0'), $$insert into storage.objects (bucket_id, name, owner) values ('dealer-documents', $$ || quote_literal(tests.fx('PD0') || '/after.pdf') || ', ' || tests.l('PD0') || ')', 'err:42501', 'submit: after it, no new file');
select tests.expect(tests.fx('PD0'), $$delete from storage.objects where bucket_id = 'dealer-documents' and owner = $$ || tests.l('PD0'), 'n:0', 'submit: and no file removed');

-- A rejected dealer: removing a required document blocks the resubmission until it is back -------------------------
select tests.expect(tests.fx('RD'), 'delete from public.dealer_documents d using public.required_documents r where d.required_document_id = r.id and r.code = ''business_licence'' and d.dealer_id = ' || tests.l('RD'), 'n:1', 'rejected: the dealer removes a document');
select tests.expect(tests.fx('RD'), 'select public.submit_application()', 'err:23514', 'rejected: and cannot resubmit without it');
insert into storage.objects (bucket_id, name, owner, metadata)
values ('dealer-documents', tests.fx('RD') || '/new-licence.pdf', tests.fx('RD'), '{"mimetype": "application/pdf", "size": 10}');
select tests.expect(tests.fx('RD'), 'insert into public.dealer_documents (dealer_id, required_document_id, storage_path, file_name) select ' || tests.l('RD') || ', id, '
  || quote_literal(tests.fx('RD') || '/new-licence.pdf') || $$, 'new-licence.pdf' from public.required_documents where role = 'dealer' and code = 'business_licence'$$, 'n:1', 'rejected: sends the corrected document');
select tests.expect(tests.fx('RD'), 'select public.submit_application()', 'rows:1', 'rejected: resubmits, the other documents carried forward');
select is((select account_status::text || ' / ' || coalesce(account_status_reason, 'no reason') from public.profiles where id = tests.fx('RD')), 'pending / no reason', 'rejected: back to pending, the reason cleared (it stays in the audit log)');

-- Experts: the same rules over their own tables and bucket ------------------------------------------------------------
select tests.expect(tests.fx('PE'), $$update public.experts set qualifications = 'Changed' where id = $$ || tests.l('PE'), 'n:0', 'experts: frozen while under review');
select tests.expect(tests.fx('PE'), 'insert into public.expert_specializations (expert_id, specialization) values (' || tests.l('PE') || $$, 'irrigation')$$, 'err:42501', 'expert_specializations: frozen while under review');
select tests.expect(tests.fx('E'), $$update public.experts set professional_description = 'Twenty years in the field' where id = $$ || tests.l('E'), 'n:1', 'experts: an approved expert keeps their profile current');
insert into storage.objects (bucket_id, name, owner, metadata)
values ('expert-documents', tests.fx('PE0') || '/degree.pdf', tests.fx('PE0'), '{"mimetype": "application/pdf", "size": 4096}');
select tests.expect(tests.fx('PE0'), 'insert into public.expert_documents (expert_id, required_document_id, storage_path, file_name) select ' || tests.l('PE0') || ', id, '
  || quote_literal(tests.fx('PE0') || '/degree.pdf') || $$, 'degree.pdf' from public.required_documents where role = 'expert' and code = 'degree'$$, 'n:1', 'expert_documents: a draft expert registers their file');
select tests.expect(tests.fx('E'), 'insert into public.expert_documents (expert_id, storage_path, file_name) values (' || tests.l('E') || ', ' || quote_literal(tests.fx('E') || '/cv.pdf') || $$, 'cv.pdf')$$, 'err:42501', 'expert_documents: an approved expert''s application is closed');
select tests.expect(tests.fx('D2'), 'insert into public.expert_documents (expert_id, storage_path, file_name) values (' || tests.l('PE0') || ', ' || quote_literal(tests.fx('PE0') || '/degree.pdf') || $$, 'x.pdf')$$, 'err:42501', 'expert_documents: nobody files in an expert''s name');
select tests.expect(tests.fx('E'), 'select id from public.expert_documents where expert_id = ' || tests.l('PE0'), 'rows:0', 'expert_documents: another expert cannot read the list');
select tests.expect(tests.fx('A'), 'select id from public.expert_documents where expert_id = ' || tests.l('PE0'), 'rows:1', 'expert_documents: an admin reads it');
select tests.expect(tests.fx('PE0'), $$delete from storage.objects where bucket_id = 'expert-documents' and owner = $$ || tests.l('PE0'), 'n:0', 'expert-documents: a file a document still names cannot be deleted (A3b verification round 2, T2)');
select tests.expect(tests.fx('PE0'), 'delete from public.expert_documents where expert_id = ' || tests.l('PE0'), 'n:1', 'expert_documents: a draft expert removes a document');
select tests.expect(tests.fx('PE0'), $$delete from storage.objects where bucket_id = 'expert-documents' and owner = $$ || tests.l('PE0'), 'n:1', 'expert-documents: and its file (there was no delete policy before)');
select tests.expect(tests.fx('PE0'), 'select public.submit_application()', 'err:23514', 'submit: an expert with only a draft row is refused');
select tests.complete_application(tests.fx('PE0'));
select tests.expect(tests.fx('PE0'), 'select public.submit_application()', 'rows:1', 'submit: a complete expert application goes in the queue');
select is((select count(*) from public.expert_verifications where expert_id = tests.fx('PE0')), 1::bigint, 'submit: one submission record for the expert, written by the function');

-- A role change starts over --------------------------------------------------------------------------------------------
select tests.expect(tests.fx('A'), $$update public.profiles set role = 'farmer' where id = $$ || tests.l('PD'), 'n:1', 'role change: an admin makes the dealer under review a farmer', 'aal2');
select tests.expect(tests.fx('A'), $$update public.profiles set role = 'dealer' where id = $$ || tests.l('PD'), 'n:1', 'role change: and a dealer again', 'aal2');
select is((select account_status::text || ' ' || (application_submitted_at is null)::text from public.profiles where id = tests.fx('PD')), 'pending true', 'role change: the application is a draft again, out of the queue');

-- Sign-up details (SRDS §5–§7) ----------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, instance_id, raw_user_meta_data) values
  (gen_random_uuid(), 'authenticated', 'authenticated', 'signup-farmer@pgtap.test', '00000000-0000-0000-0000-000000000000',
   jsonb_build_object('role', 'farmer', 'full_name', '  Farmer Signup ', 'phone', '+923001234567', 'country', 'Pakistan',
                      'province', 'Sindh', 'city', repeat('c', 150), 'street', 'House 4', 'village', 'Goth Ali')),
  (gen_random_uuid(), 'authenticated', 'authenticated', 'signup-buyer@pgtap.test', '00000000-0000-0000-0000-000000000000',
   jsonb_build_object('role', 'buyer', 'full_name', 'Buyer Signup', 'village', 'Not for buyers', 'city', 'Karachi'));
select is(
  (select p.full_name || '|' || p.phone || '|' || p.country || '|' || p.province || '|' || char_length(p.city) || '|' || p.street || '|' || p.village
     from public.profiles p join auth.users u using (id) where u.email = 'signup-farmer@pgtap.test'),
  'Farmer Signup|+923001234567|Pakistan|Sindh|100|House 4|Goth Ali',
  'sign-up: a farmer''s phone and location are kept, trimmed and cut to length');
select is(
  (select coalesce(village, 'no village') || '|' || city from public.profiles p join auth.users u using (id) where u.email = 'signup-buyer@pgtap.test'),
  'no village|Karachi', 'sign-up: a buyer has no village (SRDS §6)');

-- An admin's email change is audited (BR-15) --------------------------------------------------------------------------
update auth.users set email = 'admin-new@pgtap.test' where id = tests.fx('A');
update auth.users set email = 'buyer-new@pgtap.test' where id = tests.fx('B');
select is(
  (select previous_state ->> 'email' || ' > ' || (new_state ->> 'email') from public.audit_logs
    where action = 'admin_email_changed' and target_id = tests.fx('A') and actor_id = tests.fx('A')),
  'A@pgtap.test > admin-new@pgtap.test', 'email change: an admin''s new address is audited');
select is((select count(*) from public.audit_logs where action = 'admin_email_changed' and target_id = tests.fx('B')), 0::bigint, 'email change: a buyer''s is not an admin action');

select * from finish();
rollback;
