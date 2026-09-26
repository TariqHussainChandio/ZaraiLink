-- P4 (4A.4), admin MFA. Proven end to end on the real local stack first (enrol a TOTP factor,
-- verify a challenge, confirm the resulting session carries `aal: "aal2"`, confirm the FastAPI
-- layer's require_admin_aal2 dependency accepts it and rejects a plain aal1 admin session) before
-- this migration — enforcing it earlier would have risked locking every admin out with no way to
-- enrol, exactly the sequencing the standardization plan calls for.
--
-- FastAPI already enforces this at the request layer (core/auth.py:require_admin_aal2, used by
-- the 7 admin write endpoints: suspend/promote a user, resolve/dismiss a report, verify an
-- expert, redact a message, reference-data row writes). This migration adds the same check at
-- the database layer too, matching this project's existing defense-in-depth pattern (role and
-- suspension are already checked at both layers, not just one).
--
-- A separate function from is_admin() rather than changing is_admin() itself: is_admin() also
-- gates plain admin READS (e.g. "own row or admin" policies across the schema) — requiring aal2
-- there too would lock out every admin's read access, not just writes, which is not what the
-- plan asks for.
create or replace function public.is_admin_aal2()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin() and (select auth.jwt() ->> 'aal') = 'aal2';
$$;

-- profiles: only the admin branch of the OR tightens — a user updating their own row is
-- unaffected. This is also what backs suspend/role-change; guard_profiles_role's own trigger
-- (20260822085900_profiles_role_guard.sql) still separately blocks a non-admin from ever
-- reaching the role branch at all, aal2 or not.
alter policy "profiles_update_own_or_admin" on public.profiles
  using ((id = auth.uid() and not public.is_suspended()) or public.is_admin_aal2())
  with check ((id = auth.uid() and not public.is_suspended()) or public.is_admin_aal2());

alter policy "reports_admin_update" on public.reports
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());

alter policy "expert_verifications_admin_update" on public.expert_verifications
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());

alter policy "messages_update_admin" on public.messages
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());

-- Reference data (20260822090800_reference_data.sql): one admin-write policy per table, same
-- shape, generated the same way that migration built them. Only currencies/units still exist —
-- countries/provinces/cities/phone_codes were dropped by
-- 20260901100000_freetext_location_and_phone.sql in favor of free-text fields.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['currencies', 'units']
  loop
    execute format(
      'alter policy "%s_admin_write" on public.%I using (public.is_admin_aal2()) with check (public.is_admin_aal2())',
      tbl, tbl
    );
  end loop;
end;
$$;
