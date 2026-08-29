-- SRDS v4.0 Module 4 (Marketplace extensions + Order lifecycle/BR-09).
-- Adds listing discovery fields, splits order total into an explicit product subtotal +
-- delivery charge (BR-09: delivery charge is never folded into product price), widens
-- order_status to the full SRDS §12.2 lifecycle, and records status transitions.

-- ── listings: discovery fields (§7.2) ───────────────────────────────────────

alter table public.listings add column crop_compatibility text[] not null default '{}';
alter table public.listings add column brand text;
alter table public.listings add column condition text;
alter table public.listings add column location jsonb;
alter table public.listings add column seller_role public.user_role;

comment on column public.listings.seller_role is
  'Denormalized from profiles.role at insert time (see set_listings_seller_role trigger) so marketplace filtering by seller type does not need a join.';

create index listings_seller_role_idx on public.listings (seller_role);

create or replace function public.set_listings_seller_role()
returns trigger
language plpgsql
as $$
begin
  select role into new.seller_role from public.profiles where id = new.owner_id;
  return new;
end;
$$;

create trigger set_listings_seller_role
  before insert on public.listings
  for each row execute function public.set_listings_seller_role();

-- Backfill existing rows (none expected pre-launch, but keeps the column consistent).
update public.listings l
set seller_role = p.role
from public.profiles p
where p.id = l.owner_id and l.seller_role is null;

-- ── orders: explicit delivery charge (BR-09) ────────────────────────────────

alter table public.orders rename column total to product_subtotal;
alter table public.orders add column delivery_charge numeric(12, 2) not null default 0 check (delivery_charge >= 0);
alter table public.orders add column total numeric(12, 2) generated always as (product_subtotal + delivery_charge) stored;

comment on column public.orders.product_subtotal is 'Sum of order_items. Never includes delivery_charge (BR-09).';
comment on column public.orders.delivery_charge is 'Separately agreed delivery amount; 0 when delivery is coordinated/paid outside the platform (SRDS §13.1 Option A).';
comment on column public.orders.total is 'Generated: product_subtotal + delivery_charge. Never write to this column directly.';

-- ── order_status: full lifecycle (SRDS §12.2) ───────────────────────────────

alter type public.order_status rename value 'fulfilled' to 'completed';
alter type public.order_status add value 'processing';
alter type public.order_status add value 'ready';
alter type public.order_status add value 'rejected';
alter type public.order_status add value 'payment_failed';
alter type public.order_status add value 'disputed';
alter type public.order_status add value 'refunded';

-- ── order_status_history (§12.2 auditability) ───────────────────────────────

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index order_status_history_order_id_idx on public.order_status_history (order_id);

alter table public.order_status_history enable row level security;

create policy "order_status_history_select_participants"
  on public.order_status_history for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.buyer_id = auth.uid() or o.seller_id = auth.uid() or public.is_admin())
    )
  );

create policy "order_status_history_insert_participants"
  on public.order_status_history for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.buyer_id = auth.uid() or o.seller_id = auth.uid() or public.is_admin())
    )
  );

grant select, insert on public.order_status_history to authenticated;
