-- Security fix (Phase 1), two small independent gaps in the same batch:
--
-- 1. `guard_messages_updates()` (20260830080000_messages_admin_moderation.sql) never got a
--    `search_path` pin. Every sibling guard-trigger function has one -- `set_updated_at`,
--    `set_listings_seller_role`, `guard_profiles_role`, and `guard_experts_verification_status`
--    were all retrofitted in 20260822091000_function_search_path_hardening.sql, and
--    `guard_payments_columns` was created with one from the start. `guard_messages_updates` was
--    added on 2026-08-30, after that dedicated hardening pass, and was simply never retrofitted.
--    An unpinned `search_path` on a function callable by non-superusers is a hijack vector: a
--    malicious `public` schema object (e.g. a same-named function) earlier in a caller-controlled
--    search_path could shadow what this trigger calls. Since this function is `security invoker`
--    (the default -- not `security definer`), the real-world exposure here is narrow, but pinning
--    it costs nothing and keeps every guard-trigger function in the schema consistent.
--
-- 2. `listing_views_insert_authenticated` lets ANY authenticated user record a view with
--    `viewer_id = auth.uid()`, including the listing's OWN owner -- so an owner can inflate their
--    own analytics by repeatedly "viewing" their own listing. The original migration's comment
--    says this is "enforced client-side" (ListingDetailScreen only calls recordListingView when
--    the viewer isn't the owner) -- client-side-only enforcement of a metric the client itself
--    reports is not enforcement, it's an honor system; a modified client or a raw PostgREST call
--    trivially bypasses it. Fixed at the RLS layer: the check now looks up the listing's
--    `owner_id` and rejects the insert outright when it equals the caller. The `viewer_id is null`
--    branch (unattributed views) is left as-is -- unrelated to self-inflation, since a null
--    viewer_id can't be the owner by definition. Folded into this migration (rather than the
--    sibling `20260901110000_rls_suspension_enforcement.sql`) so the policy is only rewritten
--    once, not twice by two migrations in the same batch: this also picks up the same
--    `not public.is_suspended()` gate every other authenticated-write policy got in that
--    migration, for consistency.

alter function public.guard_messages_updates() set search_path = public, pg_temp;

drop policy "listing_views_insert_authenticated" on public.listing_views;
create policy "listing_views_insert_authenticated"
  on public.listing_views for insert
  with check (
    (
      viewer_id = auth.uid()
      and not public.is_suspended()
      and not exists (
        select 1 from public.listings l
        where l.id = listing_views.listing_id and l.owner_id = auth.uid()
      )
    )
    or viewer_id is null
  );
