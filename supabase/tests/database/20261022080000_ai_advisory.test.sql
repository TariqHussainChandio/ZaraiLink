-- Pair for migration 20261022080000_ai_advisory.sql (A6; SRDS §32-§37, D11, BR-13): the reviewed advisory text per
-- model class, the farmer-only disease case with its backend-written state, the case a consultation is about, the
-- assigned expert's read of that case, and the expert's append-only assessment that notifies the requester. Every
-- allowed path has a refused neighbour that differs in one thing: the caller, the role, the consultation status, the
-- second factor, or the case's owner.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();
select tests.world();
-- The audit log as it stood before this test: every count below is of the rows this test adds, so rows another run
-- committed to the shared local database (a backend smoke run edits and reviews disease knowledge) do not move it.
create temporary table audit_seen on commit drop as select id from public.audit_logs;

-- fixtures, made as the owner: E2 a second approved expert; SF2 a suspended farmer; DCF F's case with its prediction DPF,
-- DCF_B a second case of F's, DCF2 F2's case
do $$
declare e2 uuid; sf2 uuid; dcf uuid;
begin
  e2 := tests.make_user('E2', 'expert');
  perform tests.approve(array[e2]);
  insert into public.experts (id, verification_status) values (e2, 'approved');
  sf2 := tests.make_user('SF2', 'farmer');
  update public.profiles set is_suspended = true where id = sf2;
  insert into public.disease_cases (user_id, storage_path) values (tests.fx('F'), tests.fx('F') || '/a.jpg') returning id into dcf;
  insert into tests.fixtures values ('DCF', dcf);
  with x as (insert into public.disease_predictions (disease_case_id, predicted_disease, confidence_score)
    values (dcf, 'Tomato___Late_blight', 0.8) returning id)
    insert into tests.fixtures select 'DPF', id from x;
  with x as (insert into public.disease_cases (user_id, storage_path) values (tests.fx('F'), tests.fx('F') || '/b.jpg') returning id)
    insert into tests.fixtures select 'DCF_B', id from x;
  with x as (insert into public.disease_cases (user_id, storage_path) values (tests.fx('F2'), tests.fx('F2') || '/c.jpg') returning id)
    insert into tests.fixtures select 'DCF2', id from x;
end $$;

-- An insert of a new case as a statement, for the caller `_who`, with optional status and failure_reason.
create function tests.new_case(_who text, _extra_cols text default '', _extra_vals text default '') returns text
language sql stable as $$
  select format('insert into public.disease_cases (user_id, storage_path%s) values (%s, %L%s)',
    _extra_cols, tests.l(_who), tests.fx(_who)::text || '/new.jpg', _extra_vals)
$$;

-- An assessment insert as a statement.
create function tests.assess(_expert text, _verdict text, _diagnosis text default null) returns text
language sql stable as $$
  select format('insert into public.consultation_assessments (consultation_id, expert_id, verdict, diagnosis) values (%s, %s, %L, %L)',
    tests.l('CF'), tests.l(_expert), _verdict, _diagnosis)
$$;

-- Move consultation CF as the owner (the status guard lets the owner through).
create function tests.cf_status(_status text) returns void language sql as $$
  update public.consultations set status = _status::public.consultation_status where id = tests.fx('CF')
$$;

-- disease_knowledge ----------------------------------------------------------------------------------------------------
select is((select count(*)::int from public.disease_knowledge), 38, 'disease_knowledge: one row per model class (38)');
select is((select count(*)::int from public.disease_knowledge where review_status = 'pending_review'), 38,
  'disease_knowledge: every row is pending_review until an agronomist reviews it');
-- The labels of backend/app/ai/checkpoints/class_names.json, copied verbatim: the lookup uses the raw model label.
select set_eq('select class_label from public.disease_knowledge', array[
  'Apple___Apple_scab', 'Apple___Black_rot', 'Apple___Cedar_apple_rust', 'Apple___healthy', 'Blueberry___healthy',
  'Cherry_(including_sour)___Powdery_mildew', 'Cherry_(including_sour)___healthy',
  'Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot', 'Corn_(maize)___Common_rust_', 'Corn_(maize)___Northern_Leaf_Blight',
  'Corn_(maize)___healthy', 'Grape___Black_rot', 'Grape___Esca_(Black_Measles)', 'Grape___Leaf_blight_(Isariopsis_Leaf_Spot)',
  'Grape___healthy', 'Orange___Haunglongbing_(Citrus_greening)', 'Peach___Bacterial_spot', 'Peach___healthy',
  'Pepper,_bell___Bacterial_spot', 'Pepper,_bell___healthy', 'Potato___Early_blight', 'Potato___Late_blight',
  'Potato___healthy', 'Raspberry___healthy', 'Soybean___healthy', 'Squash___Powdery_mildew', 'Strawberry___Leaf_scorch',
  'Strawberry___healthy', 'Tomato___Bacterial_spot', 'Tomato___Early_blight', 'Tomato___Late_blight', 'Tomato___Leaf_Mold',
  'Tomato___Septoria_leaf_spot', 'Tomato___Spider_mites Two-spotted_spider_mite', 'Tomato___Target_Spot',
  'Tomato___Tomato_Yellow_Leaf_Curl_Virus', 'Tomato___Tomato_mosaic_virus', 'Tomato___healthy'
], 'disease_knowledge: the labels match the model''s class_names.json exactly');
select is((select count(*)::int from public.disease_knowledge where is_healthy <> (class_label like '%\_\_\_healthy')), 0,
  'disease_knowledge: is_healthy is set exactly on the ___healthy classes');

select tests.expect(tests.fx('F'), 'select class_label from public.disease_knowledge', 'rows:38', 'disease_knowledge: a farmer reads it');
select tests.expect(tests.fx('E'), 'select class_label from public.disease_knowledge', 'rows:38', 'disease_knowledge: an expert reads it');
select tests.expect(tests.fx('B'), 'select class_label from public.disease_knowledge', 'rows:38', 'disease_knowledge: any signed-in user reads it');
select tests.expect(null, 'select class_label from public.disease_knowledge', 'err:42501', 'disease_knowledge: anon does not');

select tests.expect(tests.fx('F'), $$insert into public.disease_knowledge (class_label, crop, disease, advisory) values ('X___y', 'X', 'y', 'z')$$,
  'err:42501', 'disease_knowledge: a farmer cannot add a row');
select tests.expect(tests.fx('E'), $$update public.disease_knowledge set advisory = 'forged' where class_label = 'Tomato___healthy'$$,
  'n:0', 'disease_knowledge: an expert cannot edit a row');
select tests.expect(tests.fx('F'), $$update public.disease_knowledge set review_status = 'reviewed' where class_label = 'Tomato___healthy'$$,
  'n:0', 'disease_knowledge: a farmer cannot mark a row reviewed');
select tests.expect(tests.fx('F'), $$delete from public.disease_knowledge where class_label = 'Tomato___healthy'$$,
  'err:42501', 'disease_knowledge: a farmer cannot delete a row');
select tests.expect(tests.fx('A'), $$insert into public.disease_knowledge (class_label, crop, disease, advisory) values ('X___y', 'X', 'y', 'z')$$,
  'err:42501', 'disease_knowledge: an admin without a second factor cannot add a row');
select tests.expect(tests.fx('A'), $$update public.disease_knowledge set review_status = 'reviewed' where class_label = 'Tomato___healthy'$$,
  'n:0', 'disease_knowledge: nor edit one at aal1');
select tests.expect(tests.fx('A'), $$delete from public.disease_knowledge where class_label = 'Tomato___healthy'$$,
  'err:42501', 'disease_knowledge: nor delete one at aal1');
-- Edit only: the 38 classes are fixed by the model, so no client adds or removes one, not even an aal2 admin (BR-15
-- finding: an aal2 insert and delete went unaudited, and a deleted class fell back to generic advice).
select tests.expect(tests.fx('A'), $$insert into public.disease_knowledge (class_label, crop, disease, advisory) values ('X___y', 'X', 'y', 'z')$$,
  'err:42501', 'disease_knowledge: an admin at aal2 cannot add a row either', 'aal2');
select tests.expect(tests.fx('A'), $$delete from public.disease_knowledge where class_label = 'Tomato___healthy'$$,
  'err:42501', 'disease_knowledge: nor delete one', 'aal2');
select ok(not has_table_privilege('authenticated', 'public.disease_knowledge', 'insert')
      and not has_table_privilege('authenticated', 'public.disease_knowledge', 'delete'),
  'disease_knowledge: authenticated holds no insert or delete grant');
select is((select count(*)::int from public.disease_knowledge), 38, 'disease_knowledge: still the 38 classes');
-- The seed is the migration's starting content, not a change: the audit trigger is created after it.
select is((select count(*)::int from public.audit_logs where id not in (select id from audit_seen) and target_entity = 'disease_knowledge'), 0,
  'disease_knowledge audit: the refused writes above wrote no audit row (the 38 seeded rows predate the trigger)');

-- The reviewer is always the caller: the client sends E as reviewer and an old date, the row records A and now().
select tests.expect(tests.fx('A'), $$update public.disease_knowledge set review_status = 'reviewed', reviewed_by = $$ || tests.l('E') || $$, reviewed_at = '2001-01-01' where class_label = 'Tomato___healthy'$$,
  'n:1', 'disease_knowledge: an admin at aal2 marks a row reviewed', 'aal2');
select is((select row(review_status, reviewed_by, reviewed_at = now())::text from public.disease_knowledge where class_label = 'Tomato___healthy'),
  row('reviewed', tests.fx('A'), true)::text,
  'disease_knowledge review: reviewed_by is auth.uid() and reviewed_at is now(), whatever the client sent');

-- BR-15 / SRDS §51: the table's own trigger audits every change in the same transaction. The aal2 review above wrote
-- exactly one "ai_configuration_changed" row, as A, naming the class in metadata and holding only the changed columns.
select is((select count(*)::int from public.audit_logs
            where id not in (select id from audit_seen) and action = 'ai_configuration_changed' and target_entity = 'disease_knowledge'
              and metadata->>'class_label' = 'Tomato___healthy'), 1,
  'disease_knowledge audit: the aal2 review wrote exactly one ai_configuration_changed row');
select is((select row(actor_id, target_id, metadata->>'change',
                      previous_state->>'review_status', new_state->>'review_status', new_state ? 'advisory')::text
             from public.audit_logs
            where id not in (select id from audit_seen) and action = 'ai_configuration_changed' and metadata->>'class_label' = 'Tomato___healthy'),
  row(tests.fx('A'), null::uuid, 'review', 'pending_review', 'reviewed', false)::text,
  'disease_knowledge audit: actor is the admin, no target_id, change=review, only the changed columns');
-- Once reviewed, the recorded review cannot be moved to someone else while the text stays the same.
select tests.expect(tests.fx('A'), $$update public.disease_knowledge set reviewed_by = $$ || tests.l('E') || $$, reviewed_at = '2001-01-01' where class_label = 'Tomato___healthy'$$,
  'n:1', 'disease_knowledge review: a reviewer rewrite runs', 'aal2');
select is((select row(review_status, reviewed_by, reviewed_at = now())::text from public.disease_knowledge where class_label = 'Tomato___healthy'),
  row('reviewed', tests.fx('A'), true)::text,
  'disease_knowledge review: but reviewed_by and reviewed_at stay as recorded');

-- Edited reviewed text goes back to the queue, even when the statement also says review_status = 'reviewed'.
select tests.expect(tests.fx('A'), $$update public.disease_knowledge set advisory = advisory || ' (edited)', review_status = 'reviewed', reviewed_by = $$ || tests.l('A') || $$ where class_label = 'Tomato___healthy'$$,
  'n:1', 'disease_knowledge audit: an aal2 edit succeeds', 'aal2');
select is((select row(review_status, reviewed_by, reviewed_at)::text from public.disease_knowledge where class_label = 'Tomato___healthy'),
  row('pending_review', null::uuid, null::timestamptz)::text,
  'disease_knowledge review: a text edit on a reviewed row ends up pending_review with no reviewer');
select is((select array_agg(metadata->>'change' order by metadata->>'change')
             from public.audit_logs
            where id not in (select id from audit_seen) and action = 'ai_configuration_changed' and metadata->>'class_label' = 'Tomato___healthy'),
  array['edit', 'edit', 'review'],
  'disease_knowledge audit: every update writes one row (the reviewer rewrite and the text edit are edits)');

-- The backend's own edit (admin/service.py: reviewed text sent back with pending_review and nulls) agrees with the rule.
select tests.expect(tests.fx('A'), $$update public.disease_knowledge set review_status = 'reviewed' where class_label = 'Apple___healthy'$$,
  'n:1', 'disease_knowledge review: a second class is reviewed', 'aal2');
select tests.expect(tests.fx('A'), $$update public.disease_knowledge set advisory = 'Backend edit.', review_status = 'pending_review', reviewed_by = null, reviewed_at = null where class_label = 'Apple___healthy'$$,
  'n:1', 'disease_knowledge review: the backend''s edit shape is accepted', 'aal2');
select is((select row(review_status, reviewed_by, reviewed_at, advisory)::text from public.disease_knowledge where class_label = 'Apple___healthy'),
  row('pending_review', null::uuid, null::timestamptz, 'Backend edit.')::text,
  'disease_knowledge review: and lands as pending_review with the new text');
-- Refused writes leave no audit row: one matches no row (aal1), one fails its check constraint (aal2).
select tests.expect(tests.fx('A'), $$update public.disease_knowledge set advisory = 'x' where class_label = 'Potato___healthy'$$,
  'n:0', 'disease_knowledge audit: an aal1 edit changes nothing');
select tests.expect(tests.fx('A'), $$update public.disease_knowledge set review_status = 'bogus' where class_label = 'Potato___healthy'$$,
  'err:23514', 'disease_knowledge audit: an invalid aal2 edit fails', 'aal2');
select is((select count(*)::int from public.audit_logs where id not in (select id from audit_seen) and metadata->>'class_label' = 'Potato___healthy'), 0,
  'disease_knowledge audit: a refused or failed update writes no audit row');
select ok(
  (select p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=public, pg_temp')
     from pg_proc p where p.oid = 'public.audit_disease_knowledge()'::regprocedure),
  'audit_disease_knowledge: security definer with search_path = public, pg_temp');
select ok(not has_function_privilege('authenticated', 'public.audit_disease_knowledge()', 'execute'),
  'audit_disease_knowledge: no client may call it');

-- Defence in depth: an insert or delete outside the client path (here as the table owner) is still audited.
insert into public.disease_knowledge (class_label, crop, disease, advisory) values ('Verify___probe', 'Verify', 'probe', 'probe');
delete from public.disease_knowledge where class_label = 'Verify___probe';
select is((select array_agg(row(metadata->>'change', target_id, previous_state ? 'class_label', new_state ? 'class_label')::text
                            order by metadata->>'change' desc)
             from public.audit_logs
            where id not in (select id from audit_seen) and action = 'ai_configuration_changed' and metadata->>'class_label' = 'Verify___probe'),
  array[row('insert', null::uuid, null::boolean, true)::text, row('delete', null::uuid, true, null::boolean)::text],
  'disease_knowledge audit: a privileged insert and delete each write a row (change=insert/delete, the whole row)');
select is((select array_agg(e order by e) from (
            select unnest(array[case when t.tgtype & 4 <> 0 then 'insert' end, case when t.tgtype & 16 <> 0 then 'update' end,
                                case when t.tgtype & 8 <> 0 then 'delete' end]) e
              from pg_trigger t where t.tgrelid = 'public.disease_knowledge'::regclass and t.tgname = 'audit_disease_knowledge') x
           where e is not null),
  array['delete', 'insert', 'update'],
  'audit_disease_knowledge: fires on insert, update and delete');
select ok(
  (select not p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""')
     from pg_proc p where p.oid = 'public.guard_disease_knowledge_review()'::regprocedure),
  'guard_disease_knowledge_review: invoker rights with an empty search_path');
select ok(not has_function_privilege('authenticated', 'public.guard_disease_knowledge_review()', 'execute'),
  'guard_disease_knowledge_review: no client may call it');

-- disease-images bucket: D11, only an approved farmer uploads, into their own folder; nobody deletes through a client.
select tests.expect(tests.fx('F'), $$insert into storage.objects (bucket_id, name, owner) values ('disease-images', $$ || quote_literal(tests.fx('F')::text || '/leaf.jpg') || ', ' || tests.l('F') || ')',
  'n:1', 'disease-images: a farmer uploads into their own folder');
select tests.expect(tests.fx('B'), $$insert into storage.objects (bucket_id, name, owner) values ('disease-images', $$ || quote_literal(tests.fx('B')::text || '/leaf.jpg') || ', ' || tests.l('B') || ')',
  'err:42501', 'disease-images: a buyer cannot upload (D11)');
select tests.expect(tests.fx('E'), $$insert into storage.objects (bucket_id, name, owner) values ('disease-images', $$ || quote_literal(tests.fx('E')::text || '/leaf.jpg') || ', ' || tests.l('E') || ')',
  'err:42501', 'disease-images: an expert cannot upload (D11)');
select tests.expect(tests.fx('D'), $$insert into storage.objects (bucket_id, name, owner) values ('disease-images', $$ || quote_literal(tests.fx('D')::text || '/leaf.jpg') || ', ' || tests.l('D') || ')',
  'err:42501', 'disease-images: a dealer cannot upload (D11)');
select tests.expect(tests.fx('SF2'), $$insert into storage.objects (bucket_id, name, owner) values ('disease-images', $$ || quote_literal(tests.fx('SF2')::text || '/leaf.jpg') || ', ' || tests.l('SF2') || ')',
  'err:42501', 'disease-images: a suspended farmer cannot upload');
select tests.expect(tests.fx('F2'), $$insert into storage.objects (bucket_id, name, owner) values ('disease-images', $$ || quote_literal(tests.fx('F')::text || '/planted.jpg') || ', ' || tests.l('F2') || ')',
  'err:42501', 'disease-images: a farmer cannot upload into another farmer''s folder');
-- Storage refuses direct deletes unless its API sets this flag; the policies are what is under test here.
select set_config('storage.allow_delete_query', 'true', true);
select tests.expect(tests.fx('F'), $$delete from storage.objects where bucket_id = 'disease-images' and owner = $$ || tests.l('F'),
  'n:0', 'disease-images: the farmer cannot delete their own disease photo (the case keeps it)');
select is((select count(*)::int from storage.objects where bucket_id = 'disease-images' and owner = tests.fx('F')), 1,
  'disease-images: the photo is still there');

-- disease_cases: D11 farmers only, the state is the backend's ---------------------------------------------------------
select tests.expect(tests.fx('F'), tests.new_case('F'), 'n:1', 'disease_cases: a farmer creates a case');
select is((select status from public.disease_cases where storage_path = tests.fx('F') || '/new.jpg'), 'pending',
  'disease_cases: a new case starts pending');
select tests.expect(tests.fx('B'), tests.new_case('B'), 'err:42501', 'disease_cases: a buyer cannot (D11)');
select tests.expect(tests.fx('D'), tests.new_case('D'), 'err:42501', 'disease_cases: a dealer cannot (D11)');
select tests.expect(tests.fx('E'), tests.new_case('E'), 'err:42501', 'disease_cases: an expert cannot (D11)');
select tests.expect(tests.fx('A'), tests.new_case('A'), 'err:42501', 'disease_cases: an admin cannot (D11)', 'aal2');
select tests.expect(tests.fx('SF2'), tests.new_case('SF2'), 'err:42501', 'disease_cases: a suspended farmer cannot');
select tests.expect(tests.fx('F2'), tests.new_case('F2', ', status', $$, 'predicted'$$), 'err:42501',
  'disease_cases: a farmer cannot create a case already predicted');
select tests.expect(tests.fx('F2'), tests.new_case('F2', ', status', $$, 'failed'$$), 'err:42501',
  'disease_cases: nor already failed');
select tests.expect(tests.fx('F2'), tests.new_case('F2', ', failure_reason', $$, 'forged'$$), 'err:42501',
  'disease_cases: nor with a failure reason');
select tests.expect(tests.fx('F2'), tests.new_case('F2', ', status', $$, 'pending'$$), 'n:1',
  'disease_cases: an explicit pending is accepted');
select tests.expect(tests.fx('F'), $$update public.disease_cases set status = 'predicted' where id = $$ || tests.l('DCF'), 'err:42501',
  'disease_cases: the owner cannot mark their case predicted');
select tests.expect(tests.fx('F'), $$update public.disease_cases set failure_reason = 'x' where id = $$ || tests.l('DCF'), 'err:42501',
  'disease_cases: nor write a failure reason');
select ok(not has_any_column_privilege('authenticated', 'public.disease_cases', 'update'),
  'disease_cases: authenticated holds no update privilege on any column');
select ok(has_column_privilege('service_role', 'public.disease_cases', 'status', 'update')
  and has_column_privilege('service_role', 'public.disease_cases', 'failure_reason', 'update'),
  'disease_cases: the backend (service_role) writes status and failure_reason');

-- consultations.disease_case_id ----------------------------------------------------------------------------------------
select tests.expect(tests.fx('F'),
  format('insert into public.consultations (user_id, expert_id, subject, disease_case_id) values (%s, %s, %L, %s)',
    tests.l('F'), tests.l('E'), 'Is this late blight?', tests.l('DCF')),
  'n:1', 'consultations: a requester attaches their own case');
insert into tests.fixtures select 'CF', id from public.consultations where disease_case_id = tests.fx('DCF');
select tests.expect(tests.fx('F'),
  format('insert into public.consultations (user_id, expert_id, subject, disease_case_id) values (%s, %s, %L, %s)',
    tests.l('F'), tests.l('E'), 'Theirs', tests.l('DCF2')),
  'err:42501', 'consultations: a requester cannot attach another farmer''s case');
select tests.expect(tests.fx('B'),
  format('insert into public.consultations (user_id, expert_id, subject, disease_case_id) values (%s, %s, %L, %s)',
    tests.l('B'), tests.l('E'), 'Theirs', tests.l('DCF')),
  'err:42501', 'consultations: nor can a buyer attach a farmer''s case');
select tests.expect(tests.fx('F'), 'update public.consultations set disease_case_id = ' || tests.l('DCF_B') || ' where id = ' || tests.l('CF'),
  'err:42501', 'consultations: the requester cannot switch the case afterwards, even to another own case');
select tests.expect(tests.fx('F'), 'update public.consultations set disease_case_id = null where id = ' || tests.l('CF'),
  'err:42501', 'consultations: nor detach it');
select tests.expect(tests.fx('E'), 'update public.consultations set disease_case_id = ' || tests.l('DCF2') || ' where id = ' || tests.l('CF'),
  'err:42501', 'consultations: nor can the expert change it');
select is((select disease_case_id from public.consultations where id = tests.fx('CF')), tests.fx('DCF'),
  'consultations: the case is unchanged');

-- is_case_expert: the assigned expert reads the case and its prediction -----------------------------------------------
select ok(
  (select p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=public, pg_temp')
     from pg_proc p where p.oid = 'public.is_case_expert(uuid)'::regprocedure),
  'is_case_expert: security definer with search_path = public, pg_temp');
select ok(not has_function_privilege('anon', 'public.is_case_expert(uuid)', 'execute'), 'is_case_expert: anon may not call it');

select tests.expect(tests.fx('E'), 'select id from public.disease_cases where id = ' || tests.l('DCF'), 'rows:1', 'case: the assigned expert reads it (requested)');
select tests.expect(tests.fx('E'), 'select id from public.disease_predictions where id = ' || tests.l('DPF'), 'rows:1', 'case: and its prediction');
select tests.expect(tests.fx('E'), 'select id from public.disease_cases where id = ' || tests.l('DCF_B'), 'rows:0', 'case: not the requester''s other, unlinked case');
select tests.expect(tests.fx('E2'), 'select id from public.disease_cases where id = ' || tests.l('DCF'), 'rows:0', 'case: another expert does not read it');
select tests.expect(tests.fx('E2'), 'select id from public.disease_predictions where id = ' || tests.l('DPF'), 'rows:0', 'case: nor its prediction');
select tests.expect(tests.fx('B2'), 'select id from public.disease_cases where id = ' || tests.l('DCF'), 'rows:0', 'case: a stranger does not read it');
select tests.expect(tests.fx('B2'), 'select id from public.disease_predictions where id = ' || tests.l('DPF'), 'rows:0', 'case: nor its prediction');
select tests.expect(tests.fx('F2'), 'select id from public.disease_cases where id = ' || tests.l('DCF'), 'rows:0', 'case: another farmer does not read it');

select tests.cf_status('rejected');
select tests.expect(tests.fx('E'), 'select id from public.disease_cases where id = ' || tests.l('DCF'), 'rows:0', 'case: a rejected consultation stops the expert''s access');
select tests.expect(tests.fx('E'), 'select id from public.disease_predictions where id = ' || tests.l('DPF'), 'rows:0', 'case: to the prediction too');
select tests.cf_status('cancelled');
select tests.expect(tests.fx('E'), 'select id from public.disease_cases where id = ' || tests.l('DCF'), 'rows:0', 'case: so does a cancelled one');
select tests.cf_status('expired');
select tests.expect(tests.fx('E'), 'select id from public.disease_cases where id = ' || tests.l('DCF'), 'rows:0', 'case: and an expired one');
select tests.expect(tests.fx('F'), 'select id from public.disease_cases where id = ' || tests.l('DCF'), 'rows:1', 'case: the owner still reads it');

-- consultation_assessments --------------------------------------------------------------------------------------------
select tests.cf_status('requested');
select tests.expect(tests.fx('E'), tests.assess('E', 'agree'), 'err:42501', 'assessment: refused while the consultation is only requested');
select tests.cf_status('accepted');
select tests.expect(tests.fx('E'), 'select id from public.disease_cases where id = ' || tests.l('DCF'), 'rows:1', 'case: the expert reads it again once accepted');
select tests.expect(tests.fx('E'), tests.assess('E', 'agree'), 'n:1', 'assessment: the assigned expert agrees (accepted)');
select tests.expect(tests.fx('E2'), tests.assess('E2', 'agree'), 'err:42501', 'assessment: another expert cannot assess it');
select tests.expect(tests.fx('E2'), tests.assess('E', 'agree'), 'err:42501', 'assessment: nor in the assigned expert''s name');
select tests.expect(tests.fx('F'), tests.assess('F', 'agree'), 'err:42501', 'assessment: the requester cannot assess their own consultation');
select tests.expect(tests.fx('F'), tests.assess('E', 'agree'), 'err:42501', 'assessment: nor in the expert''s name');
select tests.expect(tests.fx('A'), tests.assess('A', 'agree'), 'err:42501', 'assessment: nor can an admin', 'aal2');
select tests.cf_status('in_progress');
select tests.expect(tests.fx('E'), tests.assess('E', 'correct'), 'err:23514', 'assessment: a correction without a diagnosis is refused');
select tests.expect(tests.fx('E'), tests.assess('E', 'additional_diagnosis', '   '), 'err:23514', 'assessment: an additional diagnosis that is blank is refused');
select tests.expect(tests.fx('E'), tests.assess('E', 'correct', 'Early blight'), 'n:1', 'assessment: a correction names a diagnosis (in_progress)');
select tests.expect(tests.fx('E'), tests.assess('E', 'request_information'), 'n:1', 'assessment: asking for information needs no diagnosis');
select tests.expect(tests.fx('E'), tests.assess('E', 'guess'), 'err:23514', 'assessment: an unknown verdict is refused');
select tests.cf_status('resolved');
select tests.expect(tests.fx('E'), tests.assess('E', 'agree'), 'err:42501', 'assessment: refused once the consultation is resolved');

select tests.expect(tests.fx('E'), $$update public.consultation_assessments set verdict = 'agree' where consultation_id = $$ || tests.l('CF'),
  'err:42501', 'assessment: append-only, the expert cannot edit one');
select tests.expect(tests.fx('E'), 'delete from public.consultation_assessments where consultation_id = ' || tests.l('CF'),
  'err:42501', 'assessment: nor delete one');
select tests.expect(tests.fx('A'), 'delete from public.consultation_assessments where consultation_id = ' || tests.l('CF'),
  'err:42501', 'assessment: nor can an admin at aal2', 'aal2');

select tests.expect(tests.fx('F'), 'select id from public.consultation_assessments where consultation_id = ' || tests.l('CF'), 'rows:3', 'assessment: the requester reads them');
select tests.expect(tests.fx('E'), 'select id from public.consultation_assessments where consultation_id = ' || tests.l('CF'), 'rows:3', 'assessment: the expert reads them');
select tests.expect(tests.fx('A'), 'select id from public.consultation_assessments where consultation_id = ' || tests.l('CF'), 'rows:3', 'assessment: an admin reads them');
select tests.expect(tests.fx('E2'), 'select id from public.consultation_assessments where consultation_id = ' || tests.l('CF'), 'rows:0', 'assessment: another expert does not');
select tests.expect(tests.fx('F2'), 'select id from public.consultation_assessments where consultation_id = ' || tests.l('CF'), 'rows:0', 'assessment: another farmer does not');
select tests.expect(tests.fx('B2'), 'select id from public.consultation_assessments where consultation_id = ' || tests.l('CF'), 'rows:0', 'assessment: a stranger does not');
select tests.expect(null, 'select id from public.consultation_assessments', 'err:42501', 'assessment: anon does not');

-- the consultation_assessed notification reaches the requester, one per assessment, and nobody else
select tests.expect(tests.fx('F'),
  $$select id from public.notifications where type = 'consultation_assessed' and payload->>'consultation_id' = $$ || quote_literal(tests.fx('CF')::text),
  'rows:3', 'notification: the requester is told of every assessment');
select is((select count(*)::int from public.notifications where type = 'consultation_assessed' and user_id <> tests.fx('F')), 0,
  'notification: nobody but the requester gets one');
select ok(not has_function_privilege('authenticated', 'public.notify_consultation_assessed()', 'execute'),
  'notify_consultation_assessed: no client may call it');

select * from finish();
rollback;
