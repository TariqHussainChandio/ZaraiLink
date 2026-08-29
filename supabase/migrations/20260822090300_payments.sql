-- SRDS v4.0 Module 4 (Payments, §14; BR-11/BR-12/BR-14). Purely additive.
-- BR-11: escrow payment is explicitly excluded — no held/escrow balance, no release
-- workflow, and no columns of that shape exist below. `payments` mirrors a standard
-- provider transaction record only. BR-14: card/account credentials are never stored here,
-- only the provider's own transaction reference.

create type public.payment_status as enum (
  'pending', 'processing', 'successful', 'failed', 'cancelled', 'refunded'
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'PKR',
  method text not null,
  provider text not null,
  provider_transaction_ref text,
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_order_id_idx on public.payments (order_id);
create index payments_buyer_id_idx on public.payments (buyer_id);

create trigger set_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;

-- BR-12: payment records must reference the associated order — sellers may read (to see
-- payment status on their own orders) but only the buyer or the backend service-role writes.
create policy "payments_select_order_participants"
  on public.payments for select
  using (
    buyer_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid())
  );

create policy "payments_insert_buyer"
  on public.payments for insert
  with check (buyer_id = auth.uid());

grant select, insert on public.payments to authenticated;

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index payment_transactions_payment_id_idx on public.payment_transactions (payment_id);

alter table public.payment_transactions enable row level security;

-- Append-only provider event log; only readable by the payment's buyer/admin, written only
-- by the backend service-role (which bypasses RLS), never by the mobile client.
create policy "payment_transactions_select_owner_or_admin"
  on public.payment_transactions for select
  using (
    exists (
      select 1 from public.payments p
      where p.id = payment_id and (p.buyer_id = auth.uid() or public.is_admin())
    )
  );

grant select on public.payment_transactions to authenticated;
