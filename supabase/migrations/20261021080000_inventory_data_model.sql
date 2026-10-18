-- B1: the dealer Inventory Management System's own data model (SRDS §15-§25, docs/plan-inventory.md §2). Products are
-- separate from marketplace listings, stock is kept per product per storage location, and every change is a row in a
-- ledger with its source (the nine SRDS §24 sources), so stock can always be reconciled (§25).
--
-- Every table is private to its dealer (BR-03/04, §50): row-level security is the owning, approved dealer and nothing
-- else, with no admin branch (B0). Stock and the ledger have no client write grant at all: they change only through the
-- SECURITY DEFINER functions below, which lock the stock row, check the quantity, update it and write the movement in one
-- transaction.
--
-- The existing tables (dealer_stores, suppliers, inventory, inventory_transactions) are carried over with their ids kept,
-- and stay in place: the current API and the A4 dispatch trigger still use them until B2 moves the routes and B3 moves
-- dispatch onto apply_dispatch_event.

-- ---------------------------------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------------------------------

create type public.inventory_movement_source as enum (
  'ZARAILINK_ORDER', 'LOCAL_SALE', 'PURCHASE', 'RESTOCK', 'MANUAL_ADJUSTMENT', 'DAMAGE', 'EXPIRY', 'TRANSFER', 'OTHER'
);
create type public.inventory_movement_direction as enum ('in', 'out');

-- ---------------------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------------------

-- Every numeric check also refuses NaN: Postgres sorts NaN above every number and treats NaN = NaN as true, so
-- `quantity > 0` and the ledger balance check would both accept it.
--
-- The columns a dealer writes directly (product prices and threshold, purchase lines, the alert default) are plain
-- `numeric` with a two-decimal check instead of numeric(12, 2): a typmod rounds 1.005 to 1.01 before any check or trigger
-- sees it, so a client could not be told its figure was too fine. The check also bounds the value to what
-- numeric(12, 2) holds (and so refuses 'Infinity'). Stock and the ledger stay numeric(12, 2): only the functions below
-- write them, after the same checks.

-- The dealer's own storage places. Exactly one is the default: marketplace dispatches take stock from it.
create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'shop' check (kind in ('shop', 'godown', 'shelf', 'other')),
  address text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inventory_locations_dealer_id_idx on public.inventory_locations (dealer_id);
create unique index inventory_locations_one_default_idx on public.inventory_locations (dealer_id) where is_default;

create table public.inventory_suppliers (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  contact text,
  products_supplied text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inventory_suppliers_dealer_id_idx on public.inventory_suppliers (dealer_id);

create table public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  sku text not null check (length(trim(sku)) > 0),
  name text not null check (length(trim(name)) > 0),
  category_id uuid references public.categories (id) on delete set null,
  unit text not null default 'unit',
  cost_price numeric check (
    cost_price >= 0 and cost_price <> 'NaN' and cost_price = round(cost_price, 2) and cost_price < 10000000000),
  selling_price numeric check (
    selling_price >= 0 and selling_price <> 'NaN' and selling_price = round(selling_price, 2)
    and selling_price < 10000000000),
  reorder_threshold numeric not null default 0 check (
    reorder_threshold >= 0 and reorder_threshold <> 'NaN' and reorder_threshold = round(reorder_threshold, 2)
    and reorder_threshold < 10000000000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_products_dealer_sku_key unique (dealer_id, sku)
);
create index inventory_products_category_id_idx on public.inventory_products (category_id);

-- Quantity per product per location. Never written by a client (no grant): only the movement functions change it.
create table public.inventory_stock (
  product_id uuid not null references public.inventory_products (id) on delete restrict,
  location_id uuid not null references public.inventory_locations (id) on delete restrict,
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  quantity numeric(12, 2) not null default 0 check (quantity >= 0 and quantity <> 'NaN'),
  updated_at timestamptz not null default now(),
  primary key (product_id, location_id)
);
create index inventory_stock_location_id_idx on public.inventory_stock (location_id);
create index inventory_stock_dealer_id_idx on public.inventory_stock (dealer_id);

create table public.inventory_purchases (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  supplier_id uuid references public.inventory_suppliers (id) on delete set null,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'received', 'cancelled')),
  purchased_on date not null default current_date,
  received_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inventory_purchases_dealer_id_idx on public.inventory_purchases (dealer_id);
create index inventory_purchases_supplier_id_idx on public.inventory_purchases (supplier_id);

create table public.inventory_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.inventory_purchases (id) on delete cascade,
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.inventory_products (id) on delete restrict,
  location_id uuid not null references public.inventory_locations (id) on delete restrict,
  quantity numeric not null check (
    quantity > 0 and quantity <> 'NaN' and quantity = round(quantity, 2) and quantity < 10000000000),
  unit_cost numeric check (
    unit_cost >= 0 and unit_cost <> 'NaN' and unit_cost = round(unit_cost, 2) and unit_cost < 10000000000),
  created_at timestamptz not null default now()
);
create index inventory_purchase_items_purchase_id_idx on public.inventory_purchase_items (purchase_id);
create index inventory_purchase_items_dealer_id_idx on public.inventory_purchase_items (dealer_id);
create index inventory_purchase_items_product_id_idx on public.inventory_purchase_items (product_id);
create index inventory_purchase_items_location_id_idx on public.inventory_purchase_items (location_id);

-- The ledger (SRDS §24). Append-only: no client grant, and the functions only ever insert.
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.inventory_products (id) on delete restrict,
  location_id uuid not null references public.inventory_locations (id) on delete restrict,
  direction public.inventory_movement_direction not null,
  source public.inventory_movement_source not null,
  quantity numeric(12, 2) not null check (quantity > 0 and quantity <> 'NaN'),
  quantity_before numeric(12, 2) not null check (quantity_before <> 'NaN'),
  quantity_after numeric(12, 2) not null check (quantity_after <> 'NaN'),
  reason text,
  actor uuid references public.profiles (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  order_item_id uuid references public.order_items (id) on delete set null,
  purchase_id uuid references public.inventory_purchases (id) on delete set null,
  -- The two halves of a transfer share this id.
  transfer_id uuid,
  created_at timestamptz not null default now(),
  constraint inventory_movements_balance check (
    quantity <> 'NaN' and quantity_before <> 'NaN' and quantity_after <> 'NaN'
    and quantity_after = quantity_before + case direction when 'in' then quantity else -quantity end
  ),
  constraint inventory_movements_order_source check (order_item_id is null or source = 'ZARAILINK_ORDER')
);
create index inventory_movements_dealer_id_idx on public.inventory_movements (dealer_id, created_at desc);
create index inventory_movements_product_id_idx on public.inventory_movements (product_id);
create index inventory_movements_location_id_idx on public.inventory_movements (location_id);
create index inventory_movements_actor_idx on public.inventory_movements (actor);
create index inventory_movements_order_id_idx on public.inventory_movements (order_id);
create index inventory_movements_purchase_id_idx on public.inventory_movements (purchase_id);
-- SRDS §21: a marketplace order line is deducted once, however often dispatch is replayed.
create unique index inventory_movements_order_item_once_idx
  on public.inventory_movements (order_item_id) where source = 'ZARAILINK_ORDER';

-- Per-dealer preferences; per-product thresholds live on inventory_products.reorder_threshold.
create table public.inventory_alert_settings (
  dealer_id uuid primary key references public.profiles (id) on delete cascade,
  default_reorder_threshold numeric not null default 0 check (
    default_reorder_threshold >= 0 and default_reorder_threshold <> 'NaN'
    and default_reorder_threshold = round(default_reorder_threshold, 2) and default_reorder_threshold < 10000000000),
  notify_low_stock boolean not null default true,
  notify_sync_failure boolean not null default true,
  updated_at timestamptz not null default now()
);

-- One row per processed dispatch event (B3), so the dealer can see what the marketplace did to their stock.
create table public.inventory_sync_log (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  order_event_id uuid not null references public.order_events (id) on delete cascade,
  status text not null check (status in ('applied', 'skipped_duplicate', 'failed')),
  error text,
  attempts integer not null default 1 check (attempts > 0),
  processed_at timestamptz not null default now(),
  constraint inventory_sync_log_event_key unique (order_event_id)
);
create index inventory_sync_log_dealer_id_idx on public.inventory_sync_log (dealer_id, processed_at desc);

-- D8: a dealer listing's availability comes from the product it is linked to.
alter table public.listings
  add column inventory_product_id uuid references public.inventory_products (id) on delete set null;
create index listings_inventory_product_id_idx on public.listings (inventory_product_id);

-- updated_at
create trigger set_inventory_locations_updated_at before update on public.inventory_locations
  for each row execute function public.set_updated_at();
create trigger set_inventory_suppliers_updated_at before update on public.inventory_suppliers
  for each row execute function public.set_updated_at();
create trigger set_inventory_products_updated_at before update on public.inventory_products
  for each row execute function public.set_updated_at();
create trigger set_inventory_purchases_updated_at before update on public.inventory_purchases
  for each row execute function public.set_updated_at();
create trigger set_inventory_alert_settings_updated_at before update on public.inventory_alert_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------------
-- Ownership guards a policy cannot express: rows that point at other rows must point at the same dealer's rows.
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.guard_inventory_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'inventory_purchases' then
    if new.supplier_id is not null and not exists (
      select 1 from public.inventory_suppliers s where s.id = new.supplier_id and s.dealer_id = new.dealer_id
    ) then
      raise exception 'The supplier is not yours' using errcode = '42501';
    end if;
  elsif tg_table_name = 'inventory_purchase_items' then
    if not exists (
         select 1 from public.inventory_purchases p
          where p.id = new.purchase_id and p.dealer_id = new.dealer_id and p.status = 'draft')
       or not exists (select 1 from public.inventory_products p where p.id = new.product_id and p.dealer_id = new.dealer_id)
       or not exists (select 1 from public.inventory_locations l where l.id = new.location_id and l.dealer_id = new.dealer_id)
    then
      raise exception 'A purchase line must use your own draft purchase, product and location' using errcode = '42501';
    end if;
  elsif tg_table_name = 'listings' then
    -- A listing may feed only from its owner's own product.
    if new.inventory_product_id is not null and not exists (
      select 1 from public.inventory_products p where p.id = new.inventory_product_id and p.dealer_id = new.owner_id
    ) then
      raise exception 'A listing can link only to its owner''s product' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_inventory_references() from public, anon, authenticated;

create trigger guard_inventory_purchases_references before insert or update on public.inventory_purchases
  for each row execute function public.guard_inventory_references();
create trigger guard_inventory_purchase_items_references before insert or update on public.inventory_purchase_items
  for each row execute function public.guard_inventory_references();
create trigger guard_listings_inventory_product before insert or update of inventory_product_id, owner_id
  on public.listings
  for each row when (new.inventory_product_id is not null)
  execute function public.guard_inventory_references();

-- ---------------------------------------------------------------------------------------------------------------------
-- Row-level security: the owning, approved dealer only (§2 of the plan); writes also refuse a suspended dealer.
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.inventory_locations enable row level security;
alter table public.inventory_suppliers enable row level security;
alter table public.inventory_products enable row level security;
alter table public.inventory_stock enable row level security;
alter table public.inventory_purchases enable row level security;
alter table public.inventory_purchase_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_alert_settings enable row level security;
alter table public.inventory_sync_log enable row level security;

-- Reads: the owner while approved (a suspended dealer still reads, never writes).
create policy "inventory_locations_select_owner" on public.inventory_locations for select
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()));
create policy "inventory_suppliers_select_owner" on public.inventory_suppliers for select
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()));
create policy "inventory_products_select_owner" on public.inventory_products for select
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()));
create policy "inventory_stock_select_owner" on public.inventory_stock for select
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()));
create policy "inventory_purchases_select_owner" on public.inventory_purchases for select
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()));
create policy "inventory_purchase_items_select_owner" on public.inventory_purchase_items for select
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()));
create policy "inventory_movements_select_owner" on public.inventory_movements for select
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()));
create policy "inventory_alert_settings_select_owner" on public.inventory_alert_settings for select
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()));
create policy "inventory_sync_log_select_owner" on public.inventory_sync_log for select
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()));

-- Tables the dealer edits directly. Stock, the ledger and the sync log are written only by definer functions.
-- Separate insert, update and delete policies (not "for all"), so select keeps a single permissive policy.
create policy "inventory_locations_insert_owner" on public.inventory_locations for insert
  with check (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));
create policy "inventory_locations_update_owner" on public.inventory_locations for update
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()))
  with check (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));
create policy "inventory_locations_delete_owner" on public.inventory_locations for delete
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));

create policy "inventory_suppliers_insert_owner" on public.inventory_suppliers for insert
  with check (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));
create policy "inventory_suppliers_update_owner" on public.inventory_suppliers for update
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()))
  with check (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));
create policy "inventory_suppliers_delete_owner" on public.inventory_suppliers for delete
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));

create policy "inventory_products_insert_owner" on public.inventory_products for insert
  with check (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));
create policy "inventory_products_update_owner" on public.inventory_products for update
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()))
  with check (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));
create policy "inventory_products_delete_owner" on public.inventory_products for delete
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));

create policy "inventory_alert_settings_insert_owner" on public.inventory_alert_settings for insert
  with check (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));
create policy "inventory_alert_settings_update_owner" on public.inventory_alert_settings for update
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()))
  with check (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));
create policy "inventory_alert_settings_delete_owner" on public.inventory_alert_settings for delete
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));

-- A purchase is edited only while it is a draft; receiving it (receive_purchase) is what makes it final.
create policy "inventory_purchases_insert_owner" on public.inventory_purchases for insert
  with check (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended())
    and status = 'draft');
create policy "inventory_purchases_update_owner" on public.inventory_purchases for update
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended())
    and status = 'draft')
  with check (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended())
    and status in ('draft', 'cancelled'));
create policy "inventory_purchases_delete_owner" on public.inventory_purchases for delete
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended())
    and status = 'draft');

-- Lines change only while their purchase is a draft (guard_inventory_references checks the same on insert and update).
create policy "inventory_purchase_items_insert_owner" on public.inventory_purchase_items for insert
  with check (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));
create policy "inventory_purchase_items_update_owner" on public.inventory_purchase_items for update
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended())
    and exists (select 1 from public.inventory_purchases p where p.id = purchase_id and p.status = 'draft'))
  with check (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended()));
create policy "inventory_purchase_items_delete_owner" on public.inventory_purchase_items for delete
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()) and not (select public.is_suspended())
    and exists (select 1 from public.inventory_purchases p where p.id = purchase_id and p.status = 'draft'));

-- One grant per table, so scripts/check_migrations.py sees each. Stock, the ledger and the sync log are read-only to
-- clients; service_role reads every table (the same privileges as before the split).
grant select, insert, update, delete on public.inventory_locations to authenticated;
grant select, insert, update, delete on public.inventory_suppliers to authenticated;
grant select, insert, update, delete on public.inventory_products to authenticated;
grant select, insert, update, delete on public.inventory_purchases to authenticated;
grant select, insert, update, delete on public.inventory_purchase_items to authenticated;
grant select, insert, update, delete on public.inventory_alert_settings to authenticated;
grant select on public.inventory_stock to authenticated;
grant select on public.inventory_movements to authenticated;
grant select on public.inventory_sync_log to authenticated;
grant select on public.inventory_locations to service_role;
grant select on public.inventory_suppliers to service_role;
grant select on public.inventory_products to service_role;
grant select on public.inventory_stock to service_role;
grant select on public.inventory_purchases to service_role;
grant select on public.inventory_purchase_items to service_role;
grant select on public.inventory_movements to service_role;
grant select on public.inventory_alert_settings to service_role;
grant select on public.inventory_sync_log to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- Stock functions
-- ---------------------------------------------------------------------------------------------------------------------

-- The one place stock changes: lock (or create) the stock row, check, update, write the ledger row. Internal only; the
-- callers below check who is asking.
create or replace function public.inventory_apply_movement(
  p_dealer_id uuid, p_product_id uuid, p_location_id uuid, p_direction public.inventory_movement_direction,
  p_source public.inventory_movement_source, p_quantity numeric, p_reason text, p_actor uuid,
  p_order_id uuid default null, p_order_item_id uuid default null, p_purchase_id uuid default null,
  p_transfer_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before numeric;
  v_after numeric;
  v_id uuid;
begin
  -- NaN first: it compares greater than every number, so `<= 0` alone lets it through.
  if p_quantity is null or p_quantity = 'NaN'::numeric or p_quantity <= 0 then
    raise exception 'The quantity must be more than zero' using errcode = '22023';
  end if;
  -- Stock is kept to two decimals; refuse a finer figure rather than round it silently into the ledger.
  if p_quantity <> round(p_quantity, 2) then
    raise exception 'Use at most two decimals' using errcode = '22023';
  end if;
  -- What numeric(12, 2) stock can hold; also refuses 'Infinity'.
  if p_quantity >= 10000000000 then
    raise exception 'The quantity is too large' using errcode = '22023';
  end if;
  if not exists (select 1 from public.inventory_products where id = p_product_id and dealer_id = p_dealer_id)
     or not exists (select 1 from public.inventory_locations where id = p_location_id and dealer_id = p_dealer_id) then
    raise exception 'The product or location is not yours' using errcode = '42501';
  end if;

  insert into public.inventory_stock (product_id, location_id, dealer_id)
  values (p_product_id, p_location_id, p_dealer_id)
  on conflict (product_id, location_id) do nothing;

  select quantity into v_before from public.inventory_stock
   where product_id = p_product_id and location_id = p_location_id
   for update;

  v_after := v_before + case p_direction when 'in' then p_quantity else -p_quantity end;
  if v_after is null or v_after = 'NaN'::numeric or v_after < 0 then
    raise exception 'Only % in stock at this location', v_before using errcode = 'P0001';
  end if;

  update public.inventory_stock set quantity = v_after, updated_at = now()
   where product_id = p_product_id and location_id = p_location_id;

  insert into public.inventory_movements (
    dealer_id, product_id, location_id, direction, source, quantity, quantity_before, quantity_after, reason, actor,
    order_id, order_item_id, purchase_id, transfer_id
  ) values (
    p_dealer_id, p_product_id, p_location_id, p_direction, p_source, p_quantity, v_before, v_after, p_reason, p_actor,
    p_order_id, p_order_item_id, p_purchase_id, p_transfer_id
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.inventory_apply_movement(
  uuid, uuid, uuid, public.inventory_movement_direction, public.inventory_movement_source, numeric, text, uuid, uuid,
  uuid, uuid, uuid
) from public, anon, authenticated;

-- The caller must be an approved, unsuspended dealer; returns their id.
create or replace function public.inventory_caller()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_approved_dealer() or public.is_suspended() then
    raise exception 'Only an approved dealer manages inventory' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;
revoke execute on function public.inventory_caller() from public, anon, authenticated;

-- A manual movement by the dealer (SRDS §22-§23). ZARAILINK_ORDER, PURCHASE and TRANSFER have their own paths, so they
-- cannot be faked here; each other source has a fixed direction, except an adjustment or OTHER, which need a reason.
create or replace function public.record_movement(
  p_product_id uuid, p_location_id uuid, p_direction public.inventory_movement_direction,
  p_source public.inventory_movement_source, p_quantity numeric, p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dealer uuid := public.inventory_caller();
begin
  if p_source in ('ZARAILINK_ORDER', 'PURCHASE', 'TRANSFER') then
    raise exception '% movements are recorded by their own flow', p_source using errcode = '22023';
  end if;
  if (p_source in ('LOCAL_SALE', 'DAMAGE', 'EXPIRY') and p_direction <> 'out')
     or (p_source = 'RESTOCK' and p_direction <> 'in') then
    raise exception 'A % movement cannot go %', p_source, p_direction using errcode = '22023';
  end if;
  if p_source in ('MANUAL_ADJUSTMENT', 'DAMAGE', 'EXPIRY', 'OTHER') and coalesce(trim(p_reason), '') = '' then
    raise exception 'A % movement needs a reason', p_source using errcode = '22023';
  end if;
  return public.inventory_apply_movement(
    v_dealer, p_product_id, p_location_id, p_direction, p_source, p_quantity, nullif(trim(p_reason), ''), v_dealer);
end;
$$;

-- Moves stock between two of the dealer's locations: an out and an in movement sharing one transfer id.
create or replace function public.transfer_stock(
  p_product_id uuid, p_from_location_id uuid, p_to_location_id uuid, p_quantity numeric, p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dealer uuid := public.inventory_caller();
  v_transfer uuid := gen_random_uuid();
begin
  if p_from_location_id = p_to_location_id then
    raise exception 'Choose two different locations' using errcode = '22023';
  end if;
  -- Lock both stock rows in a fixed order, so two opposite transfers cannot deadlock.
  perform 1 from public.inventory_stock
   where product_id = p_product_id and location_id in (p_from_location_id, p_to_location_id)
   order by location_id for update;
  perform public.inventory_apply_movement(
    v_dealer, p_product_id, p_from_location_id, 'out', 'TRANSFER', p_quantity, p_reason, v_dealer,
    p_transfer_id => v_transfer);
  perform public.inventory_apply_movement(
    v_dealer, p_product_id, p_to_location_id, 'in', 'TRANSFER', p_quantity, p_reason, v_dealer,
    p_transfer_id => v_transfer);
  return v_transfer;
end;
$$;

-- Receives a draft purchase: one PURCHASE movement per line, and the purchase becomes final. Receiving twice is refused.
create or replace function public.receive_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dealer uuid := public.inventory_caller();
  v_status text;
  v_item record;
begin
  select status into v_status from public.inventory_purchases
   where id = p_purchase_id and dealer_id = v_dealer
   for update;
  if v_status is null then
    raise exception 'Purchase not found' using errcode = 'P0002';
  elsif v_status <> 'draft' then
    raise exception 'This purchase is already %', v_status using errcode = '22023';
  elsif not exists (select 1 from public.inventory_purchase_items where purchase_id = p_purchase_id) then
    raise exception 'A purchase needs at least one line' using errcode = '22023';
  end if;

  for v_item in
    select * from public.inventory_purchase_items where purchase_id = p_purchase_id order by product_id, location_id
  loop
    perform public.inventory_apply_movement(
      v_dealer, v_item.product_id, v_item.location_id, 'in', 'PURCHASE', v_item.quantity, null, v_dealer,
      p_purchase_id => p_purchase_id);
  end loop;

  update public.inventory_purchases set status = 'received', received_at = now() where id = p_purchase_id;
end;
$$;

-- Applies one marketplace dispatch event to the IMS (B3 calls it from its consumer; not a client function). Idempotent:
-- the unique ledger index means a replay writes nothing, and the sync log records what happened either way.
create or replace function public.apply_dispatch_event(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.order_events%rowtype;
  v_product uuid;
  v_location uuid;
  v_status text;
  v_error text;
begin
  select * into v_event from public.order_events where id = p_event_id for update;
  if not found then
    raise exception 'Dispatch event not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.inventory_movements
     where source = 'ZARAILINK_ORDER' and order_item_id = v_event.order_item_id
  ) then
    v_status := 'skipped_duplicate';
  else
    select l.inventory_product_id into v_product from public.listings l where l.id = v_event.listing_id;
    select id into v_location from public.inventory_locations
     where dealer_id = v_event.seller_id and is_default;
    if v_product is null or v_location is null then
      v_status := 'failed';
      v_error := case when v_product is null then 'The listing is not linked to a product' else 'No default location' end;
    else
      begin
        perform public.inventory_apply_movement(
          v_event.seller_id, v_product, v_location, 'out', 'ZARAILINK_ORDER', v_event.quantity, 'Marketplace order',
          null, v_event.order_id, v_event.order_item_id);
        v_status := 'applied';
      exception when others then
        -- A failure is logged for the dealer, never raised back to the marketplace (SRDS §53.39).
        v_status := 'failed';
        v_error := sqlerrm;
      end;
    end if;
  end if;

  insert into public.inventory_sync_log (dealer_id, order_event_id, status, error)
  values (v_event.seller_id, p_event_id, v_status, v_error)
  on conflict (order_event_id) do update
    set status = case when public.inventory_sync_log.status = 'applied' then 'applied' else excluded.status end,
        error = excluded.error,
        attempts = public.inventory_sync_log.attempts + 1,
        processed_at = now();

  if v_status in ('applied', 'skipped_duplicate') then
    update public.order_events set inventory_applied_at = coalesce(inventory_applied_at, now()) where id = p_event_id;
  end if;
  return v_status;
end;
$$;
revoke execute on function public.apply_dispatch_event(uuid) from public, anon, authenticated;
grant execute on function public.apply_dispatch_event(uuid) to service_role;

-- SRDS §25: per product, marketplace sales + local sales + adjustments + restocks and purchases + other = current stock.
-- Invoker rights: row-level security limits it to the caller's own products.
create or replace function public.inventory_reconciliation()
returns table (
  product_id uuid, marketplace_sales numeric, local_sales numeric, adjustments numeric, restocks_and_purchases numeric,
  losses numeric, transfers numeric, other numeric, ledger_total numeric, current_stock numeric, balanced boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with signed as (
    select m.product_id, m.source, case m.direction when 'in' then m.quantity else -m.quantity end as qty
      from public.inventory_movements m
  ), totals as (
    select p.id as product_id,
           coalesce(sum(s.qty) filter (where s.source = 'ZARAILINK_ORDER'), 0) as marketplace_sales,
           coalesce(sum(s.qty) filter (where s.source = 'LOCAL_SALE'), 0) as local_sales,
           coalesce(sum(s.qty) filter (where s.source = 'MANUAL_ADJUSTMENT'), 0) as adjustments,
           coalesce(sum(s.qty) filter (where s.source in ('RESTOCK', 'PURCHASE')), 0) as restocks_and_purchases,
           coalesce(sum(s.qty) filter (where s.source in ('DAMAGE', 'EXPIRY')), 0) as losses,
           coalesce(sum(s.qty) filter (where s.source = 'TRANSFER'), 0) as transfers,
           coalesce(sum(s.qty) filter (where s.source = 'OTHER'), 0) as other,
           coalesce(sum(s.qty), 0) as ledger_total
      from public.inventory_products p
      left join signed s on s.product_id = p.id
     group by p.id
  )
  select t.*, coalesce(st.quantity, 0), t.ledger_total = coalesce(st.quantity, 0)
    from totals t
    left join (select product_id, sum(quantity) as quantity from public.inventory_stock group by product_id) st
      on st.product_id = t.product_id
$$;

revoke execute on function public.record_movement(
  uuid, uuid, public.inventory_movement_direction, public.inventory_movement_source, numeric, text
) from public, anon;
revoke execute on function public.transfer_stock(uuid, uuid, uuid, numeric, text) from public, anon;
revoke execute on function public.receive_purchase(uuid) from public, anon;
revoke execute on function public.inventory_reconciliation() from public, anon;
grant execute on function public.record_movement(
  uuid, uuid, public.inventory_movement_direction, public.inventory_movement_source, numeric, text
) to authenticated;
grant execute on function public.transfer_stock(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.receive_purchase(uuid) to authenticated;
grant execute on function public.inventory_reconciliation() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Carry the existing data over (ids kept, so B2 can map old references)
-- ---------------------------------------------------------------------------------------------------------------------

insert into public.inventory_locations (id, dealer_id, name, kind, address, is_active, created_at, updated_at)
select id, dealer_id, name, 'shop', address, status = 'active', created_at, updated_at from public.dealer_stores;

-- A dealer with stock but no store gets a "Main store", so every carried-over product has somewhere to be.
insert into public.inventory_locations (dealer_id, name, kind)
select distinct i.dealer_id, 'Main store', 'shop'
  from public.inventory i
 where not exists (select 1 from public.inventory_locations l where l.dealer_id = i.dealer_id);

-- Each dealer's oldest active location is the default (an inactive one only if the dealer has nothing else): dispatches
-- take stock from it.
update public.inventory_locations l set is_default = true
 where l.id in (
   select distinct on (dealer_id) id from public.inventory_locations order by dealer_id, is_active desc, created_at, id
 );

insert into public.inventory_suppliers (id, dealer_id, name, contact, products_supplied, notes, is_active, created_at, updated_at)
select id, dealer_id, name, contact, products_supplied, notes, status = 'active', created_at, updated_at
  from public.suppliers;

insert into public.inventory_products (
  id, dealer_id, sku, name, category_id, unit, cost_price, selling_price, reorder_threshold, created_at, updated_at
)
select i.id, i.dealer_id, 'SKU-' || upper(left(replace(i.id::text, '-', ''), 8)),
       coalesce(nullif(trim(l.title), ''), 'Item ' || upper(left(replace(i.id::text, '-', ''), 8))),
       l.category_id, i.unit, i.purchase_cost, i.selling_price, i.min_stock_threshold, i.created_at, i.updated_at
  from public.inventory i
  -- Name and category only from the dealer's own listing: a legacy row pointing at someone else's listing must not
  -- copy that listing's title into this dealer's catalogue.
  left join public.listings l on l.id = i.listing_id and l.owner_id = i.dealer_id;

insert into public.inventory_stock (product_id, location_id, dealer_id, quantity, updated_at)
select i.id, l.id, i.dealer_id, i.stock_quantity, i.updated_at
  from public.inventory i
  join public.inventory_locations l on l.dealer_id = i.dealer_id and l.is_default;

-- The old history becomes ledger rows with a mapped source. Its running balance is rebuilt backwards from today's
-- stock, and whatever the old history does not explain (stock set when the row was created) becomes an opening OTHER
-- movement, so the reconciliation identity holds for carried-over products too.
with history as (
  select t.inventory_id, t.created_at, t.actor, t.notes, t.quantity as signed,
         case t.type
           when 'sale' then 'ZARAILINK_ORDER'
           when 'addition' then 'RESTOCK'
           when 'restock' then 'RESTOCK'
           else 'MANUAL_ADJUSTMENT'
         end::public.inventory_movement_source as source,
         1 as ord
    from public.inventory_transactions t
   where t.quantity <> 0
  union all
  select i.id, i.created_at, null, 'Opening balance carried over', i.stock_quantity - coalesce(h.total, 0),
         'OTHER'::public.inventory_movement_source, 0
    from public.inventory i
    left join (select inventory_id, sum(quantity) as total from public.inventory_transactions group by inventory_id) h
      on h.inventory_id = i.id
   where i.stock_quantity - coalesce(h.total, 0) <> 0
), running as (
  select h.*, i.dealer_id, i.stock_quantity
         - coalesce(sum(h.signed) over (
             partition by h.inventory_id order by h.ord desc, h.created_at desc
             rows between unbounded preceding and 1 preceding), 0) as after_qty
    from history h
    join public.inventory i on i.id = h.inventory_id
)
insert into public.inventory_movements (
  dealer_id, product_id, location_id, direction, source, quantity, quantity_before, quantity_after, reason, actor,
  created_at
)
select r.dealer_id, r.inventory_id, l.id,
       case when r.signed > 0 then 'in' else 'out' end::public.inventory_movement_direction,
       r.source, abs(r.signed), r.after_qty - r.signed, r.after_qty, r.notes, r.actor, r.created_at
  from running r
  join public.inventory_locations l on l.dealer_id = r.dealer_id and l.is_default;

update public.listings l set inventory_product_id = i.id
  from public.inventory i
 where i.listing_id = l.id and i.dealer_id = l.owner_id;

insert into public.inventory_alert_settings (dealer_id)
select distinct dealer_id from public.inventory_products
on conflict do nothing;
