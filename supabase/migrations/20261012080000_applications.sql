-- Dealer and expert applications with documents (A3b; SRDS §4–§13, §45, §53 rules 4–9; plan-ecommerce A3b).
--
-- A3a (20261005080000_account_status.sql) made a dealer or expert `pending` until an admin decides, but a dealer had
-- nothing to show and an expert one optional photo. Here an applicant fills in their details, attaches the documents
-- the admin has said are needed, and submits; only a submitted application reaches the admin's queue, and while it is
-- there nothing in it can change, so the admin decides on exactly what they read.
--
-- Maintainer decisions (2026-10-04): experts keep their own model (experts, expert_verifications with one row per
-- submission) and dealers get their own tables beside it; each role has its own private bucket; the dealer business
-- type is a fixed list of five; only the list of required documents is shared, and an admin manages it (SRDS §7: "the
-- exact required documents should be configurable").

-- ---- The submission marker ----------------------------------------------------------------------------------------
--
-- `pending` with no submission is a draft the applicant is still filling in; `pending` with one is under review.
alter table public.profiles add column application_submitted_at timestamptz;

-- The queue reads submitted applications in the order they came in.
create index profiles_application_queue_idx on public.profiles (role, application_submitted_at)
  where account_status = 'pending' and application_submitted_at is not null;

-- The marker is written by submit_application() alone, like the status (A3a): a user session that could set it would
-- put an incomplete application in the queue, and one that could clear it would unlock an application under review.
create or replace function public.guard_profiles_role()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
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

-- May the caller change their application? A dealer or expert who is not suspended and whose application is not under
-- review: a draft, or a rejected one being corrected. Definer, to read the caller's profile from another table's policy.
create or replace function public.is_application_editable()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid())
       and role in ('dealer', 'expert')
       and not is_suspended
       and (account_status = 'rejected' or (account_status = 'pending' and application_submitted_at is null))
  );
$$;

revoke execute on function public.is_application_editable() from public, anon;
grant execute on function public.is_application_editable() to authenticated;

-- ---- Required documents (admin-managed per role) -------------------------------------------------------------------

create type public.application_role as enum ('dealer', 'expert');

create table public.required_documents (
  id uuid primary key default gen_random_uuid(),
  role public.application_role not null,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  label text not null check (char_length(btrim(label)) between 2 and 120),
  description text check (char_length(description) <= 500),
  -- An optional document is offered but does not hold a submission back.
  is_required boolean not null default true,
  -- A row is retired, never deleted: documents already sent point at it.
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role, code)
);

alter table public.required_documents enable row level security;
grant select, insert, update on public.required_documents to authenticated;

create policy "required_documents_select_authenticated" on public.required_documents for select
  to authenticated using (true);
create policy "required_documents_admin_insert" on public.required_documents for insert
  with check ((select public.is_admin_aal2()));
create policy "required_documents_admin_update" on public.required_documents for update
  using ((select public.is_admin_aal2())) with check ((select public.is_admin_aal2()));

create trigger required_documents_updated_at
  before update on public.required_documents
  for each row execute function public.set_updated_at();

-- The starting list: curated reference data, not user content. SRDS §7 and §10 give the examples; §53 rule 5 makes
-- the expert's degree, experience and institution documents required.
-- Inserted before the audit trigger below exists: they are setup, not an admin's action.
insert into public.required_documents (role, code, label, description, is_required, sort_order) values
  ('dealer', 'business_registration', 'Business registration certificate',
   'The certificate that registers your business.', true, 10),
  ('dealer', 'business_licence', 'Business licence',
   'Your licence to trade in agricultural inputs.', true, 20),
  ('dealer', 'other', 'Other supporting documents',
   'Anything else that helps the review.', false, 90),
  ('expert', 'degree', 'Degree certificate',
   'Your highest relevant degree.', true, 10),
  ('expert', 'experience', 'Experience certificate',
   'A letter or certificate showing your professional experience.', true, 20),
  ('expert', 'institution', 'Institution affiliation document',
   'A letter or card from the institution you are affiliated with.', true, 30),
  ('expert', 'other', 'Other professional documents',
   'Anything else that helps the review.', false, 90);

-- Every change to the list is an admin action (BR-15). A trigger, so a direct write through the Data API is audited
-- exactly like one through FastAPI; it runs as its owner to write the audit log, which no user session may write.
create or replace function public.audit_required_documents()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (actor_id, action, target_entity, target_id, previous_state, new_state)
  values (
    (select auth.uid()),
    case tg_op when 'INSERT' then 'required_document_created' else 'required_document_updated' end,
    'required_documents',
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) - 'updated_at' end,
    to_jsonb(new) - 'updated_at'
  );
  return new;
end;
$$;

revoke execute on function public.audit_required_documents() from public, anon, authenticated;

create trigger audit_required_documents
  after insert or update on public.required_documents
  for each row execute function public.audit_required_documents();

-- ---- Dealers -------------------------------------------------------------------------------------------------------

create type public.dealer_business_type as enum (
  'agri_input_retailer', 'wholesaler', 'distributor', 'manufacturer', 'other'
);

create table public.dealer_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  business_name text not null check (char_length(btrim(business_name)) between 2 and 120),
  business_type public.dealer_business_type not null,
  -- SRDS §7 "business registration information".
  registration_number text not null check (char_length(btrim(registration_number)) between 2 and 60),
  business_address text not null check (char_length(btrim(business_address)) between 5 and 300),
  country text not null check (char_length(btrim(country)) between 2 and 100),
  province text not null check (char_length(btrim(province)) between 2 and 100),
  city text not null check (char_length(btrim(city)) between 2 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dealer_profiles enable row level security;
grant select, insert, update on public.dealer_profiles to authenticated;

-- An admin reads every application; the dealer reads and edits their own: while it is a draft or rejected, and once
-- approved (their business details stay current), but never while it is under review.
create policy "dealer_profiles_select_own_or_admin" on public.dealer_profiles for select
  using ((id = (select auth.uid())) or (select public.is_admin()));
create policy "dealer_profiles_insert_own" on public.dealer_profiles for insert
  with check (
    (id = (select auth.uid())) and ((select public.caller_role()) = 'dealer')
    and ((select public.is_application_editable()) or ((select public.is_account_approved()) and not (select public.is_suspended())))
  );
create policy "dealer_profiles_update_own" on public.dealer_profiles for update
  using (
    (id = (select auth.uid())) and ((select public.caller_role()) = 'dealer')
    and ((select public.is_application_editable()) or ((select public.is_account_approved()) and not (select public.is_suspended())))
  )
  with check (
    (id = (select auth.uid())) and ((select public.caller_role()) = 'dealer')
    and ((select public.is_application_editable()) or ((select public.is_account_approved()) and not (select public.is_suspended())))
  );

create trigger dealer_profiles_updated_at
  before update on public.dealer_profiles
  for each row execute function public.set_updated_at();

-- One row per file the dealer sent. The file itself is in the private dealer-documents bucket under the dealer's own
-- folder; the size and type are read from Storage by fill_application_document() below, never taken from the client.
create table public.dealer_documents (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  -- Null for a document the applicant added beyond the list.
  required_document_id uuid references public.required_documents (id),
  storage_path text not null unique check (char_length(storage_path) <= 300),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.dealer_documents enable row level security;
grant select, insert, delete on public.dealer_documents to authenticated;
create index dealer_documents_dealer_id_idx on public.dealer_documents (dealer_id);
create index dealer_documents_required_document_id_idx on public.dealer_documents (required_document_id);

-- No update: a wrong file is removed and sent again. Adding and removing follow the application's editability, so the
-- documents under review are the ones the admin opens.
create policy "dealer_documents_select_own_or_admin" on public.dealer_documents for select
  using ((dealer_id = (select auth.uid())) or (select public.is_admin()));
create policy "dealer_documents_insert_own" on public.dealer_documents for insert
  with check ((dealer_id = (select auth.uid())) and ((select public.caller_role()) = 'dealer') and (select public.is_application_editable()));
create policy "dealer_documents_delete_own" on public.dealer_documents for delete
  using ((dealer_id = (select auth.uid())) and ((select public.caller_role()) = 'dealer') and (select public.is_application_editable()));

-- ---- Experts (their model is kept; it gains what SRDS §10 asks for and a document list) ----------------------------

alter table public.experts
  add column years_experience smallint check (years_experience between 0 and 70),
  add column institution_affiliation text check (char_length(btrim(institution_affiliation)) between 2 and 200);

create table public.expert_documents (
  id uuid primary key default gen_random_uuid(),
  expert_id uuid not null references public.experts (id) on delete cascade,
  required_document_id uuid references public.required_documents (id),
  storage_path text not null unique check (char_length(storage_path) <= 300),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.expert_documents enable row level security;
grant select, insert, delete on public.expert_documents to authenticated;
create index expert_documents_expert_id_idx on public.expert_documents (expert_id);
create index expert_documents_required_document_id_idx on public.expert_documents (required_document_id);

create policy "expert_documents_select_own_or_admin" on public.expert_documents for select
  using ((expert_id = (select auth.uid())) or (select public.is_admin()));
create policy "expert_documents_insert_own" on public.expert_documents for insert
  with check ((expert_id = (select auth.uid())) and ((select public.caller_role()) = 'expert') and (select public.is_application_editable()));
create policy "expert_documents_delete_own" on public.expert_documents for delete
  using ((expert_id = (select auth.uid())) and ((select public.caller_role()) = 'expert') and (select public.is_application_editable()));

-- An application under review is frozen for the expert too. Once approved, the expert keeps their public profile
-- current, as before; the admin branches are unchanged.
alter policy "experts_insert_own" on public.experts
  with check ((id = (select auth.uid())) and (not (select public.is_suspended())) and ((select public.caller_role()) = 'expert')
              and (select public.is_application_editable()));
alter policy "experts_update_own_or_admin" on public.experts
  using ((((id = (select auth.uid())) and (not (select public.is_suspended()))
           and ((select public.is_application_editable()) or (select public.is_account_approved())))
          or (select public.is_admin_aal2())))
  with check ((((id = (select auth.uid())) and (not (select public.is_suspended()))
                and ((select public.is_application_editable()) or (select public.is_account_approved())))
               or (select public.is_admin_aal2())));
alter policy "expert_specializations_owner_insert" on public.expert_specializations
  with check (((expert_id = (select auth.uid())) and (not (select public.is_suspended())) and ((select public.caller_role()) = 'expert')
               and ((select public.is_application_editable()) or (select public.is_account_approved()))) or (select public.is_admin()));
alter policy "expert_specializations_owner_update" on public.expert_specializations
  using (((expert_id = (select auth.uid())) and (not (select public.is_suspended())) and ((select public.caller_role()) = 'expert')
          and ((select public.is_application_editable()) or (select public.is_account_approved()))) or (select public.is_admin()))
  with check (((expert_id = (select auth.uid())) and (not (select public.is_suspended())) and ((select public.caller_role()) = 'expert')
               and ((select public.is_application_editable()) or (select public.is_account_approved()))) or (select public.is_admin()));
alter policy "expert_specializations_owner_delete" on public.expert_specializations
  using (((expert_id = (select auth.uid())) and (not (select public.is_suspended())) and ((select public.caller_role()) = 'expert')
          and ((select public.is_application_editable()) or (select public.is_account_approved()))) or (select public.is_admin()));

-- A submission record is now written by submit_application() alone, one per submission, so the expert can no longer
-- file records of their own (they could file as many as they liked, and the decision lands on the latest).
drop policy "expert_verifications_insert_owner" on public.expert_verifications;
revoke insert on public.expert_verifications from authenticated;

-- ---- Document rows: the file must be the caller's own, and its size and type come from Storage --------------------
--
-- Every change to an application's documents first takes the owner's profile row (FOR SHARE), the row
-- submit_application() takes FOR UPDATE, and decides from that locked row whether the application may change. So a
-- document removed while the application is being submitted either finishes first (and the submission sees it gone)
-- or waits and is then refused (found by the A3b verification, L1). Invoker: the caller locks only their own row, which
-- their profile policies allow.
create or replace function public.lock_editable_application(_owner uuid)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  locked public.profiles%rowtype;
begin
  select * into locked from public.profiles p where p.id = _owner for share;
  return found
     and locked.id = (select auth.uid())
     and locked.role in ('dealer', 'expert')
     and not locked.is_suspended
     and (locked.account_status = 'rejected' or (locked.account_status = 'pending' and locked.application_submitted_at is null));
end;
$$;

revoke execute on function public.lock_editable_application(uuid) from public, anon;
grant execute on function public.lock_editable_application(uuid) to authenticated;

-- Invoker, not definer: it reads storage.objects as the caller, so it sees only what the caller may read in that bucket
-- (their own files). A row naming a file that is not there, or is someone else's, is refused with 22023 (a bad
-- value, which the API reports as such), apart from 42501, which means the application is locked. Run by the migration's
-- owner (the backfill below) it keeps the values given, since a legacy file may no longer exist.
create or replace function public.fill_application_document()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- The two tables name their owner column differently, and PL/pgSQL resolves a record field even in a branch that
  -- is not taken, so the owner is read by name.
  doc_owner uuid := (to_jsonb(new) ->> case tg_table_name when 'dealer_documents' then 'dealer_id' else 'expert_id' end)::uuid;
  doc_bucket text := case tg_table_name when 'dealer_documents' then 'dealer-documents' else 'expert-documents' end;
  found_object storage.objects%rowtype;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  -- The policies say the same, but a before trigger runs ahead of them: answer "not yours, or locked" as such rather
  -- than as a missing file. The lock also orders this insert against a submission.
  if doc_owner is distinct from (select auth.uid()) or not public.lock_editable_application(doc_owner) then
    raise exception 'This application cannot be changed now' using errcode = '42501';
  end if;
  if (storage.foldername(new.storage_path))[1] is distinct from doc_owner::text then
    raise exception 'A document must be in your own folder' using errcode = '22023';
  end if;
  select * into found_object from storage.objects o
   where o.bucket_id = doc_bucket and o.name = new.storage_path and o.owner = doc_owner;
  if not found then
    raise exception 'No such uploaded file' using errcode = '22023';
  end if;
  new.mime_type := found_object.metadata ->> 'mimetype';
  new.size_bytes := (found_object.metadata ->> 'size')::bigint;
  return new;
end;
$$;

revoke execute on function public.fill_application_document() from public, anon, authenticated;

create trigger fill_application_document
  before insert on public.dealer_documents
  for each row execute function public.fill_application_document();
create trigger fill_application_document
  before insert on public.expert_documents
  for each row execute function public.fill_application_document();

-- Removing a document takes the same lock and re-checks on the locked row, so it cannot slip past a submission that
-- has just frozen the application.
create or replace function public.guard_application_document_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  doc_owner uuid := (to_jsonb(old) ->> case tg_table_name when 'dealer_documents' then 'dealer_id' else 'expert_id' end)::uuid;
begin
  if current_user = 'authenticated' and not public.lock_editable_application(doc_owner) then
    raise exception 'This application cannot be changed now' using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke execute on function public.guard_application_document_delete() from public, anon, authenticated;

create trigger guard_application_document_delete
  before delete on public.dealer_documents
  for each row execute function public.guard_application_document_delete();
create trigger guard_application_document_delete
  before delete on public.expert_documents
  for each row execute function public.guard_application_document_delete();

-- The rest of the application (the business details, the expert's details and specializations) takes the same lock,
-- so it cannot change between the submission's completeness check and its commit either (A3b verification round 2,
-- N1). An approved dealer or expert keeps their details current, as the policies allow; an application under review
-- stays as the admin is reading it. Only the owner's own writes are checked: the admin's moderation and the definer
-- functions (submit, decide) do not run as `authenticated` on someone else's row.
create or replace function public.guard_application_details()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  row_data jsonb := to_jsonb(coalesce(new, old));
  doc_owner uuid := (row_data ->> case tg_table_name when 'expert_specializations' then 'expert_id' else 'id' end)::uuid;
begin
  if current_user = 'authenticated' and doc_owner = (select auth.uid())
     and not public.lock_editable_application(doc_owner)
     -- The lock is held now, so this reads the committed state a submission or decision just left.
     and not exists (select 1 from public.profiles p
                      where p.id = doc_owner and p.account_status = 'approved' and not p.is_suspended) then
    raise exception 'This application cannot be changed now' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.guard_application_details() from public, anon, authenticated;

create trigger guard_application_details
  before insert or update or delete on public.dealer_profiles
  for each row execute function public.guard_application_details();
create trigger guard_application_details
  before insert or update or delete on public.experts
  for each row execute function public.guard_application_details();
create trigger guard_application_details
  before insert or update or delete on public.expert_specializations
  for each row execute function public.guard_application_details();

-- ---- Buckets ---------------------------------------------------------------------------------------------------------
--
-- SRDS §45: dealer documents and expert documents in Storage with their own policies. The same limits as the expert
-- bucket (20260922080200_storage_bucket_limits.sql): 10 MB, PDF and the usual image types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dealer-documents', 'dealer-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

create policy "dealer_documents_owner_or_admin_read" on storage.objects for select
  using ((bucket_id = 'dealer-documents') and ((owner = (select auth.uid())) or (select public.is_admin())));
create policy "dealer_documents_owner_write" on storage.objects for insert
  with check (
    (bucket_id = 'dealer-documents') and (owner = (select auth.uid()))
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and ((select public.caller_role()) = 'dealer') and (select public.is_application_editable())
  );
-- A file a document still names cannot be deleted, and submit_application() counts a document only with its file, so a
-- submitted document has its file and the stored type and size stay true; the app removes the document first, then the
-- file (A3b verification, M1 and L2). There is no update policy, so a registered file cannot be overwritten either. (A
-- file deleted in the instant before its row is registered leaves a row without a file; submitting then names it
-- missing.)
create policy "dealer_documents_owner_delete" on storage.objects for delete
  using (
    (bucket_id = 'dealer-documents') and (owner = (select auth.uid()))
    and ((select public.caller_role()) = 'dealer') and (select public.is_application_editable())
    and not exists (select 1 from public.dealer_documents d where d.storage_path = objects.name)
  );

-- The expert bucket follows the same rules: nothing is added while under review, and an applicant may now remove a
-- file of their own (there was no delete policy, so a wrong upload stayed for good).
alter policy "expert_documents_owner_write" on storage.objects
  with check (
    (bucket_id = 'expert-documents') and (owner = (select auth.uid()))
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and ((select public.caller_role()) = 'expert') and (select public.is_application_editable())
  );
create policy "expert_documents_owner_delete" on storage.objects for delete
  using (
    (bucket_id = 'expert-documents') and (owner = (select auth.uid()))
    and ((select public.caller_role()) = 'expert') and (select public.is_application_editable())
    and not exists (select 1 from public.expert_documents x where x.storage_path = objects.name)
  );

-- ---- Submitting an application ---------------------------------------------------------------------------------------
--
-- The one way into the review queue (SRDS §8, §11). It checks the application is complete, in one transaction with the
-- submission, so an admin never opens a half-filled one: the role's details, and at least one file for every active
-- required document. A rejected applicant submits the same way (D10): their documents carry over unless they removed
-- them. It replaces resubmit_application() from A3a, which sent an application back without checking anything.
create or replace function public.submit_application()
returns public.account_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := (select auth.uid());
  target public.profiles%rowtype;
  missing text[] := '{}';
  doc record;
begin
  select * into target from public.profiles p where p.id = caller for update;
  if not found or target.role not in ('dealer', 'expert') then
    raise exception 'Only a dealer or an expert sends an application' using errcode = '23514';
  end if;
  if target.is_suspended then
    raise exception 'A suspended account cannot send an application' using errcode = '42501';
  end if;
  if target.account_status = 'approved' then
    raise exception 'This account is already approved' using errcode = '23514';
  end if;
  if target.account_status = 'pending' and target.application_submitted_at is not null then
    raise exception 'The application is already under review' using errcode = '23514';
  end if;

  if target.role = 'dealer' then
    if not exists (select 1 from public.dealer_profiles d where d.id = caller) then
      missing := missing || 'business details'::text;
    end if;
  else
    if not exists (select 1 from public.experts e
                    where e.id = caller
                      and nullif(btrim(e.qualifications), '') is not null
                      and e.years_experience is not null
                      and e.institution_affiliation is not null) then
      missing := missing || 'professional details'::text;
    end if;
    if not exists (select 1 from public.expert_specializations s where s.expert_id = caller) then
      missing := missing || 'a specialization'::text;
    end if;
  end if;

  for doc in
    select r.label from public.required_documents r
     where r.role = target.role::text::public.application_role and r.active and r.is_required
       -- A document counts only with its file in Storage (A3b verification, M1).
       and not exists (select 1 from public.dealer_documents d
                         join storage.objects o on o.bucket_id = 'dealer-documents' and o.name = d.storage_path
                        where d.dealer_id = caller and d.required_document_id = r.id)
       and not exists (select 1 from public.expert_documents x
                         join storage.objects o on o.bucket_id = 'expert-documents' and o.name = x.storage_path
                        where x.expert_id = caller and x.required_document_id = r.id)
     order by r.sort_order, r.label
  loop
    missing := missing || doc.label;
  end loop;

  if cardinality(missing) > 0 then
    raise exception 'The application is missing: %', array_to_string(missing, ', ') using errcode = '23514';
  end if;

  update public.profiles p
     set account_status = 'pending',
         account_status_reason = null,
         account_status_changed_at = case when target.account_status = 'rejected' then now() else p.account_status_changed_at end,
         application_submitted_at = now()
   where p.id = caller;

  if target.role = 'expert' then
    update public.experts e set verification_status = 'pending' where e.id = caller;
    insert into public.expert_verifications (expert_id) values (caller);
  end if;
  return 'pending';
end;
$$;

revoke execute on function public.submit_application() from public, anon;
grant execute on function public.submit_application() to authenticated;

drop function public.resubmit_application();

-- decide_account_status() from A3a, unchanged but for one check: only a submitted application can be decided (it
-- replaces "the expert has an experts row"), so an admin never approves a draft.
create or replace function public.decide_account_status(
  _user_id uuid,
  _decision public.account_status,
  _reason text default null
)
returns table (role public.user_role, previous_status public.account_status, new_status public.account_status)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.profiles%rowtype;
  reason text := nullif(btrim(_reason), '');
begin
  if not public.is_admin_aal2() then
    raise exception 'Only an admin with a second factor may decide an application' using errcode = '42501';
  end if;
  select * into target from public.profiles p where p.id = _user_id for update;
  if not found then
    raise exception 'No such account' using errcode = 'P0002';
  end if;
  if target.role not in ('dealer', 'expert') then
    raise exception 'Only dealer and expert accounts are reviewed' using errcode = '23514';
  end if;
  if _decision not in ('approved', 'rejected') then
    raise exception 'A decision is approved or rejected' using errcode = '23514';
  end if;
  if target.account_status <> 'pending' then
    raise exception 'Only a pending application can be decided' using errcode = '23514';
  end if;
  if target.application_submitted_at is null then
    raise exception 'The application has not been submitted yet' using errcode = '23514';
  end if;
  if _decision = 'rejected' and char_length(coalesce(reason, '')) < 10 then
    raise exception 'A rejection needs a reason of at least 10 characters' using errcode = '23514';
  end if;

  update public.profiles p
     set account_status = _decision,
         account_status_reason = case when _decision = 'rejected' then reason end,
         account_status_changed_at = now()
   where p.id = _user_id;

  if target.role = 'expert' then
    update public.experts e
       set verification_status = _decision::text::public.verification_status
     where e.id = _user_id;
    update public.expert_verifications v
       set decision = _decision::text::public.verification_status,
           reviewed_by = (select auth.uid()),
           decision_at = now(),
           notes = reason
     where v.id = (select v2.id from public.expert_verifications v2
                    where v2.expert_id = _user_id
                    order by v2.created_at desc limit 1);
  end if;

  insert into public.audit_logs (actor_id, action, target_entity, target_id, previous_state, new_state, metadata)
  values (
    (select auth.uid()),
    format('%s_application_%s', target.role, _decision),
    'profiles',
    _user_id,
    jsonb_build_object('account_status', target.account_status, 'account_status_reason', target.account_status_reason),
    jsonb_build_object('account_status', _decision, 'account_status_reason', case when _decision = 'rejected' then reason end),
    jsonb_build_object('reason', reason)
  );

  return query select target.role, target.account_status, _decision;
end;
$$;

-- ---- Sign-up details --------------------------------------------------------------------------------------------------
--
-- SRDS §5–§7, §10: the sign-up form asks for phone and location, which arrive as sign-up metadata. Metadata is whatever
-- the client sent, so each value is trimmed and cut to a sane length, and the village is kept for a farmer only (§5).
-- Role and status are unchanged from A3a: admin is never reachable from sign-up metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested_role text := meta ->> 'role';
  granted_role public.user_role := case
    when requested_role in ('farmer', 'buyer', 'dealer', 'expert') then requested_role::public.user_role
    else 'buyer'::public.user_role
  end;
begin
  insert into public.profiles (id, role, full_name, account_status, phone, country, province, city, street, village)
  values (
    new.id,
    granted_role,
    left(coalesce(btrim(meta ->> 'full_name'), ''), 120),
    case when granted_role in ('dealer', 'expert') then 'pending' else 'approved' end::public.account_status,
    nullif(left(btrim(meta ->> 'phone'), 20), ''),
    nullif(left(btrim(meta ->> 'country'), 100), ''),
    nullif(left(btrim(meta ->> 'province'), 100), ''),
    nullif(left(btrim(meta ->> 'city'), 100), ''),
    nullif(left(btrim(meta ->> 'street'), 300), ''),
    case when granted_role = 'farmer' then nullif(left(btrim(meta ->> 'village'), 100), '') end
  );
  return new;
end;
$$;

-- ---- An admin's email change is audited (BR-15) ------------------------------------------------------------------------
--
-- Supabase Auth changes the address only after both codes are confirmed (double_confirm_changes), from its own
-- connection, so the audit row is written here, where the change actually lands. Definer, to write the audit log.
create or replace function public.audit_admin_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.id and p.role = 'admin') then
    insert into public.audit_logs (actor_id, action, target_entity, target_id, previous_state, new_state)
    values (new.id, 'admin_email_changed', 'auth.users', new.id,
            jsonb_build_object('email', old.email), jsonb_build_object('email', new.email));
  end if;
  return new;
end;
$$;

revoke execute on function public.audit_admin_email_change() from public, anon, authenticated;

create trigger audit_admin_email_change
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.audit_admin_email_change();

-- ---- Backfill ---------------------------------------------------------------------------------------------------------
--
-- An expert's legacy single document becomes a document row, so the admin opens every document one way.
insert into public.expert_documents (expert_id, storage_path, file_name, created_at)
select distinct on (v.document_url) v.expert_id, v.document_url,
       coalesce(nullif(regexp_replace(v.document_url, '^.*/', ''), ''), 'document'), v.created_at
  from public.expert_verifications v
 where v.document_url is not null
 order by v.document_url, v.created_at;

-- A pending expert who had already applied stays in the queue, from the time they applied. A pending dealer had nothing
-- to send under A3a, so they finish the application first; approved accounts are untouched.
update public.profiles p
   set application_submitted_at = (select max(v.created_at) from public.expert_verifications v where v.expert_id = p.id)
 where p.role = 'expert' and p.account_status = 'pending'
   and exists (select 1 from public.expert_verifications v where v.expert_id = p.id);
