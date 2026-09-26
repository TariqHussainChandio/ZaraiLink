-- P6 (item 1): disposable benchmark data for the before/after EXPLAIN comparison.
--
-- LOCAL STACK ONLY. It inserts fake users and rows in bulk, so it must never be run against a real project
-- (AGENTS.md: no dummy data in a real project). `supabase db reset` removes all of it.
-- Triggers are switched off for the load (session_replication_role) so 60k orders do not generate 60k
-- notifications; the shapes and volumes below are what the policies are measured against.
set session_replication_role = replica;

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'authenticated', 'authenticated',
       'bench' || g || '@example.test', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 2000) g;

insert into public.profiles (id, role, full_name)
select ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       case when g <= 400 then 'farmer' when g = 2000 then 'admin' else 'buyer' end::public.user_role,
       'Bench User ' || g
from generate_series(1, 2000) g;

insert into public.listings (owner_id, category_id, title, price, quantity, status, seller_role)
select ('00000000-0000-4000-8000-' || lpad((1 + (g % 400))::text, 12, '0'))::uuid,
       (select id from public.categories order by id limit 1),
       'Listing ' || g, 100 + (g % 900), 50,
       case when g % 5 = 0 then 'inactive' else 'active' end::public.listing_status, 'farmer'
from generate_series(1, 20000) g;

insert into public.orders (buyer_id, seller_id, status, product_subtotal, delivery_charge, created_at)
select ('00000000-0000-4000-8000-' || lpad((401 + (g % 1599))::text, 12, '0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((1 + (g % 400))::text, 12, '0'))::uuid,
       'pending', 500 + (g % 500), 50, now() - (g || ' minutes')::interval
from generate_series(1, 60000) g;

with l as (select array_agg(id order by id) as ids from public.listings)
insert into public.order_items (order_id, listing_id, quantity, unit_price)
select o.id, l.ids[1 + ((row_number() over ())::int % 20000)], 1, 100
from public.orders o cross join l, generate_series(1, 2) k;

insert into public.conversations (participant_one, participant_two)
select ('00000000-0000-4000-8000-' || lpad((401 + (g % 1599))::text, 12, '0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((1 + (g % 400))::text, 12, '0'))::uuid
from generate_series(1, 3000) g
on conflict do nothing;

insert into public.messages (conversation_id, sender_id, body, created_at)
select c.id, c.participant_one, 'message ' || g, now() - (g || ' seconds')::interval
from (select id, participant_one from public.conversations) c, generate_series(1, 60) g;

insert into public.notifications (user_id, type, payload, read, created_at)
select ('00000000-0000-4000-8000-' || lpad((1 + (g % 2000))::text, 12, '0'))::uuid, 'new_order', '{}'::jsonb,
       g % 3 = 0, now() - (g || ' seconds')::interval
from generate_series(1, 150000) g;

set session_replication_role = origin;
analyze;
