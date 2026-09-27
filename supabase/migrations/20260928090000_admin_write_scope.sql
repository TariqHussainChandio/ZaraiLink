-- Write-scope fixes found after A0 (2026-09-27), all live on the hosted project before this migration. Each closes a
-- path where a direct PostgREST call did what the audited API never allows (BR-06, BR-15; SRDS §11, §14, §51).

-- 1. Experts: only an admin with a second factor decides an application (BR-06).
-- The guard from 20260822090500_expert_domain.sql fired on UPDATE only, so an expert could insert their own `experts`
-- row already `approved` and appear in the public directory as verified (proven over HTTP: 201, then listed). It also
-- accepted an admin without a second factor, whose direct update writes no audit row, while the API route that makes
-- this decision requires one (require_admin_aal2). A user session must now insert a pending application; a decision
-- needs is_admin_aal2(). Server-side sessions (migrations, the pgTAP fixtures, which insert as postgres) are
-- unaffected on insert.
create or replace function public.guard_experts_verification_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.verification_status is distinct from 'pending' and current_user = 'authenticated' then
      raise exception 'A new expert application starts pending';
    end if;
  elsif new.verification_status is distinct from old.verification_status and not public.is_admin_aal2() then
    raise exception 'Only an admin may change verification_status';
  end if;
  return new;
end;
$$;

drop trigger guard_experts_verification_status on public.experts;
create trigger guard_experts_verification_status
  before insert or update on public.experts
  for each row execute function public.guard_experts_verification_status();

-- The admin branch asks for the second factor like every other admin write (20260924080100_admin_mfa_enforcement.sql);
-- the owner branch is unchanged.
alter policy "experts_update_own_or_admin" on public.experts
  using ((((id = (select auth.uid())) and (not (select public.is_suspended()))) or (select public.is_admin_aal2())))
  with check ((((id = (select auth.uid())) and (not (select public.is_suspended()))) or (select public.is_admin_aal2())));

-- The admin branch above admits a whole-row update, so an admin session could also rewrite another expert's
-- qualifications or contact details (found by the independent verification of this migration). Hold a user session
-- that does not own the row to the decision (and the timestamp), as for listings below; server-side sessions are
-- unaffected.
create or replace function public.guard_experts_admin_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated'
     and old.id is distinct from (select auth.uid())
     and (to_jsonb(new) - 'verification_status' - 'updated_at')
         is distinct from (to_jsonb(old) - 'verification_status' - 'updated_at') then
    raise exception 'Only the expert may change their profile; an admin may change the decision only'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_experts_admin_update() from public, anon, authenticated;

create trigger guard_experts_admin_update
  before update on public.experts
  for each row execute function public.guard_experts_admin_update();

-- 2. Expert verification records: an expert files a record, an admin decides it.
-- The insert grant covered every column, so an expert could file a record that already carried a decision, a decision
-- time and an admin as the reviewer. The API inserts only these two columns (expert_repository.submit_application).
revoke insert on public.expert_verifications from authenticated;
grant insert (expert_id, document_url) on public.expert_verifications to authenticated;

-- 3. Listings: the owner edits and removes their own listing; an admin moderates only its status, with a second factor,
-- through the audited route (PATCH /api/v1/marketplace/listings/{id}/status). Before this, the admin branches let any
-- admin session (a password alone) edit, delete or create listings in other users' names with no audit row (BR-15;
-- found in the A0 verification).
drop policy "listings_owner_insert" on public.listings;
create policy "listings_owner_insert" on public.listings for insert
  with check ((owner_id = (select auth.uid())) and (not (select public.is_suspended())));

drop policy "listings_owner_update" on public.listings;
create policy "listings_owner_update" on public.listings for update
  using (((owner_id = (select auth.uid())) and (not (select public.is_suspended()))) or (select public.is_admin_aal2()))
  with check (((owner_id = (select auth.uid())) and (not (select public.is_suspended()))) or (select public.is_admin_aal2()));

drop policy "listings_owner_delete" on public.listings;
create policy "listings_owner_delete" on public.listings for delete
  using ((owner_id = (select auth.uid())) and (not (select public.is_suspended())));

-- Row-level security cannot limit which columns a policy branch may change, so the admin branch above is held to the
-- status column here: a user session that does not own the listing may change only `status` (and the timestamp).
-- Server-side sessions are unaffected.
create or replace function public.guard_listings_admin_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated'
     and old.owner_id is distinct from (select auth.uid())
     and (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Only the owner may change a listing; an admin may change its status only'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_listings_admin_update() from public, anon, authenticated;

create trigger guard_listings_admin_update
  before update on public.listings
  for each row execute function public.guard_listings_admin_update();
