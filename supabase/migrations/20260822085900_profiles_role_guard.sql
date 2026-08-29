-- Security fix: `profiles_update_own_or_admin` (20260821000000_phase3_schema.sql) lets a user
-- update every column on their own profile row, including `role` — so any authenticated user
-- could currently self-promote (e.g. buyer → admin) with a plain client-side update. SRDS
-- v4.0 §21.2 requires role assignment to be admin-controlled. RLS can't express "this column
-- only changes if admin" on its own (same limitation as experts.verification_status), so this
-- is enforced with the same trigger pattern.

create or replace function public.guard_profiles_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an admin may change role';
  end if;
  return new;
end;
$$;

create trigger guard_profiles_role
  before update on public.profiles
  for each row execute function public.guard_profiles_role();
