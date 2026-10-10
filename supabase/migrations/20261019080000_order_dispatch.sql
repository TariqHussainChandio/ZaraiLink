-- A4: orders are dispatched, and dispatch is when stock leaves the seller (decisions D5-D7 and D9, SRDS §19-§21, §26-§29).
--
-- Before this migration, confirming an order cut the seller's `inventory` (commit_stock_on_confirm), and a listing
-- without an inventory row (every farmer listing) never lost quantity. Now:
--   * pending → confirmed only checks that the stock is there (D5: a confirmed order may still be cancelled);
--   * ready → dispatched, by the seller only, cuts the stock in the same transaction: the seller's inventory row, or the
--     listing's own quantity when it has none (sold at 0). A known shortage refuses the dispatch (D6);
--   * the same transaction writes one `order_events` row per order line, the outbox the dealer Inventory Management
--     System reads (D7, the "Order dispatched event" contract in docs/plan.md §5). Until B3 the cut above is the legacy
--     `inventory` one, so every event is written already applied (`inventory_applied_at`); B3 moves the cut to the IMS
--     and leaves the column empty for its consumer;
--   * experts and the admin do not buy (D9).
-- An order can be dispatched once (ready → dispatched happens once), and `order_events` is unique per order line, so a
-- line is never deducted twice (SRDS §21).

-- ── the order guard: dispatch before completion, by the seller ────────────

create or replace function public.guard_orders_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null or current_user <> 'authenticated' then
    return new;
  end if;

  -- Only the status moves after an order is placed. `total` is generated (BR-09) and Postgres computes it after BEFORE
  -- triggers run, so it is left out and protected through the two columns it is made of.
  if (to_jsonb(new) - 'status' - 'updated_at' - 'total') is distinct from
     (to_jsonb(old) - 'status' - 'updated_at' - 'total') then
    raise exception 'Only the order status can be changed' using errcode = '42501';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'disputed' then
    if not (select public.is_admin()) then
      raise exception 'Only an admin can resolve a disputed order' using errcode = '42501';
    end if;
    if new.status not in ('refunded', 'completed') then
      raise exception 'A disputed order can only be refunded or completed' using errcode = '23514';
    end if;
    return new;
  end if;

  -- D5: ready → dispatched → completed. Nothing after dispatch can be cancelled: the goods have left the seller.
  if not exists (
    select 1
    from (values
      ('pending', 'confirmed'), ('pending', 'rejected'), ('pending', 'cancelled'), ('pending', 'payment_failed'),
      ('pending', 'expired'),
      ('confirmed', 'processing'), ('confirmed', 'cancelled'), ('confirmed', 'payment_failed'),
      ('processing', 'ready'),
      ('ready', 'dispatched'),
      ('dispatched', 'completed'),
      ('completed', 'disputed')
    ) as allowed (from_status, to_status)
    where allowed.from_status = old.status::text and allowed.to_status = new.status::text
  ) then
    raise exception 'Cannot move an order from % to %', old.status, new.status using errcode = '23514';
  end if;

  -- The lazy expiry sweep (orders_service.PENDING_ORDER_EXPIRY_HOURS) is the only reason to expire an order, and only
  -- after 48 hours without a decision.
  if new.status = 'expired' and old.created_at > now() - interval '48 hours' then
    raise exception 'An order expires only after 48 hours without a decision' using errcode = '23514';
  end if;

  if new.status in ('confirmed', 'rejected', 'processing', 'ready', 'dispatched', 'completed', 'payment_failed')
     and caller is distinct from old.seller_id then
    raise exception 'Only the seller can make this change to an order' using errcode = '42501';
  end if;
  if new.status = 'disputed' and caller is distinct from old.buyer_id then
    raise exception 'Only the buyer can make this change to an order' using errcode = '42501';
  end if;
  if new.status in ('cancelled', 'expired') and caller not in (old.buyer_id, old.seller_id) then
    raise exception 'Only a participant can make this change to an order' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ── who buys (D9): farmers, buyers and dealers; never experts or the admin ─

create or replace function public.guard_orders_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- The insert policy makes the caller the buyer, so the caller's role is the buyer's (SRDS §26-§29: farmers and dealers
  -- buy as well as sell; experts advise and the admin moderates, neither trades).
  if (select public.caller_role()) is distinct from 'farmer'
     and (select public.caller_role()) is distinct from 'buyer'
     and (select public.caller_role()) is distinct from 'dealer' then
    raise exception 'Only farmers, buyers and dealers can buy on the marketplace' using errcode = '42501';
  end if;
  if new.seller_id = new.buyer_id then
    raise exception 'You cannot buy from yourself' using errcode = '23514';
  end if;
  if not public.is_seller_role(new.seller_id) then
    raise exception 'That user does not sell on the marketplace' using errcode = '23514';
  end if;
  if new.delivery_charge < 0 then
    raise exception 'The delivery charge cannot be negative' using errcode = '23514';
  end if;

  -- A new order is always pending, unpriced and placed now (the 48 hour expiry counts from here).
  new.status := 'pending';
  -- The legacy marker below is the migration's alone: a buyer setting it would skip the stock cut at dispatch.
  new.stock_cut_at_confirm := false;
  new.product_subtotal := 0;
  new.created_at := now();
  return new;
end;
$$;

-- ── confirm: check the stock is there, cut nothing ────────────────────────

drop trigger commit_stock_on_confirm on public.orders;
drop function public.commit_stock_on_confirm();
drop function public.reduce_stock_for_order(uuid, uuid);

create function public.check_stock_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  short record;
begin
  -- Runs as the owner so it reads the seller's stock whoever confirms. It is a check only (D5): another order may take
  -- the stock before this one is dispatched, and the dispatch check (D6) is the one that holds.
  select oi.quantity as needed, s.available
  into short
  from public.order_items oi
  join public.available_stock(array(select listing_id from public.order_items where order_id = new.id)) s
    on s.listing_id = oi.listing_id
  where oi.order_id = new.id and oi.quantity > s.available
  limit 1;
  if found then
    raise exception 'Not enough stock to confirm this order — needs % but only % available.', short.needed, short.available
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

revoke execute on function public.check_stock_on_confirm() from public, anon, authenticated;

create trigger check_stock_on_confirm
  after update of status on public.orders
  for each row
  when (old.status = 'pending' and new.status = 'confirmed')
  execute function public.check_stock_on_confirm();

-- ── the outbox: one row per dispatched order line ─────────────────────────

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  quantity numeric not null check (quantity > 0),
  type text not null check (type in ('dispatched')),
  -- When the line's stock was taken from the seller's inventory. Set in A4 (the legacy cut runs in the same
  -- transaction); B3's IMS consumer applies the rows where it is null, idempotently.
  inventory_applied_at timestamptz,
  created_at timestamptz not null default now(),
  -- SRDS §21: an order line is deducted once, however often anything tries.
  constraint order_events_item_type_key unique (order_item_id, type)
);

alter table public.order_events enable row level security;

-- No client reads or writes the outbox: it is written by the dispatch trigger and read by the inventory sync (B3), both
-- server side. No policy, so `authenticated` and `anon` see nothing even if granted by mistake.
grant select on public.order_events to service_role;

create index order_events_order_id_idx on public.order_events (order_id);
create index order_events_seller_id_idx on public.order_events (seller_id);
create index order_events_listing_id_idx on public.order_events (listing_id);

-- ── orders confirmed before this migration had their stock cut then ───────

-- Only this migration sets it: guard_orders_insert resets it on every new order, and guard_orders_update lets no client
-- change any column but the status.
alter table public.orders add column stock_cut_at_confirm boolean not null default false;
update public.orders set stock_cut_at_confirm = true where status in ('confirmed', 'processing', 'ready');

-- ── dispatch: cut the stock and write the events, in one transaction ──────

create function public.apply_order_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := (select auth.uid());
  r record;
begin
  -- Runs as the owner so it reaches the seller's stock whoever dispatches (the guard already made sure it is the seller).
  -- It runs after the status update, so a raise rolls the dispatch back with it.
  if not old.stock_cut_at_confirm then
    -- Lock what this order takes, in a fixed order, so two dispatches cannot both pass the check below: the seller's
    -- inventory rows for these listings, and the listings that have no such row.
    perform i.id
    from public.inventory i
    where i.dealer_id = new.seller_id
      and i.listing_id in (select oi.listing_id from public.order_items oi where oi.order_id = new.id)
    order by i.id
    for update;
    perform l.id
    from public.listings l
    where l.id in (select oi.listing_id from public.order_items oi where oi.order_id = new.id)
      and not exists (select 1 from public.inventory i where i.listing_id = l.id and i.dealer_id = new.seller_id)
    order by l.id
    for update;

    -- D6: a known shortage refuses the dispatch as a whole. A line whose listing was deleted has nothing to take from.
    for r in
      select oi.quantity, coalesce(i.stock_quantity, l.quantity) as available
      from public.order_items oi
      left join public.listings l on l.id = oi.listing_id
      left join public.inventory i on i.listing_id = oi.listing_id and i.dealer_id = new.seller_id
      where oi.order_id = new.id
    loop
      if r.available is not null and r.quantity > r.available then
        raise exception 'Not enough stock to dispatch this order — needs % but only % in stock.', r.quantity, r.available
          using errcode = 'P0001';
      end if;
    end loop;

    for r in
      select oi.quantity, oi.listing_id, i.id as inventory_id, l.id as listing_found
      from public.order_items oi
      left join public.listings l on l.id = oi.listing_id
      left join public.inventory i on i.listing_id = oi.listing_id and i.dealer_id = new.seller_id
      where oi.order_id = new.id
    loop
      if r.inventory_id is not null then
        insert into public.inventory_transactions (inventory_id, type, quantity, actor, notes)
        values (r.inventory_id, 'sale', -r.quantity, actor, 'Order ' || new.id || ' dispatched');
        update public.inventory set stock_quantity = stock_quantity - r.quantity where id = r.inventory_id;
      elsif r.listing_found is not null then
        -- No inventory row: the listing's own quantity is the stock. At 0 the listing is sold; raising the quantity
        -- again reopens it (reopen_sold_listing below).
        update public.listings
        set quantity = quantity - r.quantity,
            status = case when quantity - r.quantity <= 0 then 'sold'::public.listing_status else status end
        where id = r.listing_id;
      end if;
    end loop;
  end if;

  insert into public.order_events (order_id, order_item_id, seller_id, listing_id, quantity, type, inventory_applied_at)
  select new.id, oi.id, new.seller_id, oi.listing_id, oi.quantity, 'dispatched', now()
  from public.order_items oi
  where oi.order_id = new.id;

  return null;
end;
$$;

revoke execute on function public.apply_order_dispatch() from public, anon, authenticated;

create trigger apply_order_dispatch
  after update of status on public.orders
  for each row
  when (old.status = 'ready' and new.status = 'dispatched')
  execute function public.apply_order_dispatch();

-- ── a sold listing reopens when its owner restocks it ─────────────────────

create function public.reopen_sold_listing()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'sold' and new.status = 'sold' and new.quantity > old.quantity then
    new.status := 'active';
  end if;
  return new;
end;
$$;

revoke execute on function public.reopen_sold_listing() from public, anon, authenticated;

create trigger reopen_sold_listing
  before update of quantity on public.listings
  for each row execute function public.reopen_sold_listing();

-- ── availability (the "Listing availability" contract, docs/plan.md §5) ───

-- What a buyer is told about stock: a word, never the dealer's figures (their inventory stays private, SRDS §15). It
-- reads the same source as available_stock(): the listing owner's own inventory row, else the listing's quantity.
-- `unknown` is reserved for B3, when the answer comes from the IMS and a timeout must not become an error. Listings are
-- public (anon browses them), so anon may ask too; the exact figures (available_stock) stay closed to anon.
create function public.listing_availability(listing_ids uuid[])
returns table (listing_id uuid, availability text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    l.id as listing_id,
    case
      when i.id is null then case when l.quantity > 0 then 'in_stock' else 'out_of_stock' end
      when i.stock_quantity <= 0 then 'out_of_stock'
      when i.stock_quantity <= i.min_stock_threshold then 'low_stock'
      else 'in_stock'
    end as availability
  from public.listings l
  left join lateral (
    select inv.id, inv.stock_quantity, inv.min_stock_threshold
    from public.inventory inv
    where inv.listing_id = l.id and inv.dealer_id = l.owner_id
    limit 1
  ) i on true
  -- Only listings for sale, or the caller's own: a hidden or sold listing's word is not public.
  where l.id = any(listing_ids)
    and (l.status = 'active' or l.owner_id = (select auth.uid()));
$$;

revoke execute on function public.listing_availability(uuid[]) from public;
grant execute on function public.listing_availability(uuid[]) to anon, authenticated;
