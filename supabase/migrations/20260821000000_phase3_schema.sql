-- Phase 3 additions: Realtime delivery for messages, and an admin "suspend user" flag.

-- Realtime "Postgres Changes" only fires for tables explicitly added to this publication.
alter publication supabase_realtime add table public.messages;

-- Admin "suspend user" needs a column to act on, and needs to be able to write to a row that
-- isn't its own. This is app-level UX gating only (checked in authStore, blocks the app shell) —
-- it is NOT enforced inside RLS on every table, so a suspended user's still-valid JWT could still
-- reach the API directly outside the app.
alter table public.profiles add column is_suspended boolean not null default false;

drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
