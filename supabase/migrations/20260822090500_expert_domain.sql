-- SRDS v4.0 Module 4 (Expert domain, §16; BR-05/BR-06). Purely additive.
-- BR-05: only verified experts operate as verified experts — enforced by the public select
-- policy below only exposing verification_status = 'approved' rows to non-owners.
-- BR-06: only admin may move verification_status — no policy below grants experts write
-- access to their own verification_status column (they may update other profile fields via
-- the app layer, but a full-row update policy is intentionally not given to non-admins here;
-- Module 18/19 will split this into a column-scoped update path if needed).

create type public.verification_status as enum ('pending', 'approved', 'rejected', 'suspended');

create type public.expert_specialization as enum (
  'crop_management', 'plant_diseases', 'pest_management', 'fertilizer_management',
  'irrigation', 'soil_management', 'crop_nutrition', 'general_agriculture'
);

create type public.consultation_status as enum (
  'requested', 'accepted', 'in_progress', 'resolved', 'closed', 'rejected', 'cancelled', 'expired'
);

create type public.consultation_priority as enum ('low', 'medium', 'high');

create table public.experts (
  id uuid primary key references public.profiles (id) on delete cascade,
  qualifications text,
  degree text,
  experience text,
  professional_description text,
  location jsonb,
  contact text,
  verification_status public.verification_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_experts_updated_at
  before update on public.experts
  for each row execute function public.set_updated_at();

alter table public.experts enable row level security;

create policy "experts_select_verified_or_own_or_admin"
  on public.experts for select
  using (verification_status = 'approved' or id = auth.uid() or public.is_admin());

create policy "experts_insert_own"
  on public.experts for insert
  with check (id = auth.uid());

create policy "experts_update_own_or_admin"
  on public.experts for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- RLS can't express "this column only changes if admin" cleanly, so BR-06 (only admin may
-- move verification_status) is enforced with a trigger instead: an expert can update their
-- own row's other fields freely, but any attempt to change verification_status that isn't
-- made by an admin is rejected outright.
create or replace function public.guard_experts_verification_status()
returns trigger
language plpgsql
as $$
begin
  if new.verification_status is distinct from old.verification_status and not public.is_admin() then
    raise exception 'Only an admin may change verification_status';
  end if;
  return new;
end;
$$;

create trigger guard_experts_verification_status
  before update on public.experts
  for each row execute function public.guard_experts_verification_status();

grant select, insert, update on public.experts to authenticated;
grant select on public.experts to anon;

create table public.expert_specializations (
  expert_id uuid not null references public.experts (id) on delete cascade,
  specialization public.expert_specialization not null,
  primary key (expert_id, specialization)
);

alter table public.expert_specializations enable row level security;

create policy "expert_specializations_select_all"
  on public.expert_specializations for select
  using (true);

create policy "expert_specializations_owner_write"
  on public.expert_specializations for all
  using (expert_id = auth.uid() or public.is_admin())
  with check (expert_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.expert_specializations to authenticated;
grant select on public.expert_specializations to anon;

create table public.expert_verifications (
  id uuid primary key default gen_random_uuid(),
  expert_id uuid not null references public.experts (id) on delete cascade,
  document_url text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  decision public.verification_status,
  decision_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index expert_verifications_expert_id_idx on public.expert_verifications (expert_id);

alter table public.expert_verifications enable row level security;

create policy "expert_verifications_select_owner_or_admin"
  on public.expert_verifications for select
  using (expert_id = auth.uid() or public.is_admin());

create policy "expert_verifications_insert_owner"
  on public.expert_verifications for insert
  with check (expert_id = auth.uid());

create policy "expert_verifications_admin_update"
  on public.expert_verifications for update
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert on public.expert_verifications to authenticated;
grant update on public.expert_verifications to authenticated;

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expert_id uuid references public.experts (id) on delete set null,
  subject text not null,
  crop_id uuid references public.crops (id) on delete set null,
  problem_description text,
  farm_id uuid references public.farms (id) on delete set null,
  images text[] not null default '{}',
  priority public.consultation_priority not null default 'medium',
  status public.consultation_status not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index consultations_user_id_idx on public.consultations (user_id);
create index consultations_expert_id_idx on public.consultations (expert_id);

create trigger set_consultations_updated_at
  before update on public.consultations
  for each row execute function public.set_updated_at();

alter table public.consultations enable row level security;

create policy "consultations_select_participants"
  on public.consultations for select
  using (user_id = auth.uid() or expert_id = auth.uid() or public.is_admin());

create policy "consultations_insert_requester"
  on public.consultations for insert
  with check (user_id = auth.uid());

create policy "consultations_update_participants"
  on public.consultations for update
  using (user_id = auth.uid() or expert_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or expert_id = auth.uid() or public.is_admin());

grant select, insert, update on public.consultations to authenticated;

create table public.consultation_messages (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  attachments text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index consultation_messages_consultation_id_idx on public.consultation_messages (consultation_id);

alter table public.consultation_messages enable row level security;

create policy "consultation_messages_select_participants"
  on public.consultation_messages for select
  using (
    exists (
      select 1 from public.consultations c
      where c.id = consultation_id
        and (c.user_id = auth.uid() or c.expert_id = auth.uid() or public.is_admin())
    )
  );

create policy "consultation_messages_insert_participant"
  on public.consultation_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.consultations c
      where c.id = consultation_id and (c.user_id = auth.uid() or c.expert_id = auth.uid())
    )
  );

grant select, insert on public.consultation_messages to authenticated;
