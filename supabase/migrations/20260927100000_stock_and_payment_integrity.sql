-- Stock and payment integrity: closes what the third P7 (7D) verification found in migration 20260927090000.
--
--  * The stock trigger runs as the table owner, so `reduce_stock_for_order` was no longer scoped by RLS to the seller's
--    own inventory. Any dealer could plant an `inventory` row for someone else's listing (nothing tied a row to a
--    listing its dealer owns, and nothing made a row unique per listing), which then blocked that seller's confirms and had
--    the real seller's sales taken out of the planted row. The same listing twice in one order was checked per line but
--    reduced from a stale snapshot, so stock was under-reduced.
--  * One payment per order was check-then-insert, so parallel requests made several. A payment amount went stale when items
--    were added after it was opened. A seller could decide a payment on a cancelled order.
--  * `created_at` and payment bookkeeping columns (currency, provider reference) were client-controlled on insert, which let
--    a buyer back-date an order to skip the 48 hour rule.
--  * A review could name a listing the order never contained.

-- ── inventory: a row belongs to a listing its dealer owns, once ───────────

create unique index inventory_dealer_listing_uidx on public.inventory (dealer_id, listing_id) where listing_id is not null;

alter policy "inventory_owner_insert" on public.inventory
  with check (
    dealer_id = (select auth.uid())
    and not (select public.is_suspended())
    and (listing_id is null or exists (
      select 1 from public.listings l where l.id = inventory.listing_id and l.owner_id = inventory.dealer_id
    ))
  );

alter policy "inventory_owner_update" on public.inventory
  with check (
    dealer_id = (select auth.uid())
    and not (select public.is_suspended())
    and (listing_id is null or exists (
      select 1 from public.listings l where l.id = inventory.listing_id and l.owner_id = inventory.dealer_id
    ))
  );

-- What buyers are told is available comes from the listing owner's own row, never from any row that names the listing.
create or replace function public.available_stock(listing_ids uuid[])
returns table (listing_id uuid, available numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    l.id as listing_id,
    coalesce(
      (select i.stock_quantity from public.inventory i where i.listing_id = l.id and i.dealer_id = l.owner_id limit 1),
      l.quantity
    ) as available
  from public.listings l
  where l.id = any(listing_ids);
$$;

-- ── stock: the seller's rows only, each row checked and reduced once with the order's total for it ──

create or replace function public.reduce_stock_for_order(p_order_id uuid, p_actor uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  the_seller uuid;
  r record;
begin
  select o.seller_id into the_seller from public.orders o where o.id = p_order_id;

  -- Lock the seller's rows for this order in a fixed order, so two confirmations cannot both pass the check below.
  perform i.id
  from public.inventory i
  where i.dealer_id = the_seller
    and i.listing_id in (select oi.listing_id from public.order_items oi where oi.order_id = p_order_id)
  order by i.id
  for update;

  for r in
    select i.id as inventory_id, i.stock_quantity, sum(oi.quantity) as needed
    from public.order_items oi
    join public.inventory i on i.listing_id = oi.listing_id and i.dealer_id = the_seller
    where oi.order_id = p_order_id
    group by i.id, i.stock_quantity
  loop
    if r.needed > r.stock_quantity then
      raise exception 'Not enough stock to confirm this order — needs % but only % in stock.', r.needed, r.stock_quantity
        using errcode = 'P0001';
    end if;
  end loop;

  for r in
    select i.id as inventory_id, sum(oi.quantity) as needed
    from public.order_items oi
    join public.inventory i on i.listing_id = oi.listing_id and i.dealer_id = the_seller
    where oi.order_id = p_order_id
    group by i.id
  loop
    insert into public.inventory_transactions (inventory_id, type, quantity, actor, notes)
    values (r.inventory_id, 'sale', -r.needed, p_actor, 'Order ' || p_order_id);

    update public.inventory set stock_quantity = stock_quantity - r.needed where id = r.inventory_id;
  end loop;
end;
$$;

-- A listing appears once in an order (the app groups the cart by listing).
create unique index order_items_order_listing_uidx on public.order_items (order_id, listing_id);

-- ── payments: one open payment per order, even under concurrency ───────────

create unique index payments_one_open_per_order on public.payments (order_id) where status not in ('failed', 'cancelled');

-- ── guards: server-owned columns, no items after a payment, no decision on a dead order ──

create or replace function public.guard_orders_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
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
  new.product_subtotal := 0;
  new.created_at := now();
  return new;
end;
$$;

create or replace function public.guard_order_items_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  the_order record;
  listing_price numeric;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  select o.buyer_id, o.seller_id, o.status into the_order from public.orders o where o.id = new.order_id;
  if the_order.buyer_id is distinct from (select auth.uid()) then
    raise exception 'Items can only be added to your own order' using errcode = '42501';
  end if;
  if the_order.status <> 'pending' then
    raise exception 'Items can only be added to a pending order' using errcode = '23514';
  end if;
  -- A payment is opened for the order's total at that moment (BR-11), so the order stops changing once one exists.
  if exists (
    select 1 from public.payments p where p.order_id = new.order_id and p.status not in ('failed', 'cancelled')
  ) then
    raise exception 'Items cannot be added once the order has a payment' using errcode = '23514';
  end if;
  if new.quantity <= 0 then
    raise exception 'The quantity must be more than zero' using errcode = '23514';
  end if;

  select l.price into listing_price
  from public.listings l
  where l.id = new.listing_id and l.status = 'active' and l.owner_id = the_order.seller_id;
  if listing_price is null then
    raise exception 'That listing is not available from this seller' using errcode = '23514';
  end if;

  new.unit_price := listing_price;
  new.created_at := now();
  return new;
end;
$$;

create or replace function public.guard_payments_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  the_order record;
begin
  if caller is null or current_user <> 'authenticated' then
    return new;
  end if;

  select o.buyer_id, o.status, o.total into the_order from public.orders o where o.id = new.order_id;
  if the_order.buyer_id is distinct from caller or new.buyer_id is distinct from caller then
    raise exception 'You can only pay for your own order' using errcode = '42501';
  end if;
  if the_order.status not in ('pending', 'confirmed') then
    raise exception 'An order that is % cannot be paid', the_order.status using errcode = '23514';
  end if;
  if exists (
    select 1 from public.payments p where p.order_id = new.order_id and p.status not in ('failed', 'cancelled')
  ) then
    raise exception 'This order already has a payment' using errcode = '23505';
  end if;

  -- BR-11: a plain record of what the order costs, opened as pending; the seller decides it. Everything that is
  -- bookkeeping is set here, not by the caller.
  new.buyer_id := caller;
  new.amount := the_order.total;
  new.status := 'pending';
  new.currency := 'PKR';
  new.provider_transaction_ref := null;
  new.created_at := now();
  return new;
end;
$$;

create or replace function public.guard_payments_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  the_order record;
begin
  if caller is null or current_user <> 'authenticated' then
    return new;
  end if;

  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Only status may be updated on an existing payment' using errcode = '42501';
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;

  select o.seller_id, o.status into the_order from public.orders o where o.id = old.order_id;
  if caller is distinct from the_order.seller_id then
    raise exception 'Only the seller can decide a payment' using errcode = '42501';
  end if;
  if old.status not in ('pending', 'processing') or new.status not in ('successful', 'failed') then
    raise exception 'Cannot move a payment from % to %', old.status, new.status using errcode = '23514';
  end if;
  -- An order that was cancelled, rejected or expired has nothing left to pay for.
  if the_order.status in ('cancelled', 'rejected', 'expired') then
    raise exception 'A payment on a % order cannot be decided', the_order.status using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ── reviews: the listing must be one the order contained ──────────────────

alter policy "reviews_insert_buyer_completed_order_or_consultation" on public.reviews
  with check (
    buyer_id = (select auth.uid())
    and not (select public.is_suspended())
    and (
      (order_id is not null and exists (
        select 1 from public.orders o
        where o.id = reviews.order_id and o.buyer_id = (select auth.uid()) and o.status = 'completed'
          and o.seller_id = reviews.seller_id
          and (reviews.listing_id is null or exists (
            select 1 from public.order_items oi where oi.order_id = o.id and oi.listing_id = reviews.listing_id
          ))
      ))
      or (consultation_id is not null and exists (
        select 1 from public.consultations c
        where c.id = reviews.consultation_id and c.user_id = (select auth.uid())
          and c.status in ('resolved', 'closed') and c.expert_id = reviews.seller_id
      ))
    )
  );
