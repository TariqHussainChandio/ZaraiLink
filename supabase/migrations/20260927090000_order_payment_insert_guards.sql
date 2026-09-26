-- Order, payment and consultation writes: the database owns state, money and audit rows, not only the API.
--
-- Second P7 (7D) verification. Migration 20260927080000 guarded UPDATE on orders and consultations, but a signed-in
-- user could still call PostgREST (`/rest/v1/...`) with their own JWT and INSERT their way around the same rules: an
-- order already `completed` with a price of 0 and any seller (then review anyone with it), an order item at any
-- `unit_price`, a payment already `successful` for `amount = 1` or on someone else's order, forged
-- `order_status_history` and `payment_transactions` rows, a consultation already `resolved`. `payments` could be
-- rewritten freely on UPDATE (a seller re-opened and re-decided it; an admin changed `amount`, `buyer_id` and `status`),
-- an order could be confirmed directly so its stock was never reduced (and `reduce_stock_for_order` could be called
-- again to reduce it twice), and a brand-new pending order could be "expired".
--
-- Rules, all enforced here so a direct call and an API call end in the same place:
--   * BR-09: the server prices an order. `order_items.unit_price` is the listing's price and `orders.product_subtotal`
--     is the sum of the items; only the delivery charge is the buyer's proposal (its own line, agreed manually).
--   * BR-11: a payment is a plain record (no escrow). Its amount is the order's total; only the order's seller decides
--     it, only while it is open, and an admin has no payment action.
--   * BR-15 / audit integrity: status history and payment events are written by triggers from the real change, never by a
--     client, so they cannot be forged or skipped.
--   * Confirming an order commits the seller's stock, atomically, in the same statement as the status change.
--
-- The guards bind only when `current_user = 'authenticated'` (the role PostgREST switches to for a signed-in user).
-- `postgres`, `supabase_admin`, `service_role` and the SECURITY DEFINER triggers below (which run as their owner) are
-- not bound; that is also how the derived-data triggers are allowed to write what clients may not.

-- ── helpers ───────────────────────────────────────────────────────────────

-- The buyer cannot read a seller's `profiles` row (RLS), so "is this user allowed to sell?" is answered here.
create or replace function public.is_seller_role(_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles where id = _id and role in ('farmer', 'dealer'));
$$;

revoke execute on function public.is_seller_role(uuid) from public, anon;
grant execute on function public.is_seller_role(uuid) to authenticated;

-- ── orders: INSERT ────────────────────────────────────────────────────────

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

  -- A new order is always pending and unpriced; the items trigger below sets the subtotal.
  new.status := 'pending';
  new.product_subtotal := 0;
  return new;
end;
$$;

revoke execute on function public.guard_orders_insert() from public, anon, authenticated;

create trigger a_guard_orders_insert
  before insert on public.orders
  for each row execute function public.guard_orders_insert();

-- ── order items ───────────────────────────────────────────────────────────

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
  return new;
end;
$$;

revoke execute on function public.guard_order_items_insert() from public, anon, authenticated;

create trigger a_guard_order_items_insert
  before insert on public.order_items
  for each row execute function public.guard_order_items_insert();

-- The subtotal is always what the items add up to. Runs as the owner (it may write what a client cannot).
create or replace function public.sync_order_subtotal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.orders
  set product_subtotal = (
    select coalesce(sum(oi.quantity * oi.unit_price), 0) from public.order_items oi where oi.order_id = new.order_id
  )
  where id = new.order_id;
  return null;
end;
$$;

revoke execute on function public.sync_order_subtotal() from public, anon, authenticated;

create trigger sync_order_subtotal
  after insert on public.order_items
  for each row execute function public.sync_order_subtotal();

-- ── orders: UPDATE (replaces the 20260927080000 function) ─────────────────

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

  if not exists (
    select 1
    from (values
      ('pending', 'confirmed'), ('pending', 'rejected'), ('pending', 'cancelled'), ('pending', 'payment_failed'),
      ('pending', 'expired'),
      ('confirmed', 'processing'), ('confirmed', 'cancelled'), ('confirmed', 'payment_failed'),
      ('processing', 'ready'),
      ('ready', 'completed'),
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

  if new.status in ('confirmed', 'rejected', 'processing', 'ready', 'completed', 'payment_failed')
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

-- The consultation guard binds the same way (a definer trigger must not be blocked by it).
create or replace function public.guard_consultations_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  required_actor text;
begin
  if caller is null or current_user <> 'authenticated' then
    return new;
  end if;

  if (to_jsonb(new) - 'status' - 'images' - 'updated_at') is distinct from
     (to_jsonb(old) - 'status' - 'images' - 'updated_at') then
    raise exception 'Only the consultation status and photos can be changed' using errcode = '42501';
  end if;

  if new.images is distinct from old.images and caller is distinct from old.user_id then
    raise exception 'Only the requester can change the photos' using errcode = '42501';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  select allowed.actor into required_actor
  from (values
    ('requested', 'accepted', 'expert'),
    ('requested', 'rejected', 'expert'),
    ('requested', 'cancelled', 'requester'),
    ('accepted', 'in_progress', 'expert'),
    ('accepted', 'cancelled', 'requester'),
    ('in_progress', 'resolved', 'expert'),
    ('resolved', 'closed', 'requester')
  ) as allowed (from_status, to_status, actor)
  where allowed.from_status = old.status::text and allowed.to_status = new.status::text;

  if required_actor is null then
    raise exception 'Cannot move a consultation from % to %', old.status, new.status using errcode = '23514';
  end if;
  if required_actor = 'expert' and caller is distinct from old.expert_id then
    raise exception 'Only the assigned expert may make this change' using errcode = '42501';
  end if;
  if required_actor = 'requester' and caller is distinct from old.user_id then
    raise exception 'Only the requester may make this change' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ── order history: written from the real change, never by a client ────────

create or replace function public.record_order_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, (select auth.uid()));
  elsif new.status is distinct from old.status then
    -- `expired` is a system transition (nothing a user chose), so it has no actor.
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, case when new.status = 'expired' then null else (select auth.uid()) end);
  end if;
  return null;
end;
$$;

revoke execute on function public.record_order_history() from public, anon, authenticated;

create trigger record_order_history_insert
  after insert on public.orders
  for each row execute function public.record_order_history();
create trigger record_order_history_update
  after update of status on public.orders
  for each row execute function public.record_order_history();

drop policy "order_status_history_insert_participants" on public.order_status_history;
revoke insert on public.order_status_history from authenticated;

-- ── stock: committed by the same statement that confirms the order ────────

create or replace function public.commit_stock_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Runs as the owner so it reaches the seller's inventory whoever the caller is; the items guard already ensured every
  -- item is one of the seller's own listings. A shortage raises P0001 and the status change is rolled back with it.
  perform public.reduce_stock_for_order(new.id, (select auth.uid()));
  return null;
end;
$$;

revoke execute on function public.commit_stock_on_confirm() from public, anon, authenticated;

create trigger commit_stock_on_confirm
  after update of status on public.orders
  for each row
  when (old.status = 'pending' and new.status = 'confirmed')
  execute function public.commit_stock_on_confirm();

-- No longer an API: it is an internal step of the trigger above, so it can be neither skipped nor run twice.
revoke execute on function public.reduce_stock_for_order(uuid, uuid) from public, anon, authenticated;

-- ── payments ──────────────────────────────────────────────────────────────

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

  -- BR-11: a plain record of what the order costs, opened as pending; the seller decides it.
  new.buyer_id := caller;
  new.amount := the_order.total;
  new.status := 'pending';
  return new;
end;
$$;

revoke execute on function public.guard_payments_insert() from public, anon, authenticated;

create trigger a_guard_payments_insert
  before insert on public.payments
  for each row execute function public.guard_payments_insert();

-- Replaces `guard_payments_columns`, which let an admin change any column.
create or replace function public.guard_payments_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  order_seller uuid;
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

  select o.seller_id into order_seller from public.orders o where o.id = old.order_id;
  if caller is distinct from order_seller then
    raise exception 'Only the seller can decide a payment' using errcode = '42501';
  end if;
  if old.status not in ('pending', 'processing') or new.status not in ('successful', 'failed') then
    raise exception 'Cannot move a payment from % to %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_payments_update() from public, anon, authenticated;

drop trigger guard_payments_columns on public.payments;
drop function public.guard_payments_columns();

create trigger a_guard_payments_update
  before update on public.payments
  for each row execute function public.guard_payments_update();

-- An admin has no payment action (disputes are settled on the order, and audited there), so the policy is renamed to say so.
alter policy "payments_update_order_seller_or_admin" on public.payments rename to "payments_update_order_seller";
alter policy "payments_update_order_seller" on public.payments
  using (exists (
    select 1 from public.orders o
    where o.id = payments.order_id and o.seller_id = (select auth.uid()) and not (select public.is_suspended())
  ))
  with check (exists (
    select 1 from public.orders o
    where o.id = payments.order_id and o.seller_id = (select auth.uid()) and not (select public.is_suspended())
  ));

-- Payment events are written from the real status change.
create or replace function public.record_payment_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.payment_transactions (payment_id, event_type, payload)
  values (
    new.id,
    case new.status when 'successful' then 'manual_confirmation' else 'manual_failure' end,
    jsonb_build_object('method', new.method)
  );
  return null;
end;
$$;

revoke execute on function public.record_payment_event() from public, anon, authenticated;

create trigger record_payment_event
  after update of status on public.payments
  for each row
  when (new.status is distinct from old.status and new.status in ('successful', 'failed'))
  execute function public.record_payment_event();

drop policy "payment_transactions_insert_order_seller_or_admin" on public.payment_transactions;
revoke insert on public.payment_transactions from authenticated;

-- ── consultations and reviews ─────────────────────────────────────────────

alter policy "consultations_insert_requester" on public.consultations
  with check (
    user_id = (select auth.uid())
    and not (select public.is_suspended())
    and status = 'requested'
    and expert_id is not null
    and expert_id <> user_id
    and exists (
      select 1 from public.experts e
      where e.id = consultations.expert_id and e.verification_status = 'approved'
    )
  );

-- A review is of the party the order (or consultation) was actually with, so a forged or unrelated order cannot be used
-- to write about anyone.
alter policy "reviews_insert_buyer_completed_order_or_consultation" on public.reviews
  with check (
    buyer_id = (select auth.uid())
    and not (select public.is_suspended())
    and (
      (order_id is not null and exists (
        select 1 from public.orders o
        where o.id = reviews.order_id and o.buyer_id = (select auth.uid()) and o.status = 'completed'
          and o.seller_id = reviews.seller_id
      ))
      or (consultation_id is not null and exists (
        select 1 from public.consultations c
        where c.id = reviews.consultation_id and c.user_id = (select auth.uid())
          and c.status in ('resolved', 'closed') and c.expert_id = reviews.seller_id
      ))
    )
  );
