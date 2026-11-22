-- Pair for migration 20261020080000_conversation_context.sql (A5; SRDS §30, D12): a conversation is opened only on a
-- legitimate relationship, a listing (the asker towards its owner), an order (its buyer and its seller) or a
-- consultation (its requester and its assigned expert), and the row records which. Every allowed pair below has a
-- refused neighbour that differs in one thing: the context type, the context id, the direction, or the caller's
-- account. Every allowed insert uses a pair that has no conversation yet (conversations_participants_idx), so a
-- refusal can only come from the policy.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();
select tests.world();
select tests.approval_world();

-- fixtures, made as the owner: B3 a buyer nobody is related to; E2 a second approved expert; OA an order B2 bought from
-- dealer D; OB an order dealer D2 bought from farmer F2; CONSF2 a consultation F2 asked of expert E
do $$
declare b3 uuid; e2 uuid; oa uuid; ob uuid; consf2 uuid;
begin
  b3 := tests.make_user('B3', 'buyer');
  e2 := tests.make_user('E2', 'expert');
  perform tests.approve(array[e2]);
  insert into public.experts (id, verification_status) values (e2, 'approved');
  insert into public.orders (buyer_id, seller_id, product_subtotal, delivery_charge)
    values (tests.fx('B2'), tests.fx('D'), 50, 0) returning id into oa;
  insert into public.orders (buyer_id, seller_id, product_subtotal, delivery_charge)
    values (tests.fx('D2'), tests.fx('F2'), 100, 10) returning id into ob;
  insert into public.consultations (user_id, expert_id, subject)
    values (tests.fx('F2'), tests.fx('E'), 'Leaf spots') returning id into consf2;
  insert into tests.fixtures values ('OA', oa), ('OB', ob), ('CONSF2', consf2);
end $$;

-- A conversation insert as a statement: caller-side participant first, then the other, then the context.
create function tests.conv(_one text, _two text, _type text, _ctx text) returns text language sql stable as $$
  select format(
    'insert into public.conversations (participant_one, participant_two, context_type, context_id) values (%s, %s, %s, %s)',
    tests.l(_one), tests.l(_two),
    coalesce(quote_literal(_type) || '::public.conversation_context', 'null'),
    coalesce(tests.l(_ctx), 'null'))
$$;

-- Structure ----------------------------------------------------------------------------------------------------------
select is(enum_range(null::public.conversation_context)::text, '{listing,order,consultation}',
  'conversation_context: listing, order, consultation');
select col_type_is('public', 'conversations', 'context_type', 'conversation_context', 'conversations.context_type is the enum');
select col_type_is('public', 'conversations', 'context_id', 'uuid', 'conversations.context_id is a uuid');
select col_is_null('public', 'conversations', 'context_type', 'context_type is nullable (pre-A5 rows keep null)');
select col_is_null('public', 'conversations', 'context_id', 'context_id is nullable (pre-A5 rows keep null)');
select throws_ok(
  format('insert into public.conversations (participant_one, participant_two, context_type) values (%s, %s, %L)',
    tests.l('B3'), tests.l('F'), 'listing'),
  '23514', null, 'conversations_context_pair: a type without an id is refused, even for the owner');
select throws_ok(
  format('insert into public.conversations (participant_one, participant_two, context_id) values (%s, %s, %s)',
    tests.l('B3'), tests.l('F'), tests.l('L1')),
  '23514', null, 'conversations_context_pair: an id without a type is refused, even for the owner');

-- The helper: definer with a fixed search_path, callable by signed-in users only
select ok(
  (select p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=public, pg_temp')
     from pg_proc p where p.oid = 'public.conversation_context_allowed(public.conversation_context, uuid, uuid)'::regprocedure),
  'conversation_context_allowed: security definer with search_path = public, pg_temp');
select ok(has_function_privilege('authenticated',
  'public.conversation_context_allowed(public.conversation_context, uuid, uuid)', 'execute'),
  'conversation_context_allowed: authenticated may call it');
select ok(not has_function_privilege('anon',
  'public.conversation_context_allowed(public.conversation_context, uuid, uuid)', 'execute'),
  'conversation_context_allowed: anon may not');
select tests.expect(null,
  format('select 1 where public.conversation_context_allowed(%L, %s, %s)', 'listing', tests.l('L1'), tests.l('F')),
  'err:42501', 'conversation_context_allowed: an anon call is refused');
select tests.expect(null, tests.conv('B3', 'F', 'listing', 'L1'), 'err:42501', 'conversations: anon cannot start one');

-- Refused: no context, an unrelated pair with each context type, a context that exists but does not relate the two ------
select tests.expect(tests.fx('B2'), tests.conv('B2', 'B3', null, null), 'err:42501', 'refused: no context at all');
select tests.expect(tests.fx('B2'), tests.conv('B2', 'D2', 'listing', 'L1'), 'err:42501', 'refused: unrelated pair, listing context (L1 is F''s)');
select tests.expect(tests.fx('B2'), tests.conv('B2', 'D2', 'order', 'O1'), 'err:42501', 'refused: unrelated pair, order context');
select tests.expect(tests.fx('B2'), tests.conv('B2', 'D2', 'consultation', 'CONS1'), 'err:42501', 'refused: unrelated pair, consultation context');
select tests.expect(tests.fx('B'), tests.conv('B', 'F2', 'listing', 'LD1'), 'err:42501', 'refused: a listing that is not the other person''s (LD1 is D''s)');
select tests.expect(tests.fx('B'), tests.conv('B', 'D', 'order', 'O1'), 'err:42501', 'refused: the caller''s own order, but the other is not its seller');
select tests.expect(tests.fx('B'), tests.conv('B', 'D', 'consultation', 'CONS1'), 'err:42501', 'refused: the caller''s own consultation, but the other is not its expert');
select tests.expect(tests.fx('B2'), tests.conv('B2', 'F', 'order', 'O1'), 'err:42501', 'refused: another user''s order id (O1 is B''s with F)');
select tests.expect(tests.fx('B'), tests.conv('B', 'E2', 'consultation', 'CONS1'), 'err:42501', 'refused: a consultation whose expert is someone else');
select tests.expect(tests.fx('B2'), tests.conv('B2', 'B3', 'listing', 'L1'), 'err:42501', 'refused: the context relates the caller, but not the participant named');
select tests.expect(tests.fx('B2'), tests.conv('F', 'D2', 'listing', 'L1'), 'err:42501', 'refused: a conversation between two others, even with a real context');

-- Refused: a listing owner cold-messaging someone from their own listing, either column order
select tests.expect(tests.fx('F'), tests.conv('F', 'B3', 'listing', 'L1'), 'err:42501', 'refused: the owner cannot open a thread from their own listing');
select tests.expect(tests.fx('F'), tests.conv('B3', 'F', 'listing', 'L1'), 'err:42501', 'refused: nor by naming themselves the second participant');

-- Refused: a pending or suspended account, with a context that would otherwise be valid
select tests.expect(tests.fx('PD'), tests.conv('PD', 'F', 'listing', 'L1'), 'err:42501', 'refused: a pending dealer, on a valid listing inquiry');
select tests.expect(tests.fx('S'), tests.conv('S', 'F', 'listing', 'L1'), 'err:42501', 'refused: a suspended user, on a valid listing inquiry');
select tests.expect(tests.fx('B2'), tests.conv('B2', 'F', 'listing', 'L2'), 'err:42501', 'refused: a hidden (inactive) listing is no context, so its owner cannot be confirmed by id');

-- Allowed: every SRDS §30 pair ------------------------------------------------------------------------------------------
select tests.expect(tests.fx('B2'), tests.conv('B2', 'F', 'listing', 'L1'), 'n:1', 'allowed: a buyer asks about a listing, towards its owner');
select tests.expect(tests.fx('F2'), tests.conv('F2', 'D', 'listing', 'LD1'), 'n:1', 'allowed: a farmer asks about a dealer''s listing');
select tests.expect(tests.fx('D2'), tests.conv('D2', 'F', 'listing', 'L1'), 'n:1', 'allowed: a dealer asks about a farmer''s listing');
select tests.expect(tests.fx('B2'), tests.conv('D', 'B2', 'order', 'OA'), 'n:1', 'allowed: an order''s buyer opens it with the seller (caller as participant_two)');
select tests.expect(tests.fx('F2'), tests.conv('F2', 'D2', 'order', 'OB'), 'n:1', 'allowed: an order''s seller opens it with the buyer');
select tests.expect(tests.fx('B'), tests.conv('B', 'E', 'consultation', 'CONS1'), 'n:1', 'allowed: a requester opens it with the assigned expert');
select tests.expect(tests.fx('E'), tests.conv('E', 'F2', 'consultation', 'CONSF2'), 'n:1', 'allowed: the assigned expert opens it with the requester');
select is(
  (select context_type::text || ':' || (context_id = tests.fx('LD1'))::text from public.conversations
    where participant_one = tests.fx('F2') and participant_two = tests.fx('D')),
  'listing:true', 'the new row records its context');

-- Pre-A5 conversations (null context) stay readable by their participants, and only by them
select is((select context_type from public.conversations where id = tests.fx('C1')), null, 'C1 is a pre-A5 row with no context');
select tests.expect(tests.fx('B'), 'select id from public.conversations where id = ' || tests.l('C1'), 'rows:1', 'pre-A5: a participant still reads it');
select tests.expect(tests.fx('F'), 'select id from public.conversations where id = ' || tests.l('C1'), 'rows:1', 'pre-A5: the other participant still reads it');
select tests.expect(tests.fx('B2'), 'select id from public.conversations where id = ' || tests.l('C1'), 'rows:0', 'pre-A5: a stranger does not');
select tests.expect(tests.fx('F'), 'insert into public.messages (conversation_id, sender_id, body) values (' || tests.l('C1') || ',' || tests.l('F') || $$, 'still here')$$, 'n:1', 'pre-A5: a participant still sends in it');

select * from finish();
rollback;
