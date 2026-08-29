-- Module 16 (Role Dashboards & Analytics, SRDS v4.0 §38): farmer analytics needs a real
-- "listing views" metric. No view-count mechanism exists anywhere in the schema today.
-- Purely additive — does not touch `listings` itself.
--
-- A view only counts when the viewer isn't the listing's own owner. That's enforced
-- client-side (ListingDetailScreen only calls recordListingView when
-- listing.owner_id !== the signed-in user's id) rather than in RLS/a trigger, since the
-- client already knows the owner id for free at the point of the call — an extra join per
-- insert here would just re-derive something the caller already has.

create table public.listing_views (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  viewer_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index listing_views_listing_id_idx on public.listing_views (listing_id);
create index listing_views_listing_id_created_at_idx on public.listing_views (listing_id, created_at);

alter table public.listing_views enable row level security;

-- Only the listing's owner (to see their own analytics) or an admin may read view rows — a
-- viewer's own browsing history isn't exposed back to them; there's no product reason to.
create policy "listing_views_select_owner_or_admin"
  on public.listing_views for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and (l.owner_id = auth.uid() or public.is_admin())
    )
  );

-- Any authenticated user may record a view of any listing (that's the point — buyers and
-- other sellers browsing). `viewer_id` must be the caller's own id or null, so a client can't
-- spoof view attribution to inflate or misattribute another user's view.
create policy "listing_views_insert_authenticated"
  on public.listing_views for insert
  with check (viewer_id = auth.uid() or viewer_id is null);

grant select, insert on public.listing_views to authenticated;
