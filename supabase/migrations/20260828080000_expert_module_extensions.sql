-- Module 14 (Expert Module, §16). Purely additive.

-- ── consultation chat needs live delivery, same as `messages` (Module 12/13 noted this gap) ──
alter publication supabase_realtime add table public.consultation_messages;

-- ── product recommendations inside a consultation thread ────────────────────────────────────
-- Nullable: most messages aren't a recommendation. Referencing `listings` (not a separate
-- recommendations table) keeps this a plain message with an optional deep-link, matching how
-- `attachments` on `messages`/`consultation_messages` are already "a message, plus extra".
alter table public.consultation_messages
  add column recommended_listing_id uuid references public.listings (id) on delete set null;

-- ── expert verification documents ────────────────────────────────────────────────────────────
-- Private bucket (like `message-attachments`, unlike public `avatars`/`listing-images`) —
-- qualification documents are sensitive; only the owning expert and admin (reviewing the
-- application) should ever read them.
insert into storage.buckets (id, name, public)
values ('expert-documents', 'expert-documents', false)
on conflict (id) do nothing;

create policy "expert_documents_owner_or_admin_read"
  on storage.objects for select
  using (bucket_id = 'expert-documents' and (owner = auth.uid() or public.is_admin()));

create policy "expert_documents_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'expert-documents' and owner = auth.uid());

-- ── consultation-linked reviews (§15 for experts, not just orders) ──────────────────────────
-- `reviews.order_id` was `not null`/FK'd only to `orders` (Module 4) — experts are reviewed
-- against a `consultations` row instead, which isn't an order (confirmed as a real gap while
-- building Module 11). Widen rather than add a parallel `expert_reviews` table: same shape
-- (rating/comment/one-per-subject), just a second optional subject. `seller_id` is reused to
-- mean "the person being reviewed" for both cases (an expert's `id` = their `profiles.id`,
-- same satellite-table identity `experts` already relies on) rather than adding a redundant
-- column — `fetchReviewsForSeller`/`fetchReviewsForExpert` both just filter on it.
alter table public.reviews alter column order_id drop not null;
alter table public.reviews add column consultation_id uuid references public.consultations (id) on delete cascade;
alter table public.reviews add constraint reviews_one_per_consultation unique (consultation_id);
alter table public.reviews add constraint reviews_exactly_one_subject check (
  (order_id is not null and consultation_id is null) or (order_id is null and consultation_id is not null)
);

drop policy "reviews_insert_buyer_completed_order" on public.reviews;

create policy "reviews_insert_buyer_completed_order_or_consultation"
  on public.reviews for insert
  with check (
    buyer_id = auth.uid()
    and (
      (order_id is not null and exists (
        select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid() and o.status = 'completed'
      ))
      or
      (consultation_id is not null and exists (
        select 1 from public.consultations c
        where c.id = consultation_id and c.user_id = auth.uid() and c.status in ('resolved', 'closed')
      ))
    )
  );
