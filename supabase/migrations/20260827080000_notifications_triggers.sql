-- Module 13 (Notifications, §19). Purely additive.
-- `notifications` (Module 4) only grants `authenticated` select+update — by design, a user may
-- mark their own notification read/unread but never insert one directly. Every notification is
-- therefore written by a trigger reacting to the event it represents, via one shared
-- `security definer` helper (same bypass pattern as `is_admin()`/`available_stock`) so the
-- individual trigger functions themselves don't need elevated privileges.

-- `p_skip_self` defaults to true (most events: don't tell someone about their own action) but
-- is turned off for inventory_low_stock — the dealer is normally the one whose own stock
-- adjustment crosses the threshold, and they need that notification precisely because they
-- caused it, unlike e.g. a listing-status self-edit which doesn't need an echo back.
create or replace function public.create_notification(
  p_user_id uuid, p_type text, p_payload jsonb default '{}'::jsonb, p_skip_self boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- auth.uid() is the session that triggered the underlying insert/update, which is stable
  -- across the security-definer boundary (it's a session-level GUC, not tied to the executing role).
  if p_user_id is null or (p_skip_self and p_user_id = auth.uid()) then
    return;
  end if;
  insert into public.notifications (user_id, type, payload) values (p_user_id, p_type, p_payload);
end;
$$;

-- new order → notify the seller
create or replace function public.notify_new_order()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(new.seller_id, 'order_new', jsonb_build_object('order_id', new.id));
  return new;
end;
$$;

create trigger notify_new_order
  after insert on public.orders
  for each row execute function public.notify_new_order();

-- order status change → notify both parties (the actor is skipped by create_notification)
create or replace function public.notify_order_status_changed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(new.buyer_id, 'order_status_changed', jsonb_build_object('order_id', new.id, 'status', new.status));
  perform public.create_notification(new.seller_id, 'order_status_changed', jsonb_build_object('order_id', new.id, 'status', new.status));
  return new;
end;
$$;

create trigger notify_order_status_changed
  after update on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_order_status_changed();

-- payment result → notify the buyer
create or replace function public.notify_payment_status_changed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(
    new.buyer_id, 'payment_status_changed',
    jsonb_build_object('payment_id', new.id, 'order_id', new.order_id, 'status', new.status)
  );
  return new;
end;
$$;

create trigger notify_payment_status_changed
  after update on public.payments
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_payment_status_changed();

-- new message → notify the other conversation participant; payload carries the sender's name
-- so ChatScreen (which needs `otherUserName` for its header) doesn't need an extra lookup
create or replace function public.notify_new_message()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_other uuid;
  v_sender_name text;
begin
  select case when c.participant_one = new.sender_id then c.participant_two else c.participant_one end
    into v_other
  from public.conversations c
  where c.id = new.conversation_id;

  select full_name into v_sender_name from public.profiles where id = new.sender_id;

  perform public.create_notification(
    v_other, 'new_message',
    jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id, 'sender_name', v_sender_name)
  );
  return new;
end;
$$;

create trigger notify_new_message
  after insert on public.messages
  for each row execute function public.notify_new_message();

-- consultation created → notify the assigned expert, if any (schema-ready; dormant until
-- Module 14 writes to `consultations`)
create or replace function public.notify_consultation_created()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.expert_id is not null then
    perform public.create_notification(new.expert_id, 'consultation_new', jsonb_build_object('consultation_id', new.id));
  end if;
  return new;
end;
$$;

create trigger notify_consultation_created
  after insert on public.consultations
  for each row execute function public.notify_consultation_created();

-- consultation status change → notify requester + assigned expert
create or replace function public.notify_consultation_status_changed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(new.user_id, 'consultation_status_changed', jsonb_build_object('consultation_id', new.id, 'status', new.status));
  if new.expert_id is not null then
    perform public.create_notification(new.expert_id, 'consultation_status_changed', jsonb_build_object('consultation_id', new.id, 'status', new.status));
  end if;
  return new;
end;
$$;

create trigger notify_consultation_status_changed
  after update on public.consultations
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_consultation_status_changed();

-- listing status change → notify the owner (skips the owner's own edits automatically)
create or replace function public.notify_listing_status_changed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(new.owner_id, 'listing_status_changed', jsonb_build_object('listing_id', new.id, 'status', new.status));
  return new;
end;
$$;

create trigger notify_listing_status_changed
  after update on public.listings
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_listing_status_changed();

-- inventory low-stock warning → notify the dealer only when crossing INTO low stock, not on
-- every update while it stays low (avoids repeat spam across further stock movements)
create or replace function public.notify_inventory_low_stock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.stock_quantity <= new.min_stock_threshold and old.stock_quantity > old.min_stock_threshold then
    perform public.create_notification(
      new.dealer_id, 'inventory_low_stock',
      jsonb_build_object('inventory_id', new.id, 'stock_quantity', new.stock_quantity, 'min_stock_threshold', new.min_stock_threshold),
      false
    );
  end if;
  return new;
end;
$$;

create trigger notify_inventory_low_stock
  after update on public.inventory
  for each row
  when (old.stock_quantity is distinct from new.stock_quantity)
  execute function public.notify_inventory_low_stock();

-- expert verification decision → notify the expert
create or replace function public.notify_expert_verification_changed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(new.id, 'expert_verification_changed', jsonb_build_object('status', new.verification_status));
  return new;
end;
$$;

create trigger notify_expert_verification_changed
  after update on public.experts
  for each row
  when (old.verification_status is distinct from new.verification_status)
  execute function public.notify_expert_verification_changed();

-- account suspension toggled (admin action) → notify the affected user
create or replace function public.notify_account_suspension_changed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(new.id, 'account_suspension_changed', jsonb_build_object('is_suspended', new.is_suspended));
  return new;
end;
$$;

create trigger notify_account_suspension_changed
  after update on public.profiles
  for each row
  when (old.is_suspended is distinct from new.is_suspended)
  execute function public.notify_account_suspension_changed();

-- live delivery for the notification bell/badge (mirrors `messages` in the phase3 migration)
alter publication supabase_realtime add table public.notifications;
