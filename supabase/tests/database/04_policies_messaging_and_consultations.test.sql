-- P6 (item 3): allowed and rejected paths for conversations, messages, notifications, consultations and
-- consultation messages. Users: B buyer and F farmer (participants of C1), B2 stranger, E expert, A admin.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();
select tests.world();

-- the fixture expert is verified for this file; a second, pending expert and a rejected consultation are added
alter table public.experts disable trigger guard_experts_verification_status;
update public.experts set verification_status = 'approved' where id = tests.fx('E');
alter table public.experts enable trigger guard_experts_verification_status;
do $$
declare e2 uuid; rej uuid;
begin
  e2 := tests.make_user('E2', 'expert');
  insert into public.experts (id) values (e2);
  insert into public.consultations (user_id, expert_id, subject, status)
    values (tests.fx('B'), tests.fx('E'), 'Rejected one', 'rejected') returning id into rej;
  insert into tests.fixtures values ('CONS_REJ', rej);
end $$;


-- conversations ----------------------------------------------------------------------------------------
select tests.expect(tests.fx('B'), 'select id from public.conversations where id = ' || tests.l('C1'), 'rows:1', 'conversations: a participant reads it');
select tests.expect(tests.fx('F'), 'select id from public.conversations where id = ' || tests.l('C1'), 'rows:1', 'conversations: the other participant reads it');
select tests.expect(tests.fx('B2'), 'select id from public.conversations where id = ' || tests.l('C1'), 'rows:0', 'conversations: a stranger does not');
select tests.expect(tests.fx('A'), 'select id from public.conversations where id = ' || tests.l('C1'), 'rows:0', 'conversations: even an admin does not (messages are moderated, chats are private)');
select tests.expect(null, 'select id from public.conversations where id = ' || tests.l('C1'), 'err:42501', 'conversations: anon has no access at all (no grant)');
-- Since A5 a new conversation carries its context (20261020080000_conversation_context.sql); here the inquiry about
-- dealer D's listing LD1, so each line still differs from the allowed one only in who starts it.
select tests.expect(tests.fx('B'), 'insert into public.conversations (participant_one, participant_two, context_type, context_id) values (' || tests.l('B') || ',' || tests.l('D') || $$, 'listing', $$ || tests.l('LD1') || ')', 'n:1', 'conversations: a user starts one they are part of');
select tests.expect(tests.fx('B'), 'insert into public.conversations (participant_one, participant_two, context_type, context_id) values (' || tests.l('F2') || ',' || tests.l('D') || $$, 'listing', $$ || tests.l('LD1') || ')', 'err:42501', 'conversations: cannot start one between two others');
select tests.expect(tests.fx('S'), 'insert into public.conversations (participant_one, participant_two, context_type, context_id) values (' || tests.l('S') || ',' || tests.l('D') || $$, 'listing', $$ || tests.l('LD1') || ')', 'err:42501', 'conversations: a suspended user cannot');

-- messages ---------------------------------------------------------------------------------------------
select tests.expect(tests.fx('B'), 'select id from public.messages where id = ' || tests.l('M1'), 'rows:1', 'messages: the sender reads it');
select tests.expect(tests.fx('F'), 'select id from public.messages where id = ' || tests.l('M1'), 'rows:1', 'messages: the recipient reads it');
select tests.expect(tests.fx('A'), 'select id from public.messages where id = ' || tests.l('M1'), 'rows:1', 'messages: an admin reads it (moderation)');
select tests.expect(tests.fx('B2'), 'select id from public.messages where id = ' || tests.l('M1'), 'rows:0', 'messages: a stranger does not');
select tests.expect(tests.fx('F'), 'insert into public.messages (conversation_id, sender_id, body) values (' || tests.l('C1') || ',' || tests.l('F') || $$, 'reply')$$, 'n:1', 'messages: a participant sends');
select tests.expect(tests.fx('B2'), 'insert into public.messages (conversation_id, sender_id, body) values (' || tests.l('C1') || ',' || tests.l('B2') || $$, 'intruder')$$, 'err:42501', 'messages: a stranger cannot send');
select tests.expect(tests.fx('B'), 'insert into public.messages (conversation_id, sender_id, body) values (' || tests.l('C1') || ',' || tests.l('F') || $$, 'spoof')$$, 'err:42501', 'messages: cannot send as the other participant');
select tests.expect(tests.fx('F'), 'update public.messages set read_at = now() where id = ' || tests.l('M1'), 'n:1', 'messages: a participant marks a message read');
select tests.expect(tests.fx('B2'), 'update public.messages set read_at = now() where id = ' || tests.l('M1'), 'n:0', 'messages: a stranger updates nothing');
-- A7 (G1): a redaction writes exactly the API's marker; the wider cases are in 20261023080000_admin_moderation.test.sql.
select tests.expect(tests.fx('A'), $$update public.messages set body = '[removed by moderator]' where id = $$ || tests.l('M1'), 'n:0', 'messages: an admin without a second factor cannot redact');
select tests.expect(tests.fx('A'), $$update public.messages set body = '[redacted]' where id = $$ || tests.l('M1'), 'err:42501', 'messages: an admin cannot write other words as a redaction', 'aal2');
select tests.expect(tests.fx('A'), $$update public.messages set body = '[removed by moderator]' where id = $$ || tests.l('M1'), 'n:1', 'messages: an admin with a second factor redacts', 'aal2');

-- notifications ----------------------------------------------------------------------------------------
select tests.expect(tests.fx('B'), 'select id from public.notifications where id = ' || tests.l('N1'), 'rows:1', 'notifications: the owner reads theirs');
select tests.expect(tests.fx('B2'), 'select id from public.notifications where id = ' || tests.l('N1'), 'rows:0', 'notifications: another user does not');
select tests.expect(tests.fx('A'), 'select id from public.notifications where id = ' || tests.l('N1'), 'rows:0', 'notifications: not even an admin');
select tests.expect(tests.fx('B'), 'update public.notifications set read = true where id = ' || tests.l('N1'), 'n:1', 'notifications: the owner marks it read');
select tests.expect(tests.fx('B2'), 'update public.notifications set read = true where id = ' || tests.l('N1'), 'n:0', 'notifications: another user cannot');
select tests.expect(tests.fx('B'), 'insert into public.notifications (user_id, type) values (' || tests.l('B') || $$, 'forged')$$, 'err:42501', 'notifications: clients cannot create them (triggers only)');

-- consultations ----------------------------------------------------------------------------------------
select tests.expect(tests.fx('B'), 'select id from public.consultations where id = ' || tests.l('CONS1'), 'rows:1', 'consultations: the requester reads it');
select tests.expect(tests.fx('E'), 'select id from public.consultations where id = ' || tests.l('CONS1'), 'rows:1', 'consultations: the expert reads it');
select tests.expect(tests.fx('A'), 'select id from public.consultations where id = ' || tests.l('CONS1'), 'rows:1', 'consultations: an admin reads it');
select tests.expect(tests.fx('B2'), 'select id from public.consultations where id = ' || tests.l('CONS1'), 'rows:0', 'consultations: a stranger does not');
select tests.expect(tests.fx('B'), 'insert into public.consultations (user_id, expert_id, subject) values (' || tests.l('B') || ',' || tests.l('E') || $$, 'New question')$$, 'n:1', 'consultations: a user requests one from a verified expert');
select tests.expect(tests.fx('B'), 'insert into public.consultations (user_id, expert_id, subject) values (' || tests.l('B2') || ',' || tests.l('E') || $$, 'Forged')$$, 'err:42501', 'consultations: cannot request as someone else');
select tests.expect(tests.fx('S'), 'insert into public.consultations (user_id, expert_id, subject) values (' || tests.l('S') || ',' || tests.l('E') || $$, 'Suspended')$$, 'err:42501', 'consultations: a suspended user cannot');
select tests.expect(tests.fx('B'), $$update public.consultations set subject = 'Edited' where id = $$ || tests.l('CONS1'), 'err:42501', 'consultations: the subject cannot be rewritten after the request');
select tests.expect(tests.fx('E'), $$update public.consultations set subject = 'Edited by expert' where id = $$ || tests.l('CONS1'), 'err:42501', 'consultations: nor by the expert');
-- A7: the admin reaches a consultation only with a second factor, and then the guard still refuses a rewrite.
select tests.expect(tests.fx('A'), $$update public.consultations set subject = 'Edited by admin' where id = $$ || tests.l('CONS1'), 'n:0', 'consultations: an admin without a second factor does not reach it');
select tests.expect(tests.fx('A'), $$update public.consultations set subject = 'Edited by admin' where id = $$ || tests.l('CONS1'), 'err:42501', 'consultations: nor by an admin', 'aal2');
select tests.expect(tests.fx('B2'), $$update public.consultations set subject = 'Hijack' where id = $$ || tests.l('CONS1'), 'n:0', 'consultations: a stranger updates nothing');

-- consultation guard (guard_consultations_update, consultations_insert_requester) ------------------------
select tests.expect(tests.fx('B'), 'insert into public.consultations (user_id, expert_id, subject) values (' || tests.l('B') || ',' || tests.l('E2') || $$, 'To a pending expert')$$, 'err:42501', 'consultations: cannot be requested from an expert who is not verified');
select tests.expect(tests.fx('B'), 'insert into public.consultations (user_id, subject) values (' || tests.l('B') || $$, 'No expert')$$, 'err:42501', 'consultations: nor without an expert');
select tests.expect(tests.fx('B'), 'insert into public.consultations (user_id, expert_id, subject, status) values (' || tests.l('B') || ',' || tests.l('E') || $$, 'Already done', 'resolved')$$, 'err:42501', 'consultations: a request cannot start in any status but requested');
select tests.expect(tests.fx('E'), 'insert into public.consultations (user_id, expert_id, subject) values (' || tests.l('E') || ',' || tests.l('E') || $$, 'Myself')$$, 'err:42501', 'consultations: an expert cannot consult themselves');
select tests.expect(tests.fx('B2'), $$update public.consultations set status = 'accepted' where id = $$ || tests.l('CONS1'), 'n:0', 'consultation guard: a stranger changes nothing');
select tests.expect(tests.fx('B'), $$update public.consultations set status = 'accepted' where id = $$ || tests.l('CONS1'), 'err:42501', 'consultation guard: the requester cannot accept their own request');
select tests.expect(tests.fx('E'), $$update public.consultations set status = 'resolved' where id = $$ || tests.l('CONS1'), 'err:23514', 'consultation guard: no skipping steps');
select tests.expect(tests.fx('E'), $$update public.consultations set status = 'accepted' where id = $$ || tests.l('CONS1'), 'n:1', 'consultation guard: the expert accepts');
select tests.expect(tests.fx('B'), $$update public.consultations set status = 'in_progress' where id = $$ || tests.l('CONS1'), 'err:42501', 'consultation guard: the requester cannot start it');
select tests.expect(tests.fx('E'), $$update public.consultations set status = 'in_progress' where id = $$ || tests.l('CONS1'), 'n:1', 'consultation guard: the expert starts it');
select tests.expect(tests.fx('B'), $$update public.consultations set status = 'resolved' where id = $$ || tests.l('CONS1'), 'err:42501', 'consultation guard: the requester cannot resolve it');
select tests.expect(tests.fx('E'), $$update public.consultations set status = 'resolved' where id = $$ || tests.l('CONS1'), 'n:1', 'consultation guard: the expert resolves it');
select tests.expect(tests.fx('E'), $$update public.consultations set status = 'closed' where id = $$ || tests.l('CONS1'), 'err:42501', 'consultation guard: the expert cannot close it');
select tests.expect(tests.fx('B'), $$update public.consultations set status = 'closed' where id = $$ || tests.l('CONS1'), 'n:1', 'consultation guard: the requester closes it');
select tests.expect(tests.fx('B'), $$update public.consultations set images = array['a.jpg'] where id = $$ || tests.l('CONS1'), 'n:1', 'consultation guard: the requester attaches photos');
select tests.expect(tests.fx('E'), $$update public.consultations set images = array['b.jpg'] where id = $$ || tests.l('CONS1'), 'err:42501', 'consultation guard: the expert cannot');
select tests.expect(tests.fx('E'), 'insert into public.consultation_messages (consultation_id, sender_id, body) values (' || tests.l('CONS_REJ') || ',' || tests.l('E') || $$, 'late')$$, 'err:42501', 'consultation_messages: no messages on a rejected consultation');


-- consultation messages --------------------------------------------------------------------------------
select tests.expect(tests.fx('B'), 'select id from public.consultation_messages where id = ' || tests.l('CM1'), 'rows:1', 'consultation_messages: the requester reads it');
select tests.expect(tests.fx('E'), 'select id from public.consultation_messages where id = ' || tests.l('CM1'), 'rows:1', 'consultation_messages: the expert reads it');
select tests.expect(tests.fx('A'), 'select id from public.consultation_messages where id = ' || tests.l('CM1'), 'rows:1', 'consultation_messages: an admin reads it');
select tests.expect(tests.fx('B2'), 'select id from public.consultation_messages where id = ' || tests.l('CM1'), 'rows:0', 'consultation_messages: a stranger does not');
select tests.expect(tests.fx('E'), 'insert into public.consultation_messages (consultation_id, sender_id, body) values (' || tests.l('CONS1') || ',' || tests.l('E') || $$, 'advice')$$, 'n:1', 'consultation_messages: the expert replies');
select tests.expect(tests.fx('B2'), 'insert into public.consultation_messages (consultation_id, sender_id, body) values (' || tests.l('CONS1') || ',' || tests.l('B2') || $$, 'intruder')$$, 'err:42501', 'consultation_messages: a stranger cannot');
select tests.expect(tests.fx('B'), 'insert into public.consultation_messages (consultation_id, sender_id, body) values (' || tests.l('CONS1') || ',' || tests.l('E') || $$, 'spoof')$$, 'err:42501', 'consultation_messages: cannot send as the expert');


-- suspended owners: still able to read, never to write ---------------------------------------------------
select tests.suspended_world();
select tests.expect(tests.fx('SF'), 'select id from public.notifications where id = ' || tests.l('SN'), 'rows:1', 'notifications: a suspended user still reads theirs');
select tests.expect(tests.fx('SF'), 'update public.notifications set read = true where id = ' || tests.l('SN'), 'n:0', 'notifications: but cannot mark them read');
select tests.expect(tests.fx('SF'), 'select id from public.consultations where id = ' || tests.l('SCONS'), 'rows:1', 'consultations: a suspended requester still reads theirs');
select tests.expect(tests.fx('SF'), $$update public.consultations set subject = 'Edited' where id = $$ || tests.l('SCONS'), 'n:0', 'consultations: but cannot update it');

select * from finish();
rollback;
