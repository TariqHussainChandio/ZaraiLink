-- D20 (2026-11-22): every user changes their own profile photo, the admin included. D19 fixed the admin's personal
-- details (20261120080000_sole_admin_no_mfa.sql); the photo is taken out of that list and nothing else changes: the
-- admin still cannot change their name, phone or address, role or suspension, and still changes only the photo and the
-- password (an Auth matter). The upload itself was already allowed: the `avatars` bucket lets each user write their own
-- folder (avatars_owner_write). The body below is the D19 body with the one `avatar_url` comparison removed.
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
