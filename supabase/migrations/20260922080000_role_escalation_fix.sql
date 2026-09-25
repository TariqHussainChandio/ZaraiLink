-- Security fix C1 (standardization plan P3, docs/process/standardization-plan.md §1.2).
--
-- `handle_new_user()` (20260820000000_core_schema.sql) cast `raw_user_meta_data->>'role'`
-- straight into the `user_role` enum, which includes `admin`. A public signup calling the Auth
-- API with `{"data": {"role": "admin"}}` received an admin profile — `guard_profiles_role`
-- (20260822085900_profiles_role_guard.sql) only fires on UPDATE, never on the initial INSERT.
-- Confirmed end to end in the P0 runtime baseline (docs/status/baseline-2026-09.md): a forged
-- signup's session was accepted by the admin API.
--
-- Fix: allow-list the four self-selectable roles as plain text before casting. `admin` is never
-- reachable from client-supplied metadata — the only supported way to create one is the runbook
-- in docs/process/admin-bootstrap-runbook.md (a service-role UPDATE against a known user, never
-- through signup). Any other/garbage string now defaults to 'buyer' instead of raising a Postgres
-- enum-cast error, which was the previous behaviour for any invalid value.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    case
      when requested_role in ('farmer', 'buyer', 'dealer', 'expert') then requested_role::public.user_role
      else 'buyer'::public.user_role
    end,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;
