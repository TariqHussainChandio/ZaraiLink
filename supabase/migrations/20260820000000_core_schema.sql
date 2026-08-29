-- Core application schema: profiles, categories, listings, orders, messaging.
-- The `ensure_rls` event trigger (see 20260808205410_remote_schema.sql) auto-enables RLS on
-- every new table, so each table below ships explicit policies. `api.auto_expose_new_tables`
-- is unset in supabase/config.toml (the new not-auto-exposed default), so each table also needs
-- explicit GRANTs to anon/authenticated or PostgREST will not serve it at all, RLS aside.

-- ── Shared helpers ──────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create type public.user_role as enum ('farmer', 'buyer', 'dealer', 'expert', 'admin');
create type public.listing_status as enum ('active', 'inactive', 'sold');
create type public.order_status as enum ('pending', 'confirmed', 'fulfilled', 'cancelled');

-- ── profiles ─────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'buyer',
  full_name text not null,
  phone text,
  avatar_url text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'buyer'),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

grant select, insert, update on public.profiles to authenticated;
grant select on public.profiles to anon;

-- ── categories ───────────────────────────────────────────────────────────

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  icon text,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "categories_select_all"
  on public.categories for select
  using (true);

create policy "categories_admin_write"
  on public.categories for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;

-- ── listings ─────────────────────────────────────────────────────────────

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  title text not null,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  unit text not null default 'unit',
  quantity numeric(12, 2) not null default 0 check (quantity >= 0),
  images text[] not null default '{}',
  status public.listing_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listings_owner_id_idx on public.listings (owner_id);
create index listings_category_id_idx on public.listings (category_id);
create index listings_status_idx on public.listings (status);

create trigger set_listings_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

alter table public.listings enable row level security;

create policy "listings_select_active_or_owner"
  on public.listings for select
  using (status = 'active' or owner_id = auth.uid() or public.is_admin());

create policy "listings_owner_write"
  on public.listings for all
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

grant select on public.listings to anon, authenticated;
grant insert, update, delete on public.listings to authenticated;

-- ── orders ───────────────────────────────────────────────────────────────

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  status public.order_status not null default 'pending',
  total numeric(12, 2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_buyer_id_idx on public.orders (buyer_id);
create index orders_seller_id_idx on public.orders (seller_id);

create trigger set_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;

create policy "orders_select_participants"
  on public.orders for select
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

create policy "orders_insert_buyer"
  on public.orders for insert
  with check (buyer_id = auth.uid());

create policy "orders_update_participants"
  on public.orders for update
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin())
  with check (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

grant select, insert, update on public.orders to authenticated;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);

alter table public.order_items enable row level security;

create policy "order_items_select_participants"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.buyer_id = auth.uid() or o.seller_id = auth.uid() or public.is_admin())
    )
  );

create policy "order_items_insert_buyer"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.buyer_id = auth.uid()
    )
  );

grant select, insert on public.order_items to authenticated;

-- ── messaging ────────────────────────────────────────────────────────────

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_one uuid not null references public.profiles (id) on delete cascade,
  participant_two uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_distinct_participants check (participant_one <> participant_two)
);

create unique index conversations_participants_idx
  on public.conversations (least(participant_one, participant_two), greatest(participant_one, participant_two));

alter table public.conversations enable row level security;

create policy "conversations_select_participants"
  on public.conversations for select
  using (participant_one = auth.uid() or participant_two = auth.uid());

create policy "conversations_insert_participant"
  on public.conversations for insert
  with check (participant_one = auth.uid() or participant_two = auth.uid());

grant select, insert on public.conversations to authenticated;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages (conversation_id);

alter table public.messages enable row level security;

create policy "messages_select_participants"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    )
  );

create policy "messages_insert_participant"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    )
  );

grant select, insert on public.messages to authenticated;

-- ── storage buckets ──────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true)
on conflict (id) do nothing;

create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and owner = auth.uid());

create policy "avatars_owner_update"
  on storage.objects for update
  using (bucket_id = 'avatars' and owner = auth.uid());

create policy "avatars_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and owner = auth.uid());

create policy "listing_images_public_read"
  on storage.objects for select
  using (bucket_id = 'listing-images');

create policy "listing_images_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'listing-images' and owner = auth.uid());

create policy "listing_images_owner_update"
  on storage.objects for update
  using (bucket_id = 'listing-images' and owner = auth.uid());

create policy "listing_images_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'listing-images' and owner = auth.uid());
