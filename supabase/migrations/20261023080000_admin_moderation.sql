-- A7: admin moderation (SRDS §14 admin capabilities, §51 audit event names, BR-11, BR-15).
--
-- Maintainer decisions (2026-10-11):
--   * audit action names follow the SRDS §51 vocabulary, held in one table the audit log references; rows written under
--     the old ad-hoc names are renamed, the old name kept in metadata.change;
--   * a review is hidden with a reason, never deleted, so an admin can restore it; the admin delete policy goes;
--   * an admin may resolve a dispute (unchanged) and cancel an order before dispatch, with a reason. The platform holds no
--     money (BR-11): cancelling moves no funds, and any refund is settled between buyer and seller off the platform;
--   * an admin may close or cancel an open consultation, with a reason;
--   * the admin dashboard reads its queue counts from one function.
-- Every admin action here is audit-logged by the backend in the same request (BR-15), under the names below.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Audit event names (SRDS §51)
-- ---------------------------------------------------------------------------------------------------------------------

-- Reference data, written by migrations only: no client role holds insert, update or delete. The label is what the audit
-- screen shows, so the vocabulary is the same in the database, the API and the app.
create table public.audit_event_names (
  name text primary key check (name ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (char_length(btrim(label)) between 2 and 80)
);

alter table public.audit_event_names enable row level security;

grant select on public.audit_event_names to authenticated;
grant select on public.audit_event_names to service_role;

-- Only the admin reads the audit log, so only the admin needs its vocabulary.
create policy "audit_event_names_select_admin" on public.audit_event_names for select
  to authenticated
  using ((select public.is_admin()));

insert into public.audit_event_names (name, label) values
  ('dealer_application_approved', 'Dealer Application Approved'),
  ('dealer_application_rejected', 'Dealer Application Rejected'),
  ('expert_application_approved', 'Expert Application Approved'),
  ('expert_application_rejected', 'Expert Application Rejected'),
  ('user_suspended', 'User Suspended'),
  ('user_reactivated', 'User Reactivated'),
  ('user_role_changed', 'User Role Changed'),
  ('product_moderated', 'Product Moderated'),
  ('review_moderated', 'Review Moderated'),
  ('order_administrative_action', 'Order Administrative Action'),
  ('ai_configuration_changed', 'AI Configuration Changed'),
  ('report_resolved', 'Report Resolved'),
  ('report_dismissed', 'Report Dismissed'),
  -- An admin's change to a report that neither resolves nor dismisses it (an investigation, a note): written by the
  -- reports audit trigger (section 7), so no admin write to a report goes unlogged.
  ('report_updated', 'Report Updated'),
  ('message_redacted', 'Message Redacted'),
  ('category_changed', 'Category Changed'),
  ('reference_data_changed', 'Reference Data Changed'),
  ('required_document_changed', 'Required Document Changed'),
  ('admin_email_changed', 'Admin Email Changed'),
  ('consultation_moderated', 'Consultation Moderated'),
  -- Not an admin action: written by the service role when a user deletes their own account (profile repository).
  ('account_self_deleted', 'Account Self Deleted');

-- The old names map onto §51 names; the old one stays in metadata.change so no detail is lost (the required-document
-- rows already say created or updated, which is the change).
update public.audit_logs a
   set action = m.new_name,
       metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object('change', m.old_name)
  from (values
    ('suspend_user', 'user_suspended'),
    ('reactivate_user', 'user_reactivated'),
    ('change_role', 'user_role_changed'),
    ('update_listing_status', 'product_moderated'),
    ('delete_review', 'review_moderated'),
    ('resolve_order_dispute', 'order_administrative_action'),
    ('resolve_report', 'report_resolved'),
    ('dismiss_report', 'report_dismissed'),
    ('redact_message', 'message_redacted'),
    ('create_category', 'category_changed'),
    ('update_category', 'category_changed'),
    ('delete_category', 'category_changed'),
    ('create_reference_data', 'reference_data_changed'),
    ('update_reference_data', 'reference_data_changed'),
    ('delete_reference_data', 'reference_data_changed'),
    ('required_document_created', 'required_document_changed'),
    ('required_document_updated', 'required_document_changed')
  ) as m (old_name, new_name)
 where a.action = m.old_name;

-- A row under a name nobody mapped (an older client wrote its own names before FastAPI owned the audit log) must not
-- block the foreign key, and must not be rewritten into a name it never meant: its name joins the vocabulary as it is.
insert into public.audit_event_names (name, label)
select distinct a.action, initcap(replace(a.action, '_', ' '))
  from public.audit_logs a
 where a.action ~ '^[a-z][a-z0-9_]*$'
on conflict (name) do nothing;

-- From here an action outside the vocabulary is refused by the database (BR-15: the log means the same thing everywhere).
-- ON UPDATE CASCADE so a later rename of a §51 name carries the history with it.
alter table public.audit_logs
  add constraint audit_logs_action_fkey foreign key (action)
  references public.audit_event_names (name) on update cascade;
create index audit_logs_action_idx on public.audit_logs (action);

-- The required-document trigger (20261012080000) writes the §51 name; created or updated goes to metadata.change.
create or replace function public.audit_required_documents()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (actor_id, action, target_entity, target_id, previous_state, new_state, metadata)
  values (
    (select auth.uid()),
    'required_document_changed',
    'required_documents',
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) - 'updated_at' end,
    to_jsonb(new) - 'updated_at',
    jsonb_build_object('change', case tg_op when 'INSERT' then 'required_document_created' else 'required_document_updated' end)
  );
  return new;
end;
$$;

revoke execute on function public.audit_required_documents() from public, anon, authenticated;

-- decide_account_status() writes format('%s_application_%s', role, decision); it refuses every role but dealer and
-- expert and every decision but approved and rejected, so its four names are all in the table above and it is unchanged.
-- audit_admin_email_change() writes admin_email_changed, also in the table, and is unchanged.

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Reviews: hidden with a reason, restorable (SRDS §14 "moderate reviews")
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.reviews
  add column hidden_at timestamptz,
  add column hidden_reason text,
  add column hidden_by uuid references public.profiles (id) on delete set null,
  -- A hidden review always says why; a visible one carries no stale reason. hidden_by may be null after the admin's
  -- profile is deleted, so it is not part of the rule. `hidden_reason is not null` is spelled out: on a null reason the
  -- length test is null, and a CHECK that evaluates to null passes.
  add constraint reviews_hidden_reason_check check (
    (hidden_at is null and hidden_reason is null and hidden_by is null)
    or (hidden_at is not null and hidden_reason is not null and char_length(btrim(hidden_reason)) between 1 and 500)
  );

create index reviews_hidden_by_idx on public.reviews (hidden_by);
-- Public reads filter on it in the select policy.
create index reviews_hidden_at_idx on public.reviews (hidden_at);

-- One permissive select policy, as before (merge_permissive_policies): everyone sees visible reviews; the author still
-- sees their own hidden one (so they are not confused by it vanishing) and the admin sees all, to restore one.
-- The seller does not see a hidden review of themselves, and no rating counts it, because readers never get the row.
alter policy "reviews_select_all" on public.reviews
  using (
    (hidden_at is null)
    or (buyer_id = (select auth.uid()))
    or (select public.is_admin())
  );

-- Hiding replaces deleting: the review, its rating and its history stay, and the decision can be undone.
drop policy "reviews_admin_delete" on public.reviews;
revoke delete on public.reviews from authenticated;

-- A moderation write is a second-factor admin write, like every other (admin_mfa_enforcement). The column grant keeps
-- every other column out of reach of any update by a client.
create policy "reviews_admin_update" on public.reviews for update
  to authenticated
  using ((select public.is_admin_aal2()))
  with check ((select public.is_admin_aal2()));
grant update (hidden_at, hidden_reason, hidden_by) on public.reviews to authenticated;

-- The table-wide insert grant would let an author file a review already hidden, under any admin's name as hidden_by
-- (a forged moderation record). The author writes the review's own columns only, the ones the API sends
-- (reviews/repository.py: create_review, create_consultation_review); id and created_at take their defaults.
revoke insert on public.reviews from authenticated;
grant insert (order_id, consultation_id, listing_id, seller_id, buyer_id, rating, comment) on public.reviews to authenticated;

-- The guard makes the moderation columns mean what they say whatever the client sends: hiding stamps the time and the
-- acting admin from the session, restoring clears all three.
create function public.guard_reviews_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if not (select public.is_admin_aal2()) then
    raise exception 'Only an admin with a second factor can moderate a review' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'hidden_at' - 'hidden_reason' - 'hidden_by') is distinct from
     (to_jsonb(old) - 'hidden_at' - 'hidden_reason' - 'hidden_by') then
    raise exception 'An admin can only hide or restore a review' using errcode = '42501';
  end if;

  if new.hidden_at is null then
    new.hidden_reason := null;
    new.hidden_by := null;
    return new;
  end if;

  new.hidden_reason := nullif(btrim(new.hidden_reason), '');
  if new.hidden_reason is null then
    raise exception 'Hiding a review needs a reason' using errcode = '23514';
  end if;
  if old.hidden_at is null then
    new.hidden_at := now();
  else
    new.hidden_at := old.hidden_at;
  end if;
  new.hidden_by := (select auth.uid());
  return new;
end;
$$;

revoke execute on function public.guard_reviews_update() from public, anon, authenticated;

create trigger a_guard_reviews_update
  before update on public.reviews
  for each row execute function public.guard_reviews_update();

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Orders: an admin may cancel before dispatch, with a reason (SRDS §14, BR-11)
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.orders add column admin_action_reason text
  constraint orders_admin_action_reason_length check (char_length(admin_action_reason) <= 500);

-- guard_orders_update from 20261019080000 (A4), every rule kept, plus the admin's cancellation:
--   * the admin may move pending, confirmed, processing or ready to cancelled, only with a reason and a second factor
--     (a new admin write, so aal2 like every other: admin_mfa_enforcement; the API route requires it too, and without it
--     here a password-only admin session could cancel over the Data API with no audit row). Nothing dispatched or
--     completed is cancelled (D5: the goods have left the seller). No money moves (BR-11: the platform holds none);
--   * only the admin writes admin_action_reason, and only together with a status change (a cancellation or a dispute
--     resolution), so the reason always belongs to the action it explains.
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

  -- Only the status (and, for the admin, the reason) moves after an order is placed. `total` is generated (BR-09) and
  -- Postgres computes it after BEFORE triggers run, so it is left out and protected through the two columns it is made of.
  if (to_jsonb(new) - 'status' - 'updated_at' - 'total' - 'admin_action_reason') is distinct from
     (to_jsonb(old) - 'status' - 'updated_at' - 'total' - 'admin_action_reason') then
    raise exception 'Only the order status can be changed' using errcode = '42501';
  end if;

  if new.admin_action_reason is distinct from old.admin_action_reason then
    if not (select public.is_admin_aal2()) then
      raise exception 'Only an admin with a second factor can give an administrative reason' using errcode = '42501';
    end if;
    if new.status is not distinct from old.status then
      raise exception 'An administrative reason is given with the action it explains' using errcode = '23514';
    end if;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Resolving a dispute is an admin write, so it needs the second factor too (the API's route requires it; without it
  -- here a password-only admin session could settle a dispute over the Data API with no audit row).
  if old.status = 'disputed' then
    if not (select public.is_admin_aal2()) then
      raise exception 'Only an admin with a second factor can resolve a disputed order' using errcode = '42501';
    end if;
    if new.status not in ('refunded', 'completed') then
      raise exception 'A disputed order can only be refunded or completed' using errcode = '23514';
    end if;
    -- Both parties read why the dispute ended as it did (the API requires the reason too).
    new.admin_action_reason := nullif(btrim(new.admin_action_reason), '');
    if new.admin_action_reason is null then
      raise exception 'Settling a dispute needs a reason' using errcode = '23514';
    end if;
    return new;
  end if;

  -- The admin's cancellation (SRDS §14): before dispatch only, with a second factor, and never without a reason.
  if new.status = 'cancelled' and old.status in ('pending', 'confirmed', 'processing', 'ready')
     and (select public.is_admin_aal2()) then
    new.admin_action_reason := nullif(btrim(new.admin_action_reason), '');
    if new.admin_action_reason is null then
      raise exception 'An admin cancellation needs a reason' using errcode = '23514';
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

revoke execute on function public.guard_orders_update() from public, anon, authenticated;

-- guard_orders_insert from 20261019080000, unchanged but for the reason: a new order carries no admin action.
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
  new.admin_action_reason := null;
  new.product_subtotal := 0;
  new.created_at := now();
  return new;
end;
$$;

revoke execute on function public.guard_orders_insert() from public, anon, authenticated;

-- With a second factor, the admin reaches a disputed order (to resolve it; A0 allowed it at aal1, which let a
-- password-only admin session settle a dispute directly with no audit row) and an order before dispatch (to cancel it).
-- The guard above decides which moves are allowed; the policy only lets the admin reach the row and land on an admin
-- outcome: refunded or completed from a dispute, cancelled before dispatch.
alter policy "orders_update_participants" on public.orders
  using (
    ((buyer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
    or ((seller_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
    or ((select public.is_admin_aal2()) and (status = 'disputed'::public.order_status))
    or ((select public.is_admin_aal2()) and (status = any (array['pending'::public.order_status,
        'confirmed'::public.order_status, 'processing'::public.order_status, 'ready'::public.order_status])))
  )
  with check (
    ((buyer_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
    or ((seller_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved()))
    or ((select public.is_admin_aal2()) and (status = any (array['refunded'::public.order_status, 'completed'::public.order_status])))
    or ((select public.is_admin_aal2()) and (status = 'cancelled'::public.order_status))
  );

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Consultations: an admin may close or cancel an open one, with a reason (SRDS §14)
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.consultations add column moderation_reason text
  constraint consultations_moderation_reason_length check (char_length(moderation_reason) <= 500);

-- guard_consultations_update from 20260927090000, every rule kept, plus the admin's moderation: from any status that is
-- still open (requested, accepted, in_progress, resolved) to closed or cancelled, only with a reason and a second factor
-- (a new admin write, so aal2 like every other; the API route requires it too, and without it here a password-only admin
-- session could moderate over the Data API with no audit row). Only such an admin writes moderation_reason, and only
-- with that status change. consultations_update_participants already lets the admin reach the row (20261005080000).
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

  if (to_jsonb(new) - 'status' - 'images' - 'updated_at' - 'moderation_reason') is distinct from
     (to_jsonb(old) - 'status' - 'images' - 'updated_at' - 'moderation_reason') then
    raise exception 'Only the consultation status and photos can be changed' using errcode = '42501';
  end if;

  if new.images is distinct from old.images and caller is distinct from old.user_id then
    raise exception 'Only the requester can change the photos' using errcode = '42501';
  end if;

  if new.moderation_reason is distinct from old.moderation_reason then
    if not (select public.is_admin_aal2()) then
      raise exception 'Only an admin with a second factor can give a moderation reason' using errcode = '42501';
    end if;
    if new.status is not distinct from old.status then
      raise exception 'A moderation reason is given with the action it explains' using errcode = '23514';
    end if;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status in ('closed', 'cancelled') and old.status in ('requested', 'accepted', 'in_progress', 'resolved')
     and (select public.is_admin_aal2()) then
    new.moderation_reason := nullif(btrim(new.moderation_reason), '');
    if new.moderation_reason is null then
      raise exception 'Closing or cancelling a consultation as an admin needs a reason' using errcode = '23514';
    end if;
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

-- guard_consultations_insert from 20261022080000, plus: a new consultation carries no moderation.
create or replace function public.guard_consultations_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.disease_case_id is not null and not exists (
    select 1 from public.disease_cases dc where dc.id = new.disease_case_id and dc.user_id = new.user_id
  ) then
    raise exception 'A consultation can only refer to your own disease case' using errcode = '42501';
  end if;
  if current_user = 'authenticated' then
    new.moderation_reason := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_consultations_insert() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. The admin dashboard's queues (SRDS §14)
-- ---------------------------------------------------------------------------------------------------------------------

-- One call for the dashboard's counts. Definer rights so the counts are whole whatever any one policy hides; the admin
-- check inside is the gate, so execute can go to every signed-in user.
create function public.admin_queue_counts()
returns table (
  pending_dealer_applications int,
  pending_expert_applications int,
  open_reports int,
  disputed_orders int,
  stale_consultations int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can read the moderation queues' using errcode = '42501';
  end if;

  return query select
    -- A submitted application only: a draft is not waiting for the admin (decide_account_status refuses it).
    (select count(*)::int from public.profiles p
      where p.role = 'dealer' and p.account_status = 'pending' and p.application_submitted_at is not null),
    (select count(*)::int from public.profiles p
      where p.role = 'expert' and p.account_status = 'pending' and p.application_submitted_at is not null),
    (select count(*)::int from public.reports r where r.status in ('open', 'investigating')),
    (select count(*)::int from public.orders o where o.status = 'disputed'),
    -- Open for a week without an outcome: the admin may need to close or cancel it.
    (select count(*)::int from public.consultations c
      where c.status in ('requested', 'accepted', 'in_progress') and c.created_at < now() - interval '7 days');
end;
$$;

revoke execute on function public.admin_queue_counts() from public, anon;
grant execute on function public.admin_queue_counts() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Every admin write needs a second factor (admin_mfa_enforcement, BR-15)
-- ---------------------------------------------------------------------------------------------------------------------

-- The admin's API write routes all require aal2 (require_admin_aal2), and the audit row is written in the same request.
-- A write policy that admits is_admin() at aal1 let a password-only admin session write the same table directly over
-- the Data API, with no audit row: proven for categories (insert 201, nothing in audit_logs). A sweep of every non-select
-- policy found the same admin term on the tables below; each admin branch now asks for is_admin_aal2(). Reads keep
-- is_admin(). The owner branches are unchanged, copied from their last definitions.

-- Categories and crops (20260926080100_merge_permissive_policies): the other reference data (currencies, units) has been
-- aal2 since 20260924080100. Dropped and recreated rather than altered, so the whole policy reads in one place.
drop policy "categories_admin_insert" on public.categories;
create policy "categories_admin_insert" on public.categories for insert
  with check ((select public.is_admin_aal2()));
drop policy "categories_admin_update" on public.categories;
create policy "categories_admin_update" on public.categories for update
  using ((select public.is_admin_aal2()))
  with check ((select public.is_admin_aal2()));
drop policy "categories_admin_delete" on public.categories;
create policy "categories_admin_delete" on public.categories for delete
  using ((select public.is_admin_aal2()));

drop policy "crops_admin_insert" on public.crops;
create policy "crops_admin_insert" on public.crops for insert
  with check ((select public.is_admin_aal2()));
drop policy "crops_admin_update" on public.crops;
create policy "crops_admin_update" on public.crops for update
  using ((select public.is_admin_aal2()))
  with check ((select public.is_admin_aal2()));
drop policy "crops_admin_delete" on public.crops;
create policy "crops_admin_delete" on public.crops for delete
  using ((select public.is_admin_aal2()));

-- The audit log itself: no client writes it any more. An aal1 admin session could write entries (a record of an action
-- never taken), and an aal2 one could write them in another admin's name or in nobody's (found by the A7 verification).
-- Since section 7 the database writes every admin action's row from the table it changes, through definer triggers that
-- no policy or grant here holds back, and the backend's own log_admin_action is gone; its one remaining audit write,
-- account_self_deleted, uses the service role, which keeps its insert grant (20260924080000). So the client insert path
-- closes: the policy goes and authenticated (and anon and public, should they ever hold it) lose the grant. The
-- created_at guard (section 7) stays as defence in depth for the writers that remain.
drop policy "audit_logs_insert_admin" on public.audit_logs;
revoke insert on public.audit_logs from authenticated, anon, public;

-- A suspended admin is no admin (found by the A7 verification: a suspended admin with a second factor inserted a
-- category). Every admin policy and guard reads these two helpers, so a suspension now takes the admin's reads and
-- writes together; is_admin_aal2() follows through is_admin().
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin' and not is_suspended
  );
$$;

-- Consultations: the admin's moderation (section 4) needs the second factor to reach the row too.
alter policy "consultations_update_participants" on public.consultations
  using ((((user_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_account_approved())) OR ((expert_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_approved_expert())) OR (select public.is_admin_aal2())))
  with check ((((user_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_account_approved())) OR ((expert_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_approved_expert())) OR (select public.is_admin_aal2())));

-- The farmer's farms, farm crops and farmer profile, and an expert's specialisations: their admin branches let an admin
-- edit a user's own records. No API route does it, no SRDS §14 capability asks for it and §51 has no name for it, so
-- the admin branch goes (least privilege) rather than become an audited write nobody needs; the owner branches stay as
-- they were. An admin still reads these rows through the select policies.
alter policy "expert_specializations_owner_delete" on public.expert_specializations
  using ((((expert_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND ((select public.caller_role()) = 'expert'::public.user_role) AND ((select public.is_application_editable()) OR (select public.is_account_approved())))));

alter policy "expert_specializations_owner_insert" on public.expert_specializations
  with check ((((expert_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND ((select public.caller_role()) = 'expert'::public.user_role) AND ((select public.is_application_editable()) OR (select public.is_account_approved())))));

alter policy "expert_specializations_owner_update" on public.expert_specializations
  using ((((expert_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND ((select public.caller_role()) = 'expert'::public.user_role) AND ((select public.is_application_editable()) OR (select public.is_account_approved())))))
  with check ((((expert_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND ((select public.caller_role()) = 'expert'::public.user_role) AND ((select public.is_application_editable()) OR (select public.is_account_approved())))));

alter policy "farm_crops_owner_delete" on public.farm_crops
  using ((EXISTS ( SELECT 1
   FROM public.farms f
  WHERE ((f.id = farm_crops.farm_id) AND (((f.owner_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_account_approved())))))));

alter policy "farm_crops_owner_insert" on public.farm_crops
  with check ((EXISTS ( SELECT 1
   FROM public.farms f
  WHERE ((f.id = farm_crops.farm_id) AND (((f.owner_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_account_approved())))))));

alter policy "farm_crops_owner_update" on public.farm_crops
  using ((EXISTS ( SELECT 1
   FROM public.farms f
  WHERE ((f.id = farm_crops.farm_id) AND (((f.owner_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_account_approved())))))))
  with check ((EXISTS ( SELECT 1
   FROM public.farms f
  WHERE ((f.id = farm_crops.farm_id) AND (((f.owner_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_account_approved())))))));

alter policy "farmer_profiles_owner_insert" on public.farmer_profiles
  with check ((((id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_account_approved()))));

alter policy "farmer_profiles_owner_update" on public.farmer_profiles
  using ((((id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_account_approved()))))
  with check ((((id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_account_approved()))));

alter policy "farms_owner_delete" on public.farms
  using ((((owner_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_account_approved()))));

alter policy "farms_owner_insert" on public.farms
  with check ((((owner_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_account_approved()))));

alter policy "farms_owner_update" on public.farms
  using ((((owner_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_account_approved()))))
  with check ((((owner_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (select public.is_account_approved()))));

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. The database writes the audit row for every admin write (BR-15, SRDS §51)
-- ---------------------------------------------------------------------------------------------------------------------

-- Maintainer decision (A7 verification, F1), following audit_disease_knowledge (A6) and audit_required_documents (A3b):
-- an admin's write is audited by the table it changes, in the same transaction, so a direct Data API write is audited
-- exactly like one through FastAPI, and a failed audit write rolls the change back. Each trigger below writes exactly
-- one row when the session's user is an admin (auth.uid(), is_admin()) acting as an admin, under the §51 name and the
-- metadata.change the backend wrote before (so the history reads the same), with actor_id = auth.uid() and only the
-- columns the action is about. Server-side writes (migrations, the service role) have no admin user and write none.
-- The functions run as their owner to write the log (no client may insert into it, section 6); no client may call them.

-- An audit row gets the database's time, whatever its writer sent (F2: a row back-dated to 2020 was accepted while
-- clients could still insert; kept for the service role and any later writer).
create function public.guard_audit_logs_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

revoke execute on function public.guard_audit_logs_insert() from public, anon, authenticated;

create trigger a_guard_audit_logs_insert
  before insert on public.audit_logs
  for each row execute function public.guard_audit_logs_insert();

-- The columns that changed between two row images, before and after (an update records what it changed, not the row).
create function public.audit_changed(_old jsonb, _new jsonb, out before jsonb, out after jsonb)
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(o.key, o.value) filter (where o.value is distinct from _new -> o.key), '{}'::jsonb),
         coalesce(jsonb_object_agg(o.key, _new -> o.key) filter (where o.value is distinct from _new -> o.key), '{}'::jsonb)
    from jsonb_each(_old) o
$$;

revoke execute on function public.audit_changed(jsonb, jsonb) from public, anon, authenticated;

-- An admin on another user's profile changes the suspension and the role only (the two admin actions §14 names, the
-- only ones the API makes); before this the admin branch admitted a whole-row update with no §51 name to audit it by.
-- As for listings and experts (20260928090000). Server-side sessions, and the definer decide_account_status(), are
-- unaffected. Runs before guard_profiles_role (BEFORE triggers fire in name order), which fills in the account status a
-- role change resets.
create function public.guard_profiles_admin_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- G3: an admin's own role or suspension is changed by another admin, never by themselves (§14 names no self-edit, and
  -- the audit trigger, which runs after the change, would no longer see an admin). A user cannot suspend or lift their
  -- own suspension either: suspension is the admin's decision. A non-admin's own role change is refused, with its own
  -- message, by guard_profiles_role.
  if current_user = 'authenticated'
     and old.id = (select auth.uid())
     and (new.is_suspended is distinct from old.is_suspended
          or (new.role is distinct from old.role and (select public.is_admin()))) then
    raise exception 'Nobody changes their own role or suspension; another admin does it' using errcode = '42501';
  end if;
  if current_user = 'authenticated'
     and old.id is distinct from (select auth.uid())
     and (to_jsonb(new) - 'is_suspended' - 'role' - 'updated_at')
         is distinct from (to_jsonb(old) - 'is_suspended' - 'role' - 'updated_at') then
    raise exception 'An admin may change only the suspension and the role of another user''s profile'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_profiles_admin_update() from public, anon, authenticated;

create trigger guard_profiles_admin_update
  before update on public.profiles
  for each row execute function public.guard_profiles_admin_update();

-- Categories (category_changed) and the reference data (reference_data_changed): the §51 name is the trigger argument.
-- metadata.change is create, update or delete, as the backend wrote it; an update records the changed columns.
create function public.audit_reference_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  diff record;
  v_prev jsonb;
  v_new jsonb;
  v_change text;
  v_row jsonb;
begin
  if not public.is_admin() then
    return null;
  end if;
  if tg_op = 'INSERT' then
    v_row := to_jsonb(new);
    v_new := v_row - 'created_at';
    v_change := 'create';
  elsif tg_op = 'UPDATE' then
    v_row := to_jsonb(new);
    select * into diff from public.audit_changed(to_jsonb(old), v_row);
    if diff.before = '{}'::jsonb then
      return null;  -- an update that changed nothing is no admin action (G4)
    end if;
    v_prev := diff.before;
    v_new := diff.after;
    v_change := 'update';
  else
    v_row := to_jsonb(old);
    v_prev := v_row - 'created_at';
    v_change := 'delete';
  end if;
  insert into public.audit_logs (actor_id, action, target_entity, target_id, previous_state, new_state, metadata)
  values ((select auth.uid()), tg_argv[0], tg_table_name, (v_row ->> 'id')::uuid, v_prev, v_new,
          jsonb_build_object('change', v_change));
  return null;
end;
$$;

revoke execute on function public.audit_reference_write() from public, anon, authenticated;

create trigger audit_admin_write after insert or update or delete on public.categories
  for each row execute function public.audit_reference_write('category_changed');
create trigger audit_admin_write after insert or update or delete on public.crops
  for each row execute function public.audit_reference_write('reference_data_changed');
create trigger audit_admin_write after insert or update or delete on public.currencies
  for each row execute function public.audit_reference_write('reference_data_changed');
create trigger audit_admin_write after insert or update or delete on public.units
  for each row execute function public.audit_reference_write('reference_data_changed');

-- The moderation writes, one branch per table. Each branch first decides whether this update is an admin action (the
-- admin is not acting on their own row; the policies and guards have already limited what the admin could change) and
-- whether the columns the action is about changed at all (G4: a no-op restore, a re-redaction of the same text or an
-- unchanged role is no action and writes no row), then writes the one row. tg_argv[0] tells the profile triggers apart.
-- An admin acting on their own profile's role or suspension is refused before the change (guard_profiles_admin_update),
-- so the check here, made after the change, never misses one.
create function public.audit_admin_moderation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := (select auth.uid());
  diff record;
  v_action text;
  v_entity text := tg_table_name;
  v_prev jsonb;
  v_new jsonb;
  v_meta jsonb;
begin
  if actor is null or not public.is_admin() then
    return null;
  end if;

  case tg_table_name
  when 'profiles' then
    if tg_argv[0] = 'suspension' then
      if new.is_suspended is not distinct from old.is_suspended then
        return null;
      end if;
      v_action := case when new.is_suspended then 'user_suspended' else 'user_reactivated' end;
      v_prev := jsonb_build_object('is_suspended', old.is_suspended);
      v_new := jsonb_build_object('is_suspended', new.is_suspended);
    else
      if new.role is not distinct from old.role then
        return null;
      end if;
      v_action := 'user_role_changed';
      v_prev := jsonb_build_object('role', old.role);
      v_new := jsonb_build_object('role', new.role);
    end if;

  when 'listings' then
    if old.owner_id = actor or new.status is not distinct from old.status then
      return null;
    end if;
    v_action := 'product_moderated';
    v_prev := jsonb_build_object('status', old.status);
    v_new := jsonb_build_object('status', new.status);

  when 'reports' then
    v_action := case new.status when 'resolved' then 'report_resolved' when 'dismissed' then 'report_dismissed'
                else 'report_updated' end;
    select * into diff from public.audit_changed(to_jsonb(old), to_jsonb(new));
    if diff.before = '{}'::jsonb then
      return null;
    end if;
    v_prev := diff.before;
    v_new := diff.after;
    v_meta := jsonb_build_object('notes', new.resolution_notes);

  when 'reviews' then
    if (new.hidden_at, new.hidden_reason) is not distinct from (old.hidden_at, old.hidden_reason) then
      return null;
    end if;
    v_action := 'review_moderated';
    v_prev := jsonb_build_object('hidden_at', old.hidden_at, 'hidden_reason', old.hidden_reason);
    v_new := jsonb_build_object('hidden_at', new.hidden_at, 'hidden_reason', new.hidden_reason);
    v_meta := jsonb_build_object('change', case when new.hidden_at is null then 'restore' else 'hide' end);

  when 'orders' then
    if actor in (old.buyer_id, old.seller_id) or new.status is not distinct from old.status then
      return null;
    end if;
    v_action := 'order_administrative_action';
    v_entity := 'order';  -- the name the backend gave every order row, kept so the history filters the same
    v_prev := jsonb_build_object('status', old.status);
    v_new := jsonb_build_object('status', new.status, 'admin_action_reason', new.admin_action_reason);
    v_meta := jsonb_build_object('change', case when old.status = 'disputed' then 'resolve_dispute' else 'cancel' end);

  when 'consultations' then
    if actor in (old.user_id, old.expert_id) or new.status is not distinct from old.status then
      return null;
    end if;
    v_action := 'consultation_moderated';
    v_prev := jsonb_build_object('status', old.status, 'moderation_reason', old.moderation_reason);
    v_new := jsonb_build_object('status', new.status, 'moderation_reason', new.moderation_reason);
    v_meta := jsonb_build_object('change', case when new.status = 'closed' then 'close' else 'cancel' end);

  when 'messages' then
    -- AFTER UPDATE OF body. The redacted text is not copied into the log: removing it is the point of the action.
    if old.sender_id = actor or new.body is not distinct from old.body then
      return null;
    end if;
    v_action := 'message_redacted';
    v_meta := jsonb_build_object('conversation_id', old.conversation_id);
  end case;

  insert into public.audit_logs (actor_id, action, target_entity, target_id, previous_state, new_state, metadata)
  values (actor, v_action, v_entity, old.id, v_prev, v_new, v_meta);
  return null;
end;
$$;

revoke execute on function public.audit_admin_moderation() from public, anon, authenticated;

create trigger audit_admin_suspension after update of is_suspended on public.profiles
  for each row execute function public.audit_admin_moderation('suspension');
create trigger audit_admin_role after update of role on public.profiles
  for each row execute function public.audit_admin_moderation('role');
create trigger audit_admin_write after update on public.listings
  for each row execute function public.audit_admin_moderation();
create trigger audit_admin_write after update on public.reports
  for each row execute function public.audit_admin_moderation();
create trigger audit_admin_write after update on public.reviews
  for each row execute function public.audit_admin_moderation();
create trigger audit_admin_write after update on public.orders
  for each row execute function public.audit_admin_moderation();
create trigger audit_admin_write after update on public.consultations
  for each row execute function public.audit_admin_moderation();
create trigger audit_admin_write after update of body on public.messages
  for each row execute function public.audit_admin_moderation();

-- Not given a trigger, with the reason:
--   * experts: an admin session cannot change verification_status (guard_experts_verification_status) and may change
--     nothing else on another expert's row (guard_experts_admin_update); a decision goes through decide_account_status(),
--     which writes its own row (and does the same for dealers, through profiles.account_status);
--   * required_documents and disease_knowledge: audited by their own triggers since A3b and A6;
--   * farms, farm_crops, farmer_profiles, expert_specializations: no admin write path any more (section 6).

-- ---------------------------------------------------------------------------------------------------------------------
-- 8. What an admin's direct write may change (A7 re-verification, G1, G2, G4)
-- ---------------------------------------------------------------------------------------------------------------------

-- Messages. G1: the body guard asked only for an admin, so an aal2 admin could replace a buyer's message with any words
-- (proven: "I agree to pay Rs 50000 extra in cash", read by the farmer as the buyer's own), under an audit row that keeps
-- no text. A redaction now writes exactly the API's marker (common/messaging/repository.py: redact_message) and nothing
-- else. G2: messages_update admits an admin on the whole row, so an admin could also mark anyone's message read; on a
-- conversation the admin is not part of, the body is the only column that may move. A participant's own path (marking a
-- received message read) is unchanged. The existing checks are kept as they were, with their messages.
create or replace function public.guard_messages_updates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.sender_id is distinct from old.sender_id
    or new.conversation_id is distinct from old.conversation_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'sender_id, conversation_id, and created_at cannot be changed';
  end if;

  if new.body is distinct from old.body and not public.is_admin() then
    raise exception 'Only an admin may change a message body (moderation redaction)';
  end if;

  if current_user = 'authenticated' and public.is_admin() then
    if new.body is distinct from old.body and new.body is distinct from '[removed by moderator]' then
      raise exception 'A redaction replaces the message with the moderator marker, nothing else' using errcode = '42501';
    end if;
    -- A participant sees their conversation through its select policy; an admin who is not one does not.
    if not exists (
      select 1 from public.conversations c
       where c.id = old.conversation_id and (select auth.uid()) in (c.participant_one, c.participant_two)
    ) and (to_jsonb(new) - 'body') is distinct from (to_jsonb(old) - 'body') then
      raise exception 'An admin may only redact another user''s message' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_messages_updates() from public, anon, authenticated;

-- Reports. G4: the resolver is the admin who resolved it, whatever the client sent; a report moved back to open or
-- investigating carries no resolver. Server-side sessions are unaffected.
create function public.guard_reports_admin_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'authenticated' or not (select public.is_admin()) then
    return new;
  end if;
  if new.status in ('resolved', 'dismissed') then
    if new.status is distinct from old.status then
      new.resolved_by := (select auth.uid());
      new.resolved_at := now();
    else
      new.resolved_by := old.resolved_by;
      new.resolved_at := old.resolved_at;
    end if;
  else
    new.resolved_by := null;
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_reports_admin_update() from public, anon, authenticated;

create trigger a_guard_reports_admin_update
  before update on public.reports
  for each row execute function public.guard_reports_admin_update();
