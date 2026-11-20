-- D19 (decided 2026-11-20, maintainer): the admin is the platform's one administrator, created by the system
-- (docs/process/admin-bootstrap-runbook.md), and needs no second factor for any action. Two-step verification stays
-- available, optional, to every other user, where it protects sign-in only.
--
-- 1. No second factor for the admin.
-- is_admin_aal2() was the single place that read the `aal` claim (20260924080100_admin_mfa_enforcement.sql); every
-- admin write policy calls it. Redefining it as is_admin() lifts the requirement from all of them at once, and keeps the
-- ~90 policies unchanged instead of rewriting each one. The name stays only because the policies name it.
create or replace function public.is_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin();
$$;

-- 2. One admin, ever.
-- A unique index over a constant, limited to admin rows: a second admin row, by any path (the bootstrap runbook's
-- service-role update included), fails with a unique violation.
create unique index profiles_single_admin on public.profiles ((true)) where role = 'admin';

-- 3. The admin row is fixed.
-- guard_profiles_role() is the BEFORE UPDATE trigger on profiles; the latest body (20261012080000_applications.sql) is
-- kept and three refusals are added in front of it:
--   * nobody's role becomes admin through the app: the admin is made only by the runbook, as the service role;
--   * the admin's role and suspension never change, so the one admin cannot demote or lock themselves out (there is
--     nobody else to undo it);
--   * the admin's personal details are predefined: from a user session the admin's name, phone, photo and address
--     do not change. The password is an Auth matter and is not stored here.
create or replace function public.guard_profiles_role()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' then
    if new.role = 'admin' and old.role is distinct from 'admin' then
      raise exception 'Nobody is made an admin from the app; there is one admin' using errcode = '42501';
    end if;
    if old.role = 'admin' and (new.role is distinct from old.role or new.is_suspended is distinct from old.is_suspended) then
      raise exception 'The admin account''s role and access are fixed' using errcode = '42501';
    end if;
    if old.role = 'admin'
       and (new.full_name is distinct from old.full_name
            or new.phone is distinct from old.phone
            or new.avatar_url is distinct from old.avatar_url
            or new.location is distinct from old.location
            or new.street is distinct from old.street
            or new.village is distinct from old.village
            or new.city is distinct from old.city
            or new.province is distinct from old.province
            or new.country is distinct from old.country) then
      raise exception 'The admin account''s details are set by the system' using errcode = '42501';
    end if;
  end if;

  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Only an admin may change role';
    end if;
    -- A role change is not an approval: someone made a dealer or expert waits for that role's decision like anyone
    -- who signed up as one, with an application of their own, and any other role needs none.
    new.account_status := case when new.role in ('dealer', 'expert') then 'pending' else 'approved' end
                          ::public.account_status;
    new.account_status_reason := null;
    new.account_status_changed_at := now();
    new.application_submitted_at := null;
  elsif current_user = 'authenticated'
        and (new.account_status is distinct from old.account_status
             or new.account_status_reason is distinct from old.account_status_reason
             or new.account_status_changed_at is distinct from old.account_status_changed_at
             or new.application_submitted_at is distinct from old.application_submitted_at) then
    raise exception 'The account status is decided by an admin through the application review'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
