-- P6 (item 1): the queries measured before and after. Each runs as a real signed-in role through RLS.
-- Bench user 401 is a buyer with many orders; user 1 is a farmer (seller) with many orders and conversations.
\set QUIET on
\pset format unaligned
\pset tuples_only on

\echo === orders, buyer view (newest 50)
begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000401","role":"authenticated"}', true);
explain (analyze, timing off, summary on) select * from public.orders order by created_at desc limit 50;
rollback;

\echo === order_items visible to the buyer (policy joins orders)
begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000401","role":"authenticated"}', true);
explain (analyze, timing off, summary on) select count(*) from public.order_items;
rollback;

\echo === orders, seller view
begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
explain (analyze, timing off, summary on) select * from public.orders where seller_id = '00000000-0000-4000-8000-000000000001' order by created_at desc limit 50;
rollback;

\echo === marketplace browse as anon (newest 20 active listings)
begin; set local role anon;
explain (analyze, timing off, summary on) select * from public.listings where status = 'active' order by created_at desc limit 20;
rollback;

\echo === chat history of one conversation (newest 50)
begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
explain (analyze, timing off, summary on) select * from public.messages where conversation_id = (select id from public.conversations where participant_two = '00000000-0000-4000-8000-000000000001' limit 1) order by created_at desc limit 50;
rollback;

\echo === all messages visible to a seller (policy joins conversations)
begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
explain (analyze, timing off, summary on) select count(*) from public.messages;
rollback;

\echo === notifications inbox (newest 50)
begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000401","role":"authenticated"}', true);
explain (analyze, timing off, summary on) select * from public.notifications where user_id = '00000000-0000-4000-8000-000000000401' order by created_at desc limit 50;
rollback;
