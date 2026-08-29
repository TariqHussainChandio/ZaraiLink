-- Module 13 follow-up: `create_notification` is `security definer` and performs a *write*
-- (unlike the read-only `is_admin()`/`available_stock`, both already accepted as
-- publicly-callable by the security advisor) — as originally written, any authenticated client
-- could call it directly via `/rest/v1/rpc/create_notification` to write an arbitrary
-- notification into any other user's inbox, bypassing `notifications`' owner-only grants
-- entirely. The 9 event trigger functions themselves were never at this risk (they `returns
-- trigger`, which Postgres refuses to invoke outside trigger context — same as
-- `handle_new_user`/`rls_auto_enable`, see `20260822091000_function_search_path_hardening.sql`).
--
-- Fix: make the trigger functions `security definer` too, so their internal call to
-- `create_notification` runs as the function owner (who implicitly has EXECUTE on their own
-- function) rather than as the invoking client — then revoke EXECUTE on `create_notification`
-- from everyone else. Triggers still fire normally regardless of EXECUTE grants (that's never
-- been gated by them, see every other trigger function in this schema), so this changes nothing
-- about how orders/messages/etc. behave — it only closes the direct-RPC path.

create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(new.seller_id, 'order_new', jsonb_build_object('order_id', new.id));
  return new;
end;
$$;

create or replace function public.notify_order_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(new.buyer_id, 'order_status_changed', jsonb_build_object('order_id', new.id, 'status', new.status));
  perform public.create_notification(new.seller_id, 'order_status_changed', jsonb_build_object('order_id', new.id, 'status', new.status));
  return new;
end;
$$;

create or replace function public.notify_payment_status_changed()
returns trigger
language plpgsql
security definer
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

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
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

create or replace function public.notify_consultation_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.expert_id is not null then
    perform public.create_notification(new.expert_id, 'consultation_new', jsonb_build_object('consultation_id', new.id));
  end if;
  return new;
end;
$$;

create or replace function public.notify_consultation_status_changed()
returns trigger
language plpgsql
security definer
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

create or replace function public.notify_listing_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(new.owner_id, 'listing_status_changed', jsonb_build_object('listing_id', new.id, 'status', new.status));
  return new;
end;
$$;

create or replace function public.notify_inventory_low_stock()
returns trigger
language plpgsql
security definer
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

create or replace function public.notify_expert_verification_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(new.id, 'expert_verification_changed', jsonb_build_object('status', new.verification_status));
  return new;
end;
$$;

create or replace function public.notify_account_suspension_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(new.id, 'account_suspension_changed', jsonb_build_object('is_suspended', new.is_suspended));
  return new;
end;
$$;

revoke execute on function public.create_notification(uuid, text, jsonb, boolean) from public;
revoke execute on function public.create_notification(uuid, text, jsonb, boolean) from anon;
revoke execute on function public.create_notification(uuid, text, jsonb, boolean) from authenticated;
