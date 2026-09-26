-- Finding discovered by the P5a smoke matrix, confirmed live against the real local stack: the
-- only SELECT policy on `profiles` is `profiles_select_own_or_admin` (id = auth.uid() or
-- is_admin()) — so EVERY cross-user embed anywhere in the backend (a listing's `owner`, a
-- review's `buyer`, an order's `buyer`/`seller`, a conversation's participants, a consultation's
-- `user`/`expert`, an expert's own `profile`) silently resolves to null for anyone but that row's
-- own owner or an admin. Confirmed live: `GET /rest/v1/listings?select=*,owner:profiles(...)`
-- returned `"owner": null` for every listing when queried as a buyer, or even anonymously.
--
-- Every one of those embeds asks for exactly the same three columns — id, full_name, avatar_url
-- — never phone, location, or anything else, across the whole codebase (grep-verified). That's
-- the intended public "who is this" identity, not the full profile. Postgres RLS is row-level
-- only — it cannot restrict which columns a broadened policy exposes, so a blanket "any
-- authenticated user may read profiles" policy would also expose phone/location, which is not
-- what any of these call sites want or need.
--
-- Fix: a narrow view exposing only those three columns. Deliberately NOT `security_invoker` (the
-- default, pre-PG15-opt-in behaviour) — it runs with the view owner's privileges, the same way
-- the table owner is already exempt from its own table's RLS, so this view bypasses
-- `profiles_select_own_or_admin` by design for exactly (and only) these three columns. Every
-- embed site in the backend is repointed at this view instead of `profiles` directly.
create view public.profiles_public as
select id, full_name, avatar_url from public.profiles;

grant select on public.profiles_public to authenticated, anon;
