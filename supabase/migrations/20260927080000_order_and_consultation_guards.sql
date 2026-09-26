-- Order and consultation guards: the database enforces who may change what, not only the API.
--
-- Found by the P7 (7D) fresh-context verification. The API (`orders_service`, `consultations_service`) has always
-- checked which participant may make which move, but RLS only asked "is this caller a participant?", and the
-- participants' UPDATE grant covers every column. Any signed-in user can call PostgREST (`/rest/v1/...`) with their own
-- JWT, so a buyer could set their own order to `completed`, change `product_subtotal` or `delivery_charge` (BR-09: the
-- charge is its own line and is priced by the server), or change `seller_id` so every "seller only" check passed.
-- A requester could walk a consultation to `resolved` and `closed` without the expert, and a consultation could be
-- opened with a pending expert.
--
-- RLS cannot say "this column only changes if...", so the rule lives in BEFORE UPDATE triggers, the same way BR-06 is
-- enforced for `experts.verification_status` (`guard_experts_verification_status`). The rules below are the ones in
-- `orders_service.ALLOWED_TRANSITIONS` / `SELLER_ONLY_TARGETS` / `BUYER_ONLY_TARGETS` and
-- `consultations_service.TRANSITION_ACTOR`; a test drives both paths and asserts they agree.
--
-- The guards only bind a signed-in user (`auth.uid()` is not null). `postgres`, `supabase_admin` and `service_role`
-- (migrations, maintenance, the local Auth admin API) are not the population being restricted.

-- ── orders ────────────────────────────────────────────────────────────────

create or replace function public.guard_orders_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    return new;
  end if;

  -- Only the status moves after an order is placed. Comparing the whole row minus the allowed columns also covers
  -- any column added later. `total` is generated (BR-09: product_subtotal + delivery_charge) and Postgres computes
  -- it after BEFORE triggers run, so it is left out here and is protected through the two columns it is made of.
  if (to_jsonb(new) - 'status' - 'updated_at' - 'total') is distinct from
     (to_jsonb(old) - 'status' - 'updated_at' - 'total') then
    raise exception 'Only the order status can be changed' using errcode = '42501';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  -- A disputed order is settled by an admin only (BR-15 audits the admin action in the API), and only to one of the
  -- two outcomes. Neither the buyer nor the seller can settle their own dispute.
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

  -- Whose move it is. `cancelled` and the lazy `expired` sweep may come from either participant.
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

revoke execute on function public.guard_orders_update() from public, anon, authenticated;

-- Named so it fires before `set_orders_updated_at` (triggers run in name order): a refused update writes nothing.
create trigger a_guard_orders_update
  before update on public.orders
  for each row execute function public.guard_orders_update();

-- ── consultations ─────────────────────────────────────────────────────────

create or replace function public.guard_consultations_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  required_actor text;
begin
  if caller is null then
    return new;
  end if;

  -- After the request is made only the status and the attached photos change.
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

revoke execute on function public.guard_consultations_update() from public, anon, authenticated;

create trigger a_guard_consultations_update
  before update on public.consultations
  for each row execute function public.guard_consultations_update();

-- A consultation can only be requested from a verified expert, and not from yourself. `experts` RLS already shows a
-- requester approved experts only; the explicit status check keeps the rule true for an admin caller too.
alter policy "consultations_insert_requester" on public.consultations
  with check (
    user_id = (select auth.uid())
    and not (select public.is_suspended())
    and expert_id is not null
    and expert_id <> user_id
    and exists (
      select 1 from public.experts e
      where e.id = consultations.expert_id and e.verification_status = 'approved'
    )
  );

-- No new messages once a consultation was rejected, cancelled or has expired.
alter policy "consultation_messages_insert_participant" on public.consultation_messages
  with check (
    sender_id = (select auth.uid())
    and not (select public.is_suspended())
    and exists (
      select 1 from public.consultations c
      where c.id = consultation_messages.consultation_id
        and (c.user_id = (select auth.uid()) or c.expert_id = (select auth.uid()))
        and c.status not in ('rejected', 'cancelled', 'expired')
    )
  );
