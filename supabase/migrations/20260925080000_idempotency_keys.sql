-- P5 (item 6): idempotency for the two create-money-adjacent endpoints (order checkout, payment
-- initiation). A client retrying after a dropped connection must get the original result, not a
-- second order or payment (BR-09/BR-11 stay intact: this stores our own response, nothing about funds).
--
-- The row is CLAIMED before the work runs (response_* still null) and completed afterwards, so two
-- concurrent requests carrying the same key cannot both create an order: the second hits the unique
-- index and is told the first is still in flight.

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 8 and 128),
  endpoint text not null,
  response_status int,
  response_body jsonb,
  created_at timestamptz not null default now()
);

-- One key per user per endpoint: the same key on a different endpoint, or from a different user, is
-- an unrelated request.
create unique index idempotency_keys_user_key_endpoint_key
  on public.idempotency_keys (user_id, key, endpoint);

-- The lazy 24h sweep filters on this; user_id is covered by the unique index's leading column.
create index idempotency_keys_created_at_idx on public.idempotency_keys (created_at);

alter table public.idempotency_keys enable row level security;

-- Own rows only. No service-role access is needed: the backend acts as the calling user.
create policy idempotency_keys_owner_all on public.idempotency_keys
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.idempotency_keys to authenticated;
