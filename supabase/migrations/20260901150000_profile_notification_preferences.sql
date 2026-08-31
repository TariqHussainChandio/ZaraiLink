-- Content-states fix: the Settings screen's notification toggle was a local-only `useState`
-- stub with a comment admitting "there's no notification-preferences table yet" -- it reset to
-- the default on every app restart. Backs it with a real column on `profiles`, the same table
-- `is_suspended` already lives on, since this is a single per-user boolean, not a table's worth
-- of granular preferences (no per-notification-type settings exist anywhere in this app yet).
--
-- RLS: no new policy needed. `profiles_update_own_or_admin` (rewritten in
-- 20260901110000_rls_suspension_enforcement.sql) already lets a non-suspended user update their
-- own row via `id = auth.uid()`, and this column carries no elevated-privilege risk the way
-- `role`/`is_suspended` do (no `guard_profiles_role`-style trigger needed).

alter table public.profiles add column notifications_enabled boolean not null default true;
