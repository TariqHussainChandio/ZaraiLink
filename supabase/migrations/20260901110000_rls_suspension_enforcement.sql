-- Security fix (Phase 1): `profiles.is_suspended` (added in
-- 20260821000000_phase3_schema.sql) is checked in FastAPI (backend/app/core/auth.py:73) but was
-- NEVER enforced in RLS. That migration's own comment says as much: "app-level UX gating only
-- ... NOT enforced inside RLS on every table, so a suspended user's still-valid JWT could still
-- reach the API directly." Concretely: a suspended user's Supabase access token remains
-- cryptographically valid until its own expiry (GoTrue validates JWTs by signature only, not
-- against a revocation list per request) and keeps full RLS-governed write access through
-- Storage, Realtime, and the Auth SDK/PostgREST directly -- any path that doesn't go through
-- FastAPI's `get_current_user` check. Revoking the refresh token on suspend (`auth.admin.sign_out`)
-- would not close this: it only blocks *future* token refreshes, not the currently outstanding
-- access token for up to its remaining `jwt_expiry` (3600s locally/by Supabase default). RLS is
-- evaluated per-query against live database state, so it is the only mechanism that closes the
-- gap in real time regardless of token freshness -- hence enforcing it at the policy layer here.
--
-- `public.is_suspended()` mirrors `public.is_admin()`'s exact shape (security definer, so it can
-- read `profiles` from inside a policy on a DIFFERENT table without a fresh RLS check recursing
-- back through `profiles`' own policies; `stable`, since it only reads within one query).
-- Returns false for anon / no JWT (auth.uid() is null -> no matching row -> coalesce to false),
-- so this never affects anonymous/public read access.
--
-- Scope: every WRITE policy (insert/update/delete/all) whose condition includes an
-- `<owner column> = auth.uid()` ownership check gets that check narrowed to
-- `(<owner column> = auth.uid() AND not public.is_suspended())`. Policies that only gate on
-- `is_admin()` (audit_logs, categories/crops/currencies/units admin_write, expert_verifications
-- admin update, messages admin update, reports admin update, reviews admin delete) are left
-- untouched -- an admin acting as admin isn't the threat model here, and `is_admin()` doesn't
-- itself check suspension (an admin account being suspended is not a modeled scenario). Where a
-- policy already ORs an ownership check with `is_admin()` (e.g. `experts_update_own_or_admin`),
-- only the ownership branch is gated -- the admin branch is untouched so admin oversight/action
-- keeps working even when the row's own actor is suspended (this is exactly how the admin
-- suspend/reactivate action on `profiles` itself keeps working: it goes through the `is_admin()`
-- branch of `profiles_update_own_or_admin`, not the `id = auth.uid()` branch).
--
-- SELECT policies are deliberately NOT touched here: a suspended user reading their own existing
-- data (including their own `is_suspended` flag, so the app can render "Account Suspended") is
-- not the exploit this closes -- the exploit is a suspended user continuing to WRITE (send
-- messages, place orders, list inventory, etc.) via a path that bypasses the FastAPI gate.
--
-- `listing_views_insert_authenticated` is deliberately NOT touched here -- it's being rewritten
-- in the same batch to also fix the self-inflation gap (INSERT not excluding the listing's own
-- owner), and folding both fixes into one `drop policy`/`create policy` pair for that table avoids
-- two migrations racing to redefine the same policy.
--
-- Storage bucket policies (`storage.objects`, a different schema) are out of scope for this
-- migration -- that's the separate, larger "upload validation across every Storage bucket" item
-- already tracked as its own roadmap phase, not folded in here.

create or replace function public.is_suspended()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_suspended from public.profiles where id = auth.uid()),
    false
  );
$$;

-- consultation_messages
drop policy "consultation_messages_insert_participant" on public.consultation_messages;
create policy "consultation_messages_insert_participant"
  on public.consultation_messages for insert
  with check (
    sender_id = auth.uid() and not public.is_suspended()
    and exists (
      select 1 from public.consultations c
      where c.id = consultation_messages.consultation_id
        and (c.user_id = auth.uid() or c.expert_id = auth.uid())
    )
  );

-- consultations
drop policy "consultations_insert_requester" on public.consultations;
create policy "consultations_insert_requester"
  on public.consultations for insert
  with check (user_id = auth.uid() and not public.is_suspended());

drop policy "consultations_update_participants" on public.consultations;
create policy "consultations_update_participants"
  on public.consultations for update
  using (
    (user_id = auth.uid() and not public.is_suspended())
    or (expert_id = auth.uid() and not public.is_suspended())
    or public.is_admin()
  )
  with check (
    (user_id = auth.uid() and not public.is_suspended())
    or (expert_id = auth.uid() and not public.is_suspended())
    or public.is_admin()
  );

-- conversations
drop policy "conversations_insert_participant" on public.conversations;
create policy "conversations_insert_participant"
  on public.conversations for insert
  with check (
    (participant_one = auth.uid() and not public.is_suspended())
    or (participant_two = auth.uid() and not public.is_suspended())
  );

-- dealer_stores
drop policy "dealer_stores_owner_write" on public.dealer_stores;
create policy "dealer_stores_owner_write"
  on public.dealer_stores for all
  using (dealer_id = auth.uid() and not public.is_suspended())
  with check (dealer_id = auth.uid() and not public.is_suspended());

-- disease_cases
drop policy "disease_cases_insert_owner" on public.disease_cases;
create policy "disease_cases_insert_owner"
  on public.disease_cases for insert
  with check (user_id = auth.uid() and not public.is_suspended());

-- expert_specializations
drop policy "expert_specializations_owner_write" on public.expert_specializations;
create policy "expert_specializations_owner_write"
  on public.expert_specializations for all
  using ((expert_id = auth.uid() and not public.is_suspended()) or public.is_admin())
  with check ((expert_id = auth.uid() and not public.is_suspended()) or public.is_admin());

-- expert_verifications
drop policy "expert_verifications_insert_owner" on public.expert_verifications;
create policy "expert_verifications_insert_owner"
  on public.expert_verifications for insert
  with check (expert_id = auth.uid() and not public.is_suspended());

-- experts
drop policy "experts_insert_own" on public.experts;
create policy "experts_insert_own"
  on public.experts for insert
  with check (id = auth.uid() and not public.is_suspended());

drop policy "experts_update_own_or_admin" on public.experts;
create policy "experts_update_own_or_admin"
  on public.experts for update
  using ((id = auth.uid() and not public.is_suspended()) or public.is_admin())
  with check ((id = auth.uid() and not public.is_suspended()) or public.is_admin());

-- farm_crops
drop policy "farm_crops_owner_write" on public.farm_crops;
create policy "farm_crops_owner_write"
  on public.farm_crops for all
  using (
    exists (
      select 1 from public.farms f
      where f.id = farm_crops.farm_id
        and ((f.owner_id = auth.uid() and not public.is_suspended()) or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.farms f
      where f.id = farm_crops.farm_id
        and ((f.owner_id = auth.uid() and not public.is_suspended()) or public.is_admin())
    )
  );

-- farmer_profiles
drop policy "farmer_profiles_owner_write" on public.farmer_profiles;
create policy "farmer_profiles_owner_write"
  on public.farmer_profiles for all
  using ((id = auth.uid() and not public.is_suspended()) or public.is_admin())
  with check ((id = auth.uid() and not public.is_suspended()) or public.is_admin());

-- farms
drop policy "farms_owner_write" on public.farms;
create policy "farms_owner_write"
  on public.farms for all
  using ((owner_id = auth.uid() and not public.is_suspended()) or public.is_admin())
  with check ((owner_id = auth.uid() and not public.is_suspended()) or public.is_admin());

-- inventory
drop policy "inventory_owner_write" on public.inventory;
create policy "inventory_owner_write"
  on public.inventory for all
  using (dealer_id = auth.uid() and not public.is_suspended())
  with check (dealer_id = auth.uid() and not public.is_suspended());

-- inventory_transactions
drop policy "inventory_transactions_owner_insert" on public.inventory_transactions;
create policy "inventory_transactions_owner_insert"
  on public.inventory_transactions for insert
  with check (
    exists (
      select 1 from public.inventory i
      where i.id = inventory_id and i.dealer_id = auth.uid() and not public.is_suspended()
    )
  );

-- listings
drop policy "listings_owner_write" on public.listings;
create policy "listings_owner_write"
  on public.listings for all
  using ((owner_id = auth.uid() and not public.is_suspended()) or public.is_admin())
  with check ((owner_id = auth.uid() and not public.is_suspended()) or public.is_admin());

-- messages
drop policy "messages_insert_participant" on public.messages;
create policy "messages_insert_participant"
  on public.messages for insert
  with check (
    sender_id = auth.uid() and not public.is_suspended()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    )
  );

drop policy "messages_update_participant_read_receipt" on public.messages;
create policy "messages_update_participant_read_receipt"
  on public.messages for update
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (
          (c.participant_one = auth.uid() and not public.is_suspended())
          or (c.participant_two = auth.uid() and not public.is_suspended())
        )
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (
          (c.participant_one = auth.uid() and not public.is_suspended())
          or (c.participant_two = auth.uid() and not public.is_suspended())
        )
    )
  );

-- notifications
drop policy "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (user_id = auth.uid() and not public.is_suspended())
  with check (user_id = auth.uid() and not public.is_suspended());

-- order_items
drop policy "order_items_insert_buyer" on public.order_items;
create policy "order_items_insert_buyer"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.buyer_id = auth.uid() and not public.is_suspended()
    )
  );

-- order_status_history
drop policy "order_status_history_insert_participants" on public.order_status_history;
create policy "order_status_history_insert_participants"
  on public.order_status_history for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_status_history.order_id
        and (
          (o.buyer_id = auth.uid() and not public.is_suspended())
          or (o.seller_id = auth.uid() and not public.is_suspended())
          or public.is_admin()
        )
    )
  );

-- orders
drop policy "orders_insert_buyer" on public.orders;
create policy "orders_insert_buyer"
  on public.orders for insert
  with check (buyer_id = auth.uid() and not public.is_suspended());

drop policy "orders_update_participants" on public.orders;
create policy "orders_update_participants"
  on public.orders for update
  using (
    (buyer_id = auth.uid() and not public.is_suspended())
    or (seller_id = auth.uid() and not public.is_suspended())
    or (public.is_admin() and status = 'disputed')
  )
  with check (
    (buyer_id = auth.uid() and not public.is_suspended())
    or (seller_id = auth.uid() and not public.is_suspended())
    or (public.is_admin() and status in ('refunded', 'completed'))
  );

-- payment_transactions
drop policy "payment_transactions_insert_order_seller_or_admin" on public.payment_transactions;
create policy "payment_transactions_insert_order_seller_or_admin"
  on public.payment_transactions for insert
  with check (
    exists (
      select 1 from public.payments p
      join public.orders o on o.id = p.order_id
      where p.id = payment_transactions.payment_id
        and ((o.seller_id = auth.uid() and not public.is_suspended()) or public.is_admin())
    )
  );

-- payments
drop policy "payments_insert_buyer" on public.payments;
create policy "payments_insert_buyer"
  on public.payments for insert
  with check (buyer_id = auth.uid() and not public.is_suspended());

drop policy "payments_update_order_seller_or_admin" on public.payments;
create policy "payments_update_order_seller_or_admin"
  on public.payments for update
  using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = payments.order_id and o.seller_id = auth.uid() and not public.is_suspended()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = payments.order_id and o.seller_id = auth.uid() and not public.is_suspended()
    )
  );

-- profiles
drop policy "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using ((id = auth.uid() and not public.is_suspended()) or public.is_admin())
  with check ((id = auth.uid() and not public.is_suspended()) or public.is_admin());

-- reports
drop policy "reports_insert_reporter" on public.reports;
create policy "reports_insert_reporter"
  on public.reports for insert
  with check (reporter_id = auth.uid() and not public.is_suspended());

-- reviews
drop policy "reviews_insert_buyer_completed_order_or_consultation" on public.reviews;
create policy "reviews_insert_buyer_completed_order_or_consultation"
  on public.reviews for insert
  with check (
    buyer_id = auth.uid() and not public.is_suspended()
    and (
      (order_id is not null and exists (
        select 1 from public.orders o
        where o.id = reviews.order_id and o.buyer_id = auth.uid() and o.status = 'completed'
      ))
      or (consultation_id is not null and exists (
        select 1 from public.consultations c
        where c.id = reviews.consultation_id and c.user_id = auth.uid()
          and c.status in ('resolved', 'closed')
      ))
    )
  );

-- suppliers
drop policy "suppliers_owner_write" on public.suppliers;
create policy "suppliers_owner_write"
  on public.suppliers for all
  using (dealer_id = auth.uid() and not public.is_suspended())
  with check (dealer_id = auth.uid() and not public.is_suspended());
