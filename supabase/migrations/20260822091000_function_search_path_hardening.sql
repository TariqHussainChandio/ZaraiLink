-- Security hardening: the Supabase security advisor (0011_function_search_path_mutable)
-- flagged these functions for not pinning `search_path`, which leaves them exposed to a
-- schema-shadowing attack (a role could create an object earlier in the search path that
-- shadows a table/function these rely on, e.g. `public.profiles`). Pinning it is the
-- standard fix and changes no behavior.
--
-- `is_admin`, `handle_new_user`, and `rls_auto_enable` were flagged separately (public/
-- authenticated can call them via RPC) but are not touched here: `is_admin()` must stay
-- executable by anon/authenticated because RLS policies across nearly every table call it,
-- and `handle_new_user`/`rls_auto_enable` are `returns trigger`/`returns event_trigger`
-- functions that Postgres refuses to invoke outside trigger context, so RPC exposure is inert.

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.set_listings_seller_role() set search_path = public, pg_temp;
alter function public.guard_profiles_role() set search_path = public, pg_temp;
alter function public.guard_experts_verification_status() set search_path = public, pg_temp;
