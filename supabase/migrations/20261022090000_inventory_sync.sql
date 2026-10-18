-- B2 + B3: the marketplace and the dealer Inventory Management System become one source of stock (SRDS §19-§21,
-- §53.39, decisions D5-D8; docs/plan-inventory.md).
--
-- Maintainer decisions (wave 5):
--   * dispatch reaches the IMS in the same transaction as the order status change, through apply_dispatch_event, with a
--     safe fallback: a failure to apply is logged in inventory_sync_log for the dealer and retried, never raised back to
--     the marketplace (§53.39). A known shortage still refuses the dispatch (D6);
--   * the legacy tables (dealer_stores, suppliers, inventory, inventory_transactions) are dropped; the API lanes repoint
--     the old routes at the B1 tables.
--
-- Order of work: copy whatever the legacy tables gained after B1, add the low-stock alert on the new stock, move
-- dispatch and availability onto the new tables, then drop the legacy objects explicitly (no CASCADE, so every dropped
-- object is named here).

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Copy what is new since the B1 carry-over (20261021080000). On the hosted project, where B1 and this run together,
--    every statement here finds nothing to do.
-- ---------------------------------------------------------------------------------------------------------------------

insert into public.inventory_locations (id, dealer_id, name, kind, address, is_active, created_at, updated_at)
select s.id, s.dealer_id, s.name, 'shop', s.address, s.status = 'active', s.created_at, s.updated_at
  from public.dealer_stores s
 where not exists (select 1 from public.inventory_locations l where l.id = s.id);

-- A dealer with legacy stock but no location gets a "Main store", so every product has somewhere to be.
insert into public.inventory_locations (dealer_id, name, kind)
select distinct i.dealer_id, 'Main store', 'shop'
  from public.inventory i
 where not exists (select 1 from public.inventory_locations l where l.dealer_id = i.dealer_id);

-- Every dealer with a location has exactly one default (the oldest active one), as in B1.
update public.inventory_locations l set is_default = true
 where l.id in (
   select distinct on (x.dealer_id) x.id
     from public.inventory_locations x
    where not exists (select 1 from public.inventory_locations d where d.dealer_id = x.dealer_id and d.is_default)
    order by x.dealer_id, x.is_active desc, x.created_at, x.id
 );

insert into public.inventory_suppliers (id, dealer_id, name, contact, products_supplied, notes, is_active, created_at, updated_at)
select s.id, s.dealer_id, s.name, s.contact, s.products_supplied, s.notes, s.status = 'active', s.created_at, s.updated_at
  from public.suppliers s
 where not exists (select 1 from public.inventory_suppliers x where x.id = s.id);

do $$
declare
  r record;
  v_location uuid;
  v_current numeric;
  v_delta numeric;
begin
  -- Legacy inventory rows not yet carried over: the product (id kept), and its stock as an opening OTHER movement at the
  -- default location, so the reconciliation identity (§25) holds from the first row.
  for r in
    select i.*, l.title, l.category_id as listing_category_id
      from public.inventory i
      left join public.listings l on l.id = i.listing_id and l.owner_id = i.dealer_id
     where not exists (select 1 from public.inventory_products p where p.id = i.id)
     order by i.id
  loop
    insert into public.inventory_products (
      id, dealer_id, sku, name, category_id, unit, cost_price, selling_price, reorder_threshold, created_at, updated_at
    ) values (
      r.id, r.dealer_id, 'SKU-' || upper(left(replace(r.id::text, '-', ''), 8)),
      coalesce(nullif(trim(r.title), ''), 'Item ' || upper(left(replace(r.id::text, '-', ''), 8))),
      r.listing_category_id, r.unit, r.purchase_cost, r.selling_price, r.min_stock_threshold, r.created_at, r.updated_at
    );
    select id into v_location from public.inventory_locations where dealer_id = r.dealer_id and is_default;
    if r.stock_quantity > 0 then
      perform public.inventory_apply_movement(
        r.dealer_id, r.id, v_location, 'in', 'OTHER', r.stock_quantity, 'Opening balance carried over', null);
    else
      insert into public.inventory_stock (product_id, location_id, dealer_id) values (r.id, v_location, r.dealer_id)
      on conflict do nothing;
    end if;
  end loop;

  -- Products B1 carried over whose legacy stock moved afterwards (adjust_stock, or the A4 dispatch cut, still wrote the
  -- legacy table): the B1 copy of inventory_transactions keeps no ids, so the difference is brought in as one OTHER
  -- movement at the default location rather than by replaying rows that may already be in the ledger. Nothing else wrote
  -- the new stock before this migration (no route used it yet), so the legacy figure is the truth.
  for r in
    select i.id, i.dealer_id, i.stock_quantity
      from public.inventory i
     order by i.id
  loop
    select id into v_location from public.inventory_locations where dealer_id = r.dealer_id and is_default;
    select coalesce(sum(quantity), 0) into v_current from public.inventory_stock where product_id = r.id;
    v_delta := r.stock_quantity - v_current;
    if v_delta <> 0 then
      perform public.inventory_apply_movement(
        r.dealer_id, r.id, v_location, case when v_delta > 0 then 'in' else 'out' end::public.inventory_movement_direction,
        'OTHER', abs(v_delta), 'Legacy inventory change after the carry-over', null);
    end if;
  end loop;
end;
$$;

update public.listings l set inventory_product_id = i.id
  from public.inventory i
 where i.listing_id = l.id and i.dealer_id = l.owner_id and l.inventory_product_id is null;

insert into public.inventory_alert_settings (dealer_id)
select distinct dealer_id from public.inventory_products
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Low-stock alert on the new stock (replaces notify_inventory_low_stock on the legacy table)
-- ---------------------------------------------------------------------------------------------------------------------

-- Only the default location counts: it is the stock the marketplace sells from (D8). The alert fires when the quantity
-- crosses the product's reorder threshold downwards, not on every movement below it, and only if the dealer has not
-- turned low-stock alerts off. The payload keeps the legacy keys the app reads (`stock_quantity`, `min_stock_threshold`,
-- NotificationRow.tsx) and names the product instead of the old inventory row.
create function public.notify_inventory_stock_low()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_threshold numeric;
begin
  -- inventory_apply_movement creates a zero row before its first update; that placeholder is not a stock level.
  if tg_op = 'INSERT' and new.quantity = 0 then
    return null;
  end if;
  if not exists (
    select 1 from public.inventory_locations l where l.id = new.location_id and l.is_default
  ) then
    return null;
  end if;
  select p.reorder_threshold into v_threshold from public.inventory_products p where p.id = new.product_id;
  if v_threshold is null or new.quantity > v_threshold then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.quantity <= v_threshold then
    return null;
  end if;
  if not coalesce(
    (select s.notify_low_stock from public.inventory_alert_settings s where s.dealer_id = new.dealer_id), true
  ) then
    return null;
  end if;

  perform public.create_notification(
    new.dealer_id, 'inventory_low_stock',
    jsonb_build_object(
      'product_id', new.product_id, 'location_id', new.location_id,
      'stock_quantity', new.quantity, 'min_stock_threshold', v_threshold
    ),
    false
  );
  return null;
end;
$$;

revoke execute on function public.notify_inventory_stock_low() from public, anon, authenticated;

create trigger notify_inventory_stock_low
  after insert or update of quantity on public.inventory_stock
  for each row execute function public.notify_inventory_stock_low();

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Dispatch events: what each line deducts from, what is still owed, and retrying what the IMS could not apply
-- ---------------------------------------------------------------------------------------------------------------------

-- B3 verifier F4: the product a line deducts from is fixed at dispatch. Reading the listing's link at retry time let a
-- pending line deduct from whatever product the listing had been relinked to since. If the product is deleted while the
-- line is pending, the column becomes null and the line stays pending with that reason (apply_dispatch_event). Events
-- written before this column are backfilled from their listing's current link, the best record there is.
alter table public.order_events
  add column inventory_product_id uuid references public.inventory_products (id) on delete set null;
create index order_events_inventory_product_id_idx on public.order_events (inventory_product_id);
update public.order_events e set inventory_product_id = l.inventory_product_id
  from public.listings l
 where l.id = e.listing_id and e.inventory_product_id is null and l.inventory_product_id is not null;
comment on column public.order_events.inventory_product_id is
  'The IMS product this line deducts from, recorded at dispatch (B3 verifier F4); null for a line with no product link, '
  'or once that product is deleted.';

-- The log names what it is about. Clients cannot read order_events (A4: the outbox is server side only), so a row that
-- carried only order_event_id could not tell the dealer which order or line is pending. The ids are copied from the event
-- (nullable: listing_id is null once the listing is deleted, as on the event). Row-level security is unchanged: the owner
-- reads their rows and nothing else.
alter table public.inventory_sync_log
  add column order_id uuid references public.orders (id) on delete cascade,
  add column order_item_id uuid references public.order_items (id) on delete cascade,
  add column listing_id uuid references public.listings (id) on delete set null;
create index inventory_sync_log_order_id_idx on public.inventory_sync_log (order_id);
create index inventory_sync_log_order_item_id_idx on public.inventory_sync_log (order_item_id);
create index inventory_sync_log_listing_id_idx on public.inventory_sync_log (listing_id);

update public.inventory_sync_log s
   set order_id = e.order_id, order_item_id = e.order_item_id, listing_id = e.listing_id
  from public.order_events e
 where e.id = s.order_event_id and s.order_id is null;

comment on column public.inventory_sync_log.processed_at is
  'When the IMS last attempted this event (every attempt rewrites it). retry_dispatch_events_for rotates on it, so an '
  'event that keeps failing goes to the back of the queue.';

-- B3 verifier F1: what a dealer can still sell of a product is the stock at their default location minus what pending
-- dispatch lines already owe it. Without the second part, lines owed 5 against 3 in stock left the full 3 sellable, and
-- two more orders of 3 each dispatched (11 owed against 3). Null when the dealer has no default location (stock unknown,
-- see apply_order_dispatch). May be negative: callers read anything at or below 0 as out of stock. p_exclude_order_id
-- leaves out the lines of the order being dispatched, which are already written as events when D6 checks them.
create function public.inventory_sellable(p_product_id uuid, p_dealer_id uuid, p_exclude_order_id uuid default null)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
           select s.quantity from public.inventory_stock s where s.product_id = p_product_id and s.location_id = dl.id
         ), 0)
         - coalesce((
           select sum(e.quantity) from public.order_events e
            where e.seller_id = p_dealer_id and e.inventory_product_id = p_product_id
              and e.inventory_applied_at is null and e.order_id is distinct from p_exclude_order_id
         ), 0)
    from public.inventory_locations dl
   where dl.dealer_id = p_dealer_id and dl.is_default
$$;
revoke execute on function public.inventory_sellable(uuid, uuid, uuid) from public, anon, authenticated;

-- Redefines the B1 function: the log row names the order, the line and the listing, and the line deducts from the product
-- recorded at dispatch (F4) while it is active, falling back to the listing's current link only once it is gone.
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
    -- F4: the product recorded at dispatch, while it exists and is active. Once the dealer deletes it (the API
    -- deactivates a product with history and unlinks its listings; one without is removed and the column set null), the
    -- line falls back to the listing's current link, so relinking the listing resolves it; that product is then recorded
    -- on the event, so later retries and the owed count follow it. A relink while the recorded product is still active
    -- changes nothing.
    select p.id into v_product from public.inventory_products p
     where p.id = v_event.inventory_product_id and p.is_active;
    if v_product is null then
      select p.id into v_product
        from public.listings l
        join public.inventory_products p on p.id = l.inventory_product_id and p.is_active
       where l.id = v_event.listing_id;
      if v_product is not null then
        update public.order_events set inventory_product_id = v_product where id = p_event_id;
      end if;
    end if;
    select id into v_location from public.inventory_locations
     where dealer_id = v_event.seller_id and is_default;
    if v_product is null or v_location is null then
      v_status := 'failed';
      v_error := case
        when v_product is not null then 'No default location'
        when exists (select 1 from public.listings l where l.id = v_event.listing_id and l.inventory_product_id is not null)
          then 'The listing''s product is inactive'
        else 'The listing is not linked to a product'
      end;
    else
      begin
        perform public.inventory_apply_movement(
          v_event.seller_id, v_product, v_location, 'out', 'ZARAILINK_ORDER', v_event.quantity,
          'Marketplace order', null, v_event.order_id, v_event.order_item_id);
        v_status := 'applied';
      exception
        when lock_not_available or query_canceled then
          -- The stock was locked past lock_timeout (set by apply_order_dispatch): an IMS fault, not a shortage.
          v_status := 'failed';
          v_error := 'Inventory was unavailable; retry';
        when others then
          -- A failure is logged for the dealer, never raised back to the marketplace (SRDS §53.39).
          v_status := 'failed';
          v_error := sqlerrm;
      end;
    end if;
  end if;

  insert into public.inventory_sync_log (dealer_id, order_event_id, order_id, order_item_id, listing_id, status, error)
  values (v_event.seller_id, p_event_id, v_event.order_id, v_event.order_item_id, v_event.listing_id, v_status, v_error)
  on conflict (order_event_id) do update
    set status = case when public.inventory_sync_log.status = 'applied' then 'applied' else excluded.status end,
        error = excluded.error,
        order_id = excluded.order_id,
        order_item_id = excluded.order_item_id,
        listing_id = excluded.listing_id,
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

-- Internal: applies a seller's pending events. An event is pending when the IMS has not applied it and it has something
-- to apply: a product recorded at dispatch, or an earlier failure logged. Returns how many were applied (or found already
-- applied). Each event runs in its own block, so one bad event does not stop the rest.
--
-- Order (B3 coordinator review: at most 100 events per call, so 100 that can never apply must not starve the rest):
--   * events are grouped by their recorded product (an event with none is a group of its own). Within a group the oldest
--     goes first and a younger event waits while an older one cannot apply (logged 'Waiting for an earlier order of this
--     product'), so the ledger of one product keeps dispatch order (SRDS §21, §25);
--   * groups rotate: a group whose oldest event was never attempted goes first, then the one attempted longest ago
--     (inventory_sync_log.processed_at, rewritten on every attempt), then by age. A group that fails goes to the back on
--     the next call, so the oldest-first order holds among events that can apply, and none waits forever.
-- Rotation is between products, never within one: rotating inside a product would let a younger line take the stock an
-- older one is waiting for. The order is fixed, so two concurrent callers queue on the same event row (apply_dispatch_event
-- locks it) instead of deadlocking.
--
-- Time budget (B3 re-verification N3): `authenticated` runs with statement_timeout = 8s, and a statement cancelled by it
-- fails as a whole (a 500 for the dealer's retry, a lost dispatch for the trigger). So a call stops at a deadline: the
-- one apply_order_dispatch set for its IMS part (zarailink.ims_deadline, transaction-local), or else 6 seconds from now.
-- Each event waits for a lock at most 2 seconds or what is left, whichever is less; events not reached stay pending,
-- untouched, for the next call. lock_timeout is put back as it was.
create function public.retry_dispatch_events_for(p_seller_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_status text;
  v_count integer := 0;
  v_blocked uuid[] := '{}';
  v_lock_timeout text := current_setting('lock_timeout');
  v_deadline timestamptz := coalesce(
    nullif(current_setting('zarailink.ims_deadline', true), '')::timestamptz, clock_timestamp() + interval '6 seconds');
begin
  for r in
    with pending as (
      select e.id, e.created_at, e.inventory_product_id as product_id, s.processed_at,
             coalesce(e.inventory_product_id, e.id) as grp
        from public.order_events e
        left join public.inventory_sync_log s on s.order_event_id = e.id
       where e.seller_id = p_seller_id
         and e.inventory_applied_at is null
         and (e.inventory_product_id is not null or s.status = 'failed')
    ), heads as (
      select distinct on (grp) grp, processed_at as head_attempt, created_at as head_created, id as head_id
        from pending
       order by grp, created_at, id
    )
    select p.id, p.product_id
      from pending p
      join heads h on h.grp = p.grp
     order by h.head_attempt nulls first, h.head_created, h.head_id, p.created_at, p.id
     limit 100
  loop
    exit when clock_timestamp() >= v_deadline;
    perform set_config('lock_timeout',
      greatest(1, least(2000, floor(extract(epoch from v_deadline - clock_timestamp()) * 1000)))::int || 'ms', true);
    if r.product_id = any (v_blocked) then
      begin
        insert into public.inventory_sync_log (dealer_id, order_event_id, order_id, order_item_id, listing_id, status, error)
        select e.seller_id, e.id, e.order_id, e.order_item_id, e.listing_id, 'failed',
               'Waiting for an earlier order of this product'
          from public.order_events e
         where e.id = r.id
        on conflict (order_event_id) do update
          set status = case when public.inventory_sync_log.status = 'applied' then 'applied' else excluded.status end,
              error = excluded.error,
              attempts = public.inventory_sync_log.attempts + 1,
              processed_at = now();
      exception when others then
        null;  -- a busy log row: the event stays pending as it was
      end;
      continue;
    end if;
    begin
      v_status := public.apply_dispatch_event(r.id);
    exception when others then
      -- apply_dispatch_event logs its own failures; anything that still escapes is left for the next retry.
      v_status := 'failed';
    end;
    if v_status in ('applied', 'skipped_duplicate') then
      v_count := v_count + 1;
    elsif r.product_id is not null then
      v_blocked := v_blocked || r.product_id;
    end if;
  end loop;
  perform set_config('lock_timeout', v_lock_timeout, true);
  return v_count;
end;
$$;

revoke execute on function public.retry_dispatch_events_for(uuid) from public, anon, authenticated;
grant execute on function public.retry_dispatch_events_for(uuid) to service_role;

-- The dealer's "retry sync" action: their own pending events only. Refuses anyone who is not an approved, unsuspended
-- dealer (inventory_caller raises 42501).
create function public.retry_dispatch_events()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.retry_dispatch_events_for(public.inventory_caller());
end;
$$;

revoke execute on function public.retry_dispatch_events() from public, anon;
grant execute on function public.retry_dispatch_events() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Dispatch takes stock from the IMS (redefines the A4 trigger function; the trigger itself is unchanged)
-- ---------------------------------------------------------------------------------------------------------------------

-- Decision (B3 verifier F2; D6 and D7, SRDS §53.39): the IMS can refuse a dispatch only for a shortage it knows about,
-- and an IMS fault never breaks the marketplace.
--   * An order with no line linked to a product never touches the IMS: no lock, no query, no retry. A farmer's order
--     dispatches even while the inventory tables are locked or broken.
--   * For linked lines the IMS part runs in its own block within a 6 second budget, well under the 8 second
--     statement_timeout of `authenticated` (N3: past that the whole dispatch would be cancelled): 2 seconds for a
--     table-level lock, up to 5 seconds for a row lock held by a competing transaction, and what is left for the retry
--     pass (see the block and retry_dispatch_events_for). On a timeout or any IMS error the block is rolled back, the
--     dispatch goes ahead, and each linked line is logged pending: 'Inventory was unavailable at dispatch; retry'. The
--     stock is unknown then, so D6 has nothing to refuse on. A line the pass did not reach in time is logged
--     'Inventory was busy at dispatch; retry'.
--   * The stock rows this order takes are locked FOR UPDATE before D6 reads them, and D6 reads in a later statement, so
--     under READ COMMITTED it sees what a competing dispatch committed. The lines owed (inventory_sellable) are read in
--     that same later statement: a competing dispatch of the same product holds the same stock row until it commits.
--   * Only a known shortage refuses (D6), re-raised out of the block: the linked lines summed per product against what
--     the dealer can still sell, the stock at the default location minus lines already owed (F1, inventory_sellable).
--     A dealer with no default location has no known stock: the lines go pending (§53.39).
-- lock_timeout bounds waiting for a lock, the fault a locked or busy IMS produces. statement_timeout cannot bound part
-- of a statement that is already running (the dispatch UPDATE), so a slow query is not cut short here.
create or replace function public.apply_order_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_default uuid;
  v_lock_timeout text;
  v_deadline timestamptz;
begin
  -- Runs as the owner so it reaches the seller's stock whoever dispatches (the guard already made sure it is the seller).
  -- It runs after the status update, so a raise rolls the dispatch back with it.

  if not old.stock_cut_at_confirm then
    -- Lines on a listing with no product link: the listing's own quantity is the stock, no IMS involved. Locked in a
    -- fixed order so two dispatches cannot both pass the check; summed per listing (order_items_order_listing_uidx
    -- already allows one line per listing in an order, so this only keeps the check right if that index goes).
    perform l.id
      from public.listings l
     where l.id in (select oi.listing_id from public.order_items oi where oi.order_id = new.id)
       and l.inventory_product_id is null
     order by l.id
       for update;
    for r in
      select sum(oi.quantity) as quantity, l.quantity as available
        from public.order_items oi
        join public.listings l on l.id = oi.listing_id
       where oi.order_id = new.id and l.inventory_product_id is null
       group by l.id, l.quantity
    loop
      if r.quantity > r.available then
        raise exception 'Not enough stock to dispatch this order — needs % but only % in stock.', r.quantity, r.available
          using errcode = 'P0001';
      end if;
    end loop;
    -- At 0 the listing is sold; raising the quantity again reopens it (reopen_sold_listing, A4).
    for r in
      select oi.quantity, oi.listing_id
        from public.order_items oi
        join public.listings l on l.id = oi.listing_id
       where oi.order_id = new.id and l.inventory_product_id is null
    loop
      update public.listings
         set quantity = quantity - r.quantity,
             status = case when quantity - r.quantity <= 0 then 'sold'::public.listing_status else status end
       where id = r.listing_id;
    end loop;
  end if;

  -- One event per line (the outbox, D7), with the product it deducts from recorded now (F4). A line the IMS must apply
  -- (a linked product, stock not already cut at confirm by the legacy path) starts unapplied; every other line has
  -- nothing for the IMS to do and is applied now.
  insert into public.order_events (
    order_id, order_item_id, seller_id, listing_id, quantity, type, inventory_product_id, inventory_applied_at
  )
  select new.id, oi.id, new.seller_id, oi.listing_id, oi.quantity, 'dispatched', l.inventory_product_id,
         case when l.inventory_product_id is not null and not old.stock_cut_at_confirm then null else now() end
    from public.order_items oi
    left join public.listings l on l.id = oi.listing_id
   where oi.order_id = new.id;

  if not exists (select 1 from public.order_events where order_id = new.id and inventory_applied_at is null) then
    return null;
  end if;

  v_lock_timeout := current_setting('lock_timeout');
  v_deadline := clock_timestamp() + interval '6 seconds';
  perform set_config('zarailink.ims_deadline', v_deadline::text, true);
  begin
    -- Two bounds, because two different things make the IMS wait (B3 smoke: a 2 second bound on everything turned a
    -- competing dispatch into an "IMS fault", so two dispatches racing for the same stock both went through):
    --   * a table-level lock on inventory_stock (an outage, a migration, a manual lock) blocks this ROW EXCLUSIVE lock:
    --     2 seconds, then the IMS is unavailable (D7);
    --   * a row lock held by another dispatch or stock movement of the same product is ordinary contention between short
    --     transactions: wait for it (up to 5 seconds, or what is left of the budget), so D6 then reads the stock that
    --     transaction left. Only a row lock held longer than that counts as unavailable.
    perform set_config('lock_timeout', '2s', true);
    lock table public.inventory_stock in row exclusive mode;
    perform set_config('lock_timeout',
      greatest(1, least(5000, floor(extract(epoch from v_deadline - clock_timestamp()) * 1000)))::int || 'ms', true);
    -- No retry of the seller's older lines before the check: D6 already counts them as owed (inventory_sellable), and
    -- the pass below applies them ahead of this order's lines (oldest first per product).
    select id into v_default from public.inventory_locations where dealer_id = new.seller_id and is_default;
    if v_default is not null then
      -- Lock the stock rows this order takes, in a fixed order, so two dispatches cannot both pass the check below.
      perform s.product_id
        from public.inventory_stock s
       where s.location_id = v_default
         and s.product_id in (
           select e.inventory_product_id from public.order_events e
            where e.order_id = new.id and e.inventory_applied_at is null)
       order by s.product_id
         for update;
      for r in
        select sum(e.quantity) as quantity,
               public.inventory_sellable(e.inventory_product_id, new.seller_id, new.id) as available
          from public.order_events e
         where e.order_id = new.id and e.inventory_applied_at is null
         group by e.inventory_product_id
      loop
        if r.available is not null and r.quantity > r.available then
          raise exception 'Not enough stock to dispatch this order — needs % but only % available.',
            r.quantity, greatest(r.available, 0)
            using errcode = 'P0001';
        end if;
      end loop;
    end if;

    -- Apply the seller's pending lines, this order's included, through the ordered retry pass: older lines first, and a
    -- new line of a product whose older line still cannot apply waits behind it. apply_dispatch_event logs a failure
    -- instead of raising it. It stops at the same deadline.
    perform public.retry_dispatch_events_for(new.seller_id);
    -- This order's lines the pass did not reach before the deadline: logged, so the dealer sees them pending.
    insert into public.inventory_sync_log (dealer_id, order_event_id, order_id, order_item_id, listing_id, status, error)
    select e.seller_id, e.id, e.order_id, e.order_item_id, e.listing_id, 'failed', 'Inventory was busy at dispatch; retry'
      from public.order_events e
     where e.order_id = new.id and e.inventory_applied_at is null
    on conflict (order_event_id) do nothing;
  exception
    when raise_exception then
      -- The known shortage above (P0001): D6 refuses the dispatch as a whole. Every other error is caught inside
      -- apply_dispatch_event or retry_dispatch_events_for, so this is the only P0001 that reaches here.
      raise;
    when others then
      insert into public.inventory_sync_log (dealer_id, order_event_id, order_id, order_item_id, listing_id, status, error)
      select e.seller_id, e.id, e.order_id, e.order_item_id, e.listing_id, 'failed',
             'Inventory was unavailable at dispatch; retry'
        from public.order_events e
       where e.order_id = new.id and e.inventory_applied_at is null
      on conflict (order_event_id) do update
        set status = 'failed', error = excluded.error,
            attempts = public.inventory_sync_log.attempts + 1, processed_at = now();
  end;
  perform set_config('lock_timeout', v_lock_timeout, true);
  perform set_config('zarailink.ims_deadline', '', true);

  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Availability reads the IMS
-- ---------------------------------------------------------------------------------------------------------------------

-- The exact figure behind check_stock_on_confirm (A4): for a listing linked to a product, what its owner can still sell
-- of it (inventory_sellable: the default location's stock minus lines owed, F1; 0 if negative or unknown); otherwise the
-- listing's own quantity.
--
-- B3 verifier F3: server side only. It was granted to `authenticated` (20260926080300), so any signed-in user could read
-- a dealer's exact IMS stock for any listing, which SRDS §15 keeps private. Only service_role may call it now (the
-- orders service, server side); check_stock_on_confirm is a definer function owned by the migration role, so it still
-- calls it. Clients get listing_availability, a word.
create or replace function public.available_stock(listing_ids uuid[])
returns table (listing_id uuid, available numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    l.id as listing_id,
    case
      when l.inventory_product_id is not null
        then greatest(coalesce(public.inventory_sellable(l.inventory_product_id, l.owner_id), 0), 0)
      else l.quantity
    end as available
  from public.listings l
  where l.id = any(listing_ids);
$$;
revoke execute on function public.available_stock(uuid[]) from public, anon, authenticated;
grant execute on function public.available_stock(uuid[]) to service_role;

-- Redefines the A4 confirm check (B3 re-verification N2): reading the IMS figure waits on a table-level lock of
-- inventory_stock, and under the 8 second statement_timeout of `authenticated` a hung IMS turned confirming an order into
-- a 500. The read now waits at most 2 seconds; then the stock is unknown and the confirm goes through (D5: confirming
-- only checks; the dispatch check, D6, is the one that holds). A shortage it does read still refuses, as before.
create or replace function public.check_stock_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  short record;
  v_short boolean := false;
  v_lock_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '2s', true);
  begin
    select oi.quantity as needed, s.available
      into short
      from public.order_items oi
      join public.available_stock(array(select listing_id from public.order_items where order_id = new.id)) s
        on s.listing_id = oi.listing_id
     where oi.order_id = new.id and oi.quantity > s.available
     limit 1;
    v_short := found;
  exception when lock_not_available then
    v_short := false;
  end;
  perform set_config('lock_timeout', v_lock_timeout, true);
  if v_short then
    raise exception 'Not enough stock to confirm this order — needs % but only % available.', short.needed, short.available
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

-- What a buyer is told: a word, never the dealer's figures (SRDS §15). Read from what the dealer can still sell (F1), so
-- stock already owed to dispatched orders is not offered again. Low stock is at or under the product's reorder
-- threshold. The A4 visibility rule stays: only listings for sale, or the caller's own. Grants unchanged (anon and
-- authenticated; create or replace keeps them).
create or replace function public.listing_availability(listing_ids uuid[])
returns table (listing_id uuid, availability text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    l.id as listing_id,
    case
      when l.inventory_product_id is null then case when l.quantity > 0 then 'in_stock' else 'out_of_stock' end
      when coalesce(st.sellable, 0) <= 0 then 'out_of_stock'
      when st.sellable <= p.reorder_threshold then 'low_stock'
      else 'in_stock'
    end as availability
  from public.listings l
  left join public.inventory_products p on p.id = l.inventory_product_id
  left join lateral (
    select public.inventory_sellable(l.inventory_product_id, l.owner_id) as sellable
  ) st on true
  where l.id = any(listing_ids)
    and (l.status = 'active' or l.owner_id = (select auth.uid()));
$$;

comment on column public.order_events.inventory_applied_at is
  'When the IMS applied this line (apply_dispatch_event, B3). Set at insert for lines with nothing to apply (no product '
  'link, or stock cut at confirm by the pre-A4 path); null means pending: see inventory_sync_log and retry_dispatch_events.';

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Drop the legacy inventory (explicitly, no CASCADE)
-- ---------------------------------------------------------------------------------------------------------------------

-- Functions and triggers that read or wrote the legacy tables. apply_order_dispatch, available_stock and
-- listing_availability no longer do (redefined above).
drop trigger notify_inventory_low_stock on public.inventory;
drop function public.notify_inventory_low_stock();
drop function public.adjust_stock(uuid, text, numeric, uuid, text);

-- The tables take their own policies, indexes, updated_at triggers and (inventory_transactions → inventory) foreign key.
drop table public.inventory_transactions;
drop table public.inventory;
drop table public.dealer_stores;
drop table public.suppliers;

drop type public.inventory_transaction_type;
