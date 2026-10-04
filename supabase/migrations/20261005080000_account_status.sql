-- Account status for dealers and experts (A3a; SRDS §8, §11, §13, §50, §51; plan decision D10, decided 2026-10-04).
--
-- Farmers and buyers are usable as soon as Supabase Auth confirms their email. A dealer or an expert stays `pending`
-- until an admin approves them, and until then may do nothing as a dealer or expert, and nothing else on the
-- platform either: they see only the Application Status screen (D10). A rejected one sees the reason and may
-- resubmit. Suspension is separate and unchanged: `profiles.is_suspended`.
--
-- The status lives on `profiles` next to the role, so the database policies below and FastAPI
-- (backend/app/auth/dependencies.py) read one source. A decision is made only through decide_account_status(), which
-- needs an admin with a second factor and writes the audit row in the same transaction (BR-15): no direct write of
-- the status is accepted from a user session, an admin's included, so no decision can go unaudited.
--
-- Ported from the parked branch wip/a3-account-status (0d7edd8) and rebuilt on the current policies: that branch's
-- listings policies predated 20260928090000_admin_write_scope.sql and would have restored the admin branch without a
-- second factor, so every policy here is altered from its current text, keeping its admin branch as it is.

create type public.account_status as enum ('pending', 'approved', 'rejected');

alter table public.profiles
  add column account_status public.account_status not null default 'approved',
  add column account_status_reason text check (char_length(account_status_reason) <= 1000),
  add column account_status_changed_at timestamptz;

-- The admin queue reads the accounts waiting for a decision; most profiles are approved, so a partial index.
create index profiles_review_queue_idx on public.profiles (role, created_at) where account_status <> 'approved';

-- Existing experts follow their verification decision; one with no application yet is pending. An expert an admin
-- had suspended through the old verification route keeps their approval and is suspended the one way suspension now
-- works for everyone (profiles.is_suspended). Dealers who signed up before this rule stay approved: they had no way
-- to apply.
update public.profiles p
   set account_status = coalesce(
         (select case e.verification_status
                   when 'approved' then 'approved'
                   when 'suspended' then 'approved'
                   when 'rejected' then 'rejected'
                   else 'pending'
                 end::public.account_status
            from public.experts e
           where e.id = p.id),
         'pending'),
       is_suspended = p.is_suspended or exists (
         select 1 from public.experts e where e.id = p.id and e.verification_status = 'suspended')
 where p.role = 'expert';

-- Their verification goes back to approved with it: the directory and new consultations read it, and once suspension is
-- lifted (profiles.is_suspended) nothing else could ever turn a `suspended` verification back into `approved`.
update public.experts set verification_status = 'approved' where verification_status = 'suspended';

-- New sign-ups: a dealer or expert starts pending, everyone else approved. The role allow-list is unchanged from
-- 20260922080000_role_escalation_fix.sql: admin is never reachable from sign-up metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
  granted_role public.user_role := case
    when requested_role in ('farmer', 'buyer', 'dealer', 'expert') then requested_role::public.user_role
    else 'buyer'::public.user_role
  end;
begin
  insert into public.profiles (id, role, full_name, account_status)
  values (
    new.id,
    granted_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when granted_role in ('dealer', 'expert') then 'pending' else 'approved' end::public.account_status
  );
  return new;
end;
$$;

-- A user may update their own profile row (profiles_update_own_or_admin), so without this a pending dealer could
-- approve themselves with one direct update, and an admin's direct update would decide without an audit row. So no
-- user session may write the status columns at all; decide_account_status() and resubmit_application() below are
-- definer functions and run as their owner, which passes.
create or replace function public.guard_profiles_role()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Only an admin may change role';
    end if;
    -- A role change is not an approval: someone made a dealer or expert waits for that role's decision like anyone
    -- who signed up as one, and any other role needs none.
    new.account_status := case when new.role in ('dealer', 'expert') then 'pending' else 'approved' end
                          ::public.account_status;
    new.account_status_reason := null;
    new.account_status_changed_at := now();
  elsif current_user = 'authenticated'
        and (new.account_status is distinct from old.account_status
             or new.account_status_reason is distinct from old.account_status_reason
             or new.account_status_changed_at is distinct from old.account_status_changed_at) then
    raise exception 'The account status is decided by an admin through the application review'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- An expert's verification is now the approval of their account, decided only by decide_account_status(). An insert
-- from a user session still starts pending (20260928090000); a change from any user session, an admin's included, is
-- refused, so the decision always comes with its audit row.
create or replace function public.guard_experts_verification_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' and new.verification_status is distinct from 'pending' then
      raise exception 'A new expert application starts pending';
    end if;
    if tg_op = 'UPDATE' and new.verification_status is distinct from old.verification_status then
      raise exception 'An expert application is decided by an admin through the application review'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Helpers for the policies below (contract names from docs/plan.md). Definer, so they can read the caller's profile
-- from inside another table's policy; each answers only about the caller, except the two that take an id, which
-- reveal no more than the public expert directory and the marketplace already do.
create or replace function public.is_account_approved()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select account_status = 'approved' from public.profiles where id = (select auth.uid())),
    false
  );
$$;

create or replace function public.is_approved_dealer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid()) and role = 'dealer' and account_status = 'approved'
  );
$$;

create or replace function public.is_approved_expert()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid()) and role = 'expert' and account_status = 'approved'
  );
$$;

-- The caller's role, for the expert application policies: those stay open to a pending expert (they are how one
-- applies) but are closed to every other role, which until now could file an expert application too.
create or replace function public.caller_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.is_approved_expert_id(_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles where id = _id and role = 'expert' and account_status = 'approved'
  );
$$;

-- Who may be sold to (guard_orders_insert and the payments guard call this): a farmer or a dealer whose account is
-- approved and not suspended. A pending, rejected or suspended seller cannot receive new orders.
create or replace function public.is_seller_role(_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = _id and role in ('farmer', 'dealer') and account_status = 'approved' and not is_suspended
  );
$$;

revoke execute on function public.is_account_approved() from public, anon;
revoke execute on function public.is_approved_dealer() from public, anon;
revoke execute on function public.is_approved_expert() from public, anon;
revoke execute on function public.caller_role() from public, anon;
revoke execute on function public.is_seller_role(uuid) from public, anon;
revoke execute on function public.is_approved_expert_id(uuid) from public;
grant execute on function public.is_account_approved() to authenticated;
grant execute on function public.is_approved_dealer() to authenticated;
grant execute on function public.is_approved_expert() to authenticated;
grant execute on function public.caller_role() to authenticated;
grant execute on function public.is_seller_role(uuid) to authenticated;
-- The expert directory is public (experts_select_verified_or_own_or_admin), so its policy runs for anon too.
grant execute on function public.is_approved_expert_id(uuid) to anon, authenticated;

-- The one way to decide an application (SRDS §8, §11, §12; BR-15). Needs an admin with a second factor; only a
-- pending dealer or expert can be decided, a rejection carries the reason the applicant will see, and the audit row
-- is written in the same transaction, with the SRDS §51 event names. An expert's verification row and status follow.
-- Taking an approval back is not a decision: suspension (profiles.is_suspended) is the tool for that.
create or replace function public.decide_account_status(
  _user_id uuid,
  _decision public.account_status,
  _reason text default null
)
returns table (role public.user_role, previous_status public.account_status, new_status public.account_status)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.profiles%rowtype;
  reason text := nullif(btrim(_reason), '');
begin
  if not public.is_admin_aal2() then
    raise exception 'Only an admin with a second factor may decide an application' using errcode = '42501';
  end if;
  select * into target from public.profiles p where p.id = _user_id for update;
  if not found then
    raise exception 'No such account' using errcode = 'P0002';
  end if;
  if target.role not in ('dealer', 'expert') then
    raise exception 'Only dealer and expert accounts are reviewed' using errcode = '23514';
  end if;
  if _decision not in ('approved', 'rejected') then
    raise exception 'A decision is approved or rejected' using errcode = '23514';
  end if;
  if target.account_status <> 'pending' then
    raise exception 'Only a pending application can be decided' using errcode = '23514';
  end if;
  if _decision = 'rejected' and char_length(coalesce(reason, '')) < 10 then
    raise exception 'A rejection needs a reason of at least 10 characters' using errcode = '23514';
  end if;
  if target.role = 'expert' and not exists (select 1 from public.experts e where e.id = _user_id) then
    raise exception 'The expert has not sent an application yet' using errcode = '23514';
  end if;

  update public.profiles p
     set account_status = _decision,
         account_status_reason = case when _decision = 'rejected' then reason end,
         account_status_changed_at = now()
   where p.id = _user_id;

  if target.role = 'expert' then
    update public.experts e
       set verification_status = _decision::text::public.verification_status
     where e.id = _user_id;
    update public.expert_verifications v
       set decision = _decision::text::public.verification_status,
           reviewed_by = (select auth.uid()),
           decision_at = now(),
           notes = reason
     where v.id = (select v2.id from public.expert_verifications v2
                    where v2.expert_id = _user_id
                    order by v2.created_at desc limit 1);
  end if;

  insert into public.audit_logs (actor_id, action, target_entity, target_id, previous_state, new_state, metadata)
  values (
    (select auth.uid()),
    format('%s_application_%s', target.role, _decision),
    'profiles',
    _user_id,
    jsonb_build_object('account_status', target.account_status, 'account_status_reason', target.account_status_reason),
    jsonb_build_object('account_status', _decision, 'account_status_reason', case when _decision = 'rejected' then reason end),
    jsonb_build_object('reason', reason)
  );

  return query select target.role, target.account_status, _decision;
end;
$$;

revoke execute on function public.decide_account_status(uuid, public.account_status, text) from public, anon;
grant execute on function public.decide_account_status(uuid, public.account_status, text) to authenticated;

-- A rejected dealer or expert sends their application back for review (D10). The reason is cleared from the profile;
-- the decision and its reason stay in the audit log. An expert's verification goes back to pending with it.
create or replace function public.resubmit_application()
returns public.account_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := (select auth.uid());
  target public.profiles%rowtype;
begin
  select * into target from public.profiles p where p.id = caller for update;
  if not found or target.role not in ('dealer', 'expert') or target.account_status <> 'rejected' then
    raise exception 'Only a rejected application can be sent again' using errcode = '23514';
  end if;
  if target.is_suspended then
    raise exception 'A suspended account cannot send an application' using errcode = '42501';
  end if;
  update public.profiles p
     set account_status = 'pending', account_status_reason = null, account_status_changed_at = now()
   where p.id = caller;
  if target.role = 'expert' then
    update public.experts e set verification_status = 'pending' where e.id = caller;
  end if;
  return 'pending';
end;
$$;

revoke execute on function public.resubmit_application() from public, anon;
grant execute on function public.resubmit_application() to authenticated;

-- One notification per decision or resubmission, for the account itself; it replaces the expert-only one (the
-- decision now moves both, and two notifications for one decision would be noise). The app's Application Status
-- screen listens for it to learn of a decision at once.
create or replace function public.notify_account_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.create_notification(
    new.id, 'account_status_changed',
    jsonb_build_object('status', new.account_status, 'reason', new.account_status_reason), false);
  return new;
end;
$$;

revoke execute on function public.notify_account_status_changed() from public, anon, authenticated;

create trigger notify_account_status_changed
  after update on public.profiles
  for each row when (old.account_status is distinct from new.account_status)
  execute function public.notify_account_status_changed();

drop trigger notify_expert_verification_changed on public.experts;
drop function public.notify_expert_verification_changed();

-- An admin decided an expert record directly (aal2) without an audit row, and without moving the account; the decision
-- columns now belong to decide_account_status() alone, which runs as the owner.
drop policy "expert_verifications_admin_update" on public.expert_verifications;
revoke update on public.expert_verifications from authenticated;

-- A role change resets the account (guard_profiles_role), and someone made an expert again must be decided again in
-- Approvals, which lists experts by their verification. Definer, so it may move the verification past
-- guard_experts_verification_status; it only ever sets `pending`, never a decision.
create or replace function public.reset_expert_on_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.experts e set verification_status = 'pending' where e.id = new.id;
  return new;
end;
$$;

revoke execute on function public.reset_expert_on_role_change() from public, anon, authenticated;

create trigger reset_expert_on_role_change
  after update of role on public.profiles
  for each row when (old.role is distinct from new.role and new.role = 'expert')
  execute function public.reset_expert_on_role_change();

-- ---- Policies (each altered from its current text; admin branches are left exactly as they are) -------------------
--
-- Dealer tools: an approved dealer only. Until now these checked the owner alone, so any role could create a store.
alter policy "dealer_stores_owner_insert" on public.dealer_stores
  with check ((dealer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_dealer()));
alter policy "dealer_stores_owner_update" on public.dealer_stores
  using ((dealer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_dealer()))
  with check ((dealer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_dealer()));
alter policy "dealer_stores_owner_delete" on public.dealer_stores
  using ((dealer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_dealer()));

alter policy "suppliers_owner_insert" on public.suppliers
  with check ((dealer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_dealer()));
alter policy "suppliers_owner_update" on public.suppliers
  using ((dealer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_dealer()))
  with check ((dealer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_dealer()));
alter policy "suppliers_owner_delete" on public.suppliers
  using ((dealer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_dealer()));

alter policy "inventory_owner_insert" on public.inventory
  with check (
    (dealer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_dealer())
    and ((listing_id is null) or exists (
      select 1 from public.listings l where l.id = inventory.listing_id and l.owner_id = inventory.dealer_id))
  );
alter policy "inventory_owner_update" on public.inventory
  using ((dealer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_dealer()))
  with check (
    (dealer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_dealer())
    and ((listing_id is null) or exists (
      select 1 from public.listings l where l.id = inventory.listing_id and l.owner_id = inventory.dealer_id))
  );
alter policy "inventory_owner_delete" on public.inventory
  using ((dealer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_dealer()));

alter policy "inventory_transactions_owner_insert" on public.inventory_transactions
  with check (
    exists (
      select 1 from public.inventory i
       where i.id = inventory_transactions.inventory_id
         and i.dealer_id = (select auth.uid())
         and (not (select public.is_suspended()))
    )
    and (select public.is_approved_dealer())
  );

-- Listings and their photos: a seller (an approved farmer or dealer, not suspended). Until now any role could list.
-- The admin branch of the update policy (second factor, 20260928090000) is kept as it is.
alter policy "listings_owner_insert" on public.listings
  with check ((owner_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_seller_role((select auth.uid()))));
alter policy "listings_owner_update" on public.listings
  using (((owner_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_seller_role((select auth.uid())))) or (select public.is_admin_aal2()))
  with check (((owner_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_seller_role((select auth.uid())))) or (select public.is_admin_aal2()));
alter policy "listings_owner_delete" on public.listings
  using ((owner_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_seller_role((select auth.uid()))));

alter policy "listing_images_owner_write" on storage.objects
  with check ((bucket_id = 'listing-images') and (owner = (select auth.uid())) and (select public.is_seller_role((select auth.uid()))));
alter policy "listing_images_owner_update" on storage.objects
  using ((bucket_id = 'listing-images') and (owner = (select auth.uid())) and (select public.is_seller_role((select auth.uid()))));
alter policy "listing_images_owner_delete" on storage.objects
  using ((bucket_id = 'listing-images') and (owner = (select auth.uid())) and (select public.is_seller_role((select auth.uid()))));

-- Conversations and messages: an approved account (D10: nothing but the Application Status screen while pending).
alter policy "conversations_insert_participant" on public.conversations
  with check (
    (((participant_one = (select auth.uid())) and (not (select public.is_suspended())))
      or ((participant_two = (select auth.uid())) and (not (select public.is_suspended()))))
    and (select public.is_account_approved())
  );
alter policy "messages_insert_participant" on public.messages
  with check (
    (sender_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved())
    and exists (
      select 1 from public.conversations c
       where c.id = messages.conversation_id
         and ((c.participant_one = (select auth.uid())) or (c.participant_two = (select auth.uid()))))
  );
alter policy "messages_update" on public.messages
  using (
    (select public.is_admin_aal2())
    or ((select public.is_account_approved()) and exists (
      select 1 from public.conversations c
       where c.id = messages.conversation_id
         and (((c.participant_one = (select auth.uid())) and (not (select public.is_suspended())))
              or ((c.participant_two = (select auth.uid())) and (not (select public.is_suspended()))))))
  )
  with check (
    (select public.is_admin_aal2())
    or ((select public.is_account_approved()) and exists (
      select 1 from public.conversations c
       where c.id = messages.conversation_id
         and (((c.participant_one = (select auth.uid())) and (not (select public.is_suspended())))
              or ((c.participant_two = (select auth.uid())) and (not (select public.is_suspended()))))))
  );
alter policy "message_attachments_participant_insert" on storage.objects
  with check (
    (bucket_id = 'message-attachments') and (owner = (select auth.uid())) and (select public.is_account_approved())
    and exists (
      select 1 from public.conversations c
       where (c.id)::text = (storage.foldername(objects.name))[1]
         and ((c.participant_one = (select auth.uid())) or (c.participant_two = (select auth.uid()))))
  );

-- Orders and payments: an approved account on both sides. The seller side is also is_seller_role() in the order and
-- payment guards, so an approval reset by a role change, or a suspension, stops a seller acting on new orders.
alter policy "orders_insert_buyer" on public.orders
  with check ((buyer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()));
alter policy "order_items_insert_buyer" on public.order_items
  with check (
    exists (
      select 1 from public.orders o
       where o.id = order_items.order_id
         and o.buyer_id = (select auth.uid())
         and (not (select public.is_suspended())))
    and (select public.is_account_approved())
  );
alter policy "orders_update_participants" on public.orders
  using (
    ((buyer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
    or ((seller_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
    or ((select public.is_admin()) and (status = 'disputed'))
  )
  with check (
    ((buyer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
    or ((seller_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
    or ((select public.is_admin()) and (status = any (array['refunded'::public.order_status, 'completed'::public.order_status])))
  );
alter policy "payments_insert_buyer" on public.payments
  with check ((buyer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()));
alter policy "payments_update_order_seller" on public.payments
  using (
    exists (
      select 1 from public.orders o
       where o.id = payments.order_id and o.seller_id = (select auth.uid()) and (not (select public.is_suspended())))
    and (select public.is_account_approved())
  )
  with check (
    exists (
      select 1 from public.orders o
       where o.id = payments.order_id and o.seller_id = (select auth.uid()) and (not (select public.is_suspended())))
    and (select public.is_account_approved())
  );

-- Consultations: an approved requester asks an approved expert; on the expert's side only an approved expert acts.
alter policy "consultations_insert_requester" on public.consultations
  with check (
    (user_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved())
    and (status = 'requested') and (expert_id is not null) and (expert_id <> user_id)
    and exists (
      select 1 from public.experts e where e.id = consultations.expert_id and e.verification_status = 'approved')
    and (select public.is_approved_expert_id(consultations.expert_id))
  );
alter policy "consultations_update_participants" on public.consultations
  using (
    ((user_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
    or ((expert_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_expert()))
    or (select public.is_admin())
  )
  with check (
    ((user_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
    or ((expert_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_approved_expert()))
    or (select public.is_admin())
  );
alter policy "consultation_messages_insert_participant" on public.consultation_messages
  with check (
    (sender_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved())
    and exists (
      select 1 from public.consultations c
       where c.id = consultation_messages.consultation_id
         and ((c.user_id = (select auth.uid())) or (c.expert_id = (select auth.uid())))
         and (c.status <> all (array['rejected'::public.consultation_status, 'cancelled'::public.consultation_status,
                                     'expired'::public.consultation_status])))
  );
alter policy "consultation_attachments_participant_insert" on storage.objects
  with check (
    (bucket_id = 'consultation-attachments') and (owner = (select auth.uid())) and (select public.is_account_approved())
    and exists (
      select 1 from public.consultations c
       where (c.id)::text = (storage.foldername(objects.name))[1]
         and ((c.user_id = (select auth.uid())) or (c.expert_id = (select auth.uid()))))
  );

-- The public expert directory shows an approved expert whose account is approved too (a role change resets the
-- account, so a former expert drops out of the directory even though their old row still says approved).
alter policy "experts_select_verified_or_own_or_admin" on public.experts
  using (
    ((verification_status = 'approved') and (select public.is_approved_expert_id(experts.id)))
    or (id = (select auth.uid()))
    or (select public.is_admin())
  );

-- The expert application stays open to a pending expert (it is how they apply), and only to an expert.
alter policy "experts_insert_own" on public.experts
  with check ((id = (select auth.uid())) and (not (select public.is_suspended())) and ((select public.caller_role()) = 'expert'));
alter policy "expert_specializations_owner_insert" on public.expert_specializations
  with check (((expert_id = (select auth.uid())) and (not (select public.is_suspended())) and ((select public.caller_role()) = 'expert')) or (select public.is_admin()));
alter policy "expert_specializations_owner_update" on public.expert_specializations
  using (((expert_id = (select auth.uid())) and (not (select public.is_suspended())) and ((select public.caller_role()) = 'expert')) or (select public.is_admin()))
  with check (((expert_id = (select auth.uid())) and (not (select public.is_suspended())) and ((select public.caller_role()) = 'expert')) or (select public.is_admin()));
alter policy "expert_specializations_owner_delete" on public.expert_specializations
  using (((expert_id = (select auth.uid())) and (not (select public.is_suspended())) and ((select public.caller_role()) = 'expert')) or (select public.is_admin()));
alter policy "expert_verifications_insert_owner" on public.expert_verifications
  with check ((expert_id = (select auth.uid())) and (not (select public.is_suspended())) and ((select public.caller_role()) = 'expert'));
-- Documents go into the expert's own folder, which the app already uses (`<uid>/...`) and the account deletion sweep
-- expects; until now any user could write anywhere in the bucket.
alter policy "expert_documents_owner_write" on storage.objects
  with check (
    (bucket_id = 'expert-documents') and (owner = (select auth.uid()))
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and ((select public.caller_role()) = 'expert')
  );

-- Everything else a user writes: an approved account (D10). Farmers and buyers always are, so this only holds back a
-- pending or rejected dealer or expert.
alter policy "reviews_insert_buyer_completed_order_or_consultation" on public.reviews
  with check (
    (buyer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved())
    and (
      ((order_id is not null) and exists (
        select 1 from public.orders o
         where o.id = reviews.order_id and o.buyer_id = (select auth.uid()) and o.status = 'completed'
           and o.seller_id = reviews.seller_id
           and ((reviews.listing_id is null) or exists (
             select 1 from public.order_items oi where oi.order_id = o.id and oi.listing_id = reviews.listing_id))))
      or ((consultation_id is not null) and exists (
        select 1 from public.consultations c
         where c.id = reviews.consultation_id and c.user_id = (select auth.uid())
           and c.status = any (array['resolved'::public.consultation_status, 'closed'::public.consultation_status])
           and c.expert_id = reviews.seller_id))
    )
  );
alter policy "reports_insert_reporter" on public.reports
  with check ((reporter_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()));

alter policy "farms_owner_insert" on public.farms
  with check (((owner_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved())) or (select public.is_admin()));
alter policy "farms_owner_update" on public.farms
  using (((owner_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved())) or (select public.is_admin()))
  with check (((owner_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved())) or (select public.is_admin()));
alter policy "farms_owner_delete" on public.farms
  using (((owner_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved())) or (select public.is_admin()));
alter policy "farm_crops_owner_insert" on public.farm_crops
  with check (exists (
    select 1 from public.farms f
     where f.id = farm_crops.farm_id
       and (((f.owner_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
            or (select public.is_admin()))));
alter policy "farm_crops_owner_update" on public.farm_crops
  using (exists (
    select 1 from public.farms f
     where f.id = farm_crops.farm_id
       and (((f.owner_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
            or (select public.is_admin()))))
  with check (exists (
    select 1 from public.farms f
     where f.id = farm_crops.farm_id
       and (((f.owner_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
            or (select public.is_admin()))));
alter policy "farm_crops_owner_delete" on public.farm_crops
  using (exists (
    select 1 from public.farms f
     where f.id = farm_crops.farm_id
       and (((f.owner_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
            or (select public.is_admin()))));
alter policy "farmer_profiles_owner_insert" on public.farmer_profiles
  with check (((id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved())) or (select public.is_admin()));
alter policy "farmer_profiles_owner_update" on public.farmer_profiles
  using (((id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved())) or (select public.is_admin()))
  with check (((id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved())) or (select public.is_admin()));

alter policy "disease_cases_insert_owner" on public.disease_cases
  with check ((user_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()));
alter policy "disease_images_owner_write" on storage.objects
  with check (
    (bucket_id = 'disease-images') and (owner = (select auth.uid()))
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text) and (select public.is_account_approved())
  );
alter policy "disease_images_owner_update" on storage.objects
  using (
    (bucket_id = 'disease-images') and (owner = (select auth.uid()))
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text) and (select public.is_account_approved())
  );
alter policy "disease_images_owner_delete" on storage.objects
  using (
    (bucket_id = 'disease-images') and (owner = (select auth.uid()))
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text) and (select public.is_account_approved())
  );

alter policy "listing_views_insert_authenticated" on public.listing_views
  with check (
    ((viewer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved())
      and not exists (
        select 1 from public.listings l where l.id = listing_views.listing_id and l.owner_id = (select auth.uid())))
    or (viewer_id is null)
  );
