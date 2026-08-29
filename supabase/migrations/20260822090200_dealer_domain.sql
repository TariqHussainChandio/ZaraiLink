-- SRDS v4.0 Module 4 (Dealer domain, §9; BR-03/BR-04). Purely additive.
-- Every policy here scopes by dealer_id = auth.uid(), never by role alone — this is the
-- concrete implementation of the §48 example documented in docs/architecture/authorization-model.md
-- ("a dealer must not be able to modify another dealer's inventory merely because the user is
-- authenticated as a dealer"). Farmers are never granted access to these tables (BR-04).

create type public.inventory_transaction_type as enum (
  'addition', 'reduction', 'adjustment', 'sale', 'restock', 'correction'
);

create table public.dealer_stores (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  address text,
  location jsonb,
  contact text,
  opening_info text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dealer_stores_dealer_id_idx on public.dealer_stores (dealer_id);

create trigger set_dealer_stores_updated_at
  before update on public.dealer_stores
  for each row execute function public.set_updated_at();

alter table public.dealer_stores enable row level security;

create policy "dealer_stores_select_owner_or_admin"
  on public.dealer_stores for select
  using (dealer_id = auth.uid() or public.is_admin());

create policy "dealer_stores_owner_write"
  on public.dealer_stores for all
  using (dealer_id = auth.uid() or public.is_admin())
  with check (dealer_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.dealer_stores to authenticated;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  contact text,
  products_supplied text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index suppliers_dealer_id_idx on public.suppliers (dealer_id);

create trigger set_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;

create policy "suppliers_select_owner_or_admin"
  on public.suppliers for select
  using (dealer_id = auth.uid() or public.is_admin());

create policy "suppliers_owner_write"
  on public.suppliers for all
  using (dealer_id = auth.uid() or public.is_admin())
  with check (dealer_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.suppliers to authenticated;

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  stock_quantity numeric(12, 2) not null default 0 check (stock_quantity >= 0),
  unit text not null default 'unit',
  purchase_cost numeric(12, 2) check (purchase_cost >= 0),
  selling_price numeric(12, 2) check (selling_price >= 0),
  min_stock_threshold numeric(12, 2) not null default 0 check (min_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inventory_dealer_id_idx on public.inventory (dealer_id);
create index inventory_listing_id_idx on public.inventory (listing_id);

create trigger set_inventory_updated_at
  before update on public.inventory
  for each row execute function public.set_updated_at();

alter table public.inventory enable row level security;

create policy "inventory_select_owner_or_admin"
  on public.inventory for select
  using (dealer_id = auth.uid() or public.is_admin());

create policy "inventory_owner_write"
  on public.inventory for all
  using (dealer_id = auth.uid() or public.is_admin())
  with check (dealer_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.inventory to authenticated;

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory (id) on delete cascade,
  type public.inventory_transaction_type not null,
  quantity numeric(12, 2) not null,
  actor uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index inventory_transactions_inventory_id_idx on public.inventory_transactions (inventory_id);

alter table public.inventory_transactions enable row level security;

create policy "inventory_transactions_select_owner_or_admin"
  on public.inventory_transactions for select
  using (
    exists (
      select 1 from public.inventory i
      where i.id = inventory_id and (i.dealer_id = auth.uid() or public.is_admin())
    )
  );

create policy "inventory_transactions_owner_insert"
  on public.inventory_transactions for insert
  with check (
    exists (
      select 1 from public.inventory i
      where i.id = inventory_id and (i.dealer_id = auth.uid() or public.is_admin())
    )
  );

grant select, insert on public.inventory_transactions to authenticated;
