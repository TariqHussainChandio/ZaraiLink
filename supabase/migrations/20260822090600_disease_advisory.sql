-- SRDS v4.0 Module 4 (AI Disease Advisory, §17). Purely additive.

create table public.disease_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  crop_id uuid references public.crops (id) on delete set null,
  image_url text not null,
  created_at timestamptz not null default now()
);

create index disease_cases_user_id_idx on public.disease_cases (user_id);

alter table public.disease_cases enable row level security;

create policy "disease_cases_select_owner_or_admin"
  on public.disease_cases for select
  using (user_id = auth.uid() or public.is_admin());

create policy "disease_cases_insert_owner"
  on public.disease_cases for insert
  with check (user_id = auth.uid());

grant select, insert on public.disease_cases to authenticated;

create table public.disease_predictions (
  id uuid primary key default gen_random_uuid(),
  disease_case_id uuid not null references public.disease_cases (id) on delete cascade,
  predicted_disease text not null,
  confidence_score numeric(5, 4) not null check (confidence_score >= 0 and confidence_score <= 1),
  description text,
  recommended_actions text[] not null default '{}',
  model_version text,
  created_at timestamptz not null default now()
);

create index disease_predictions_disease_case_id_idx on public.disease_predictions (disease_case_id);

alter table public.disease_predictions enable row level security;

create policy "disease_predictions_select_owner_or_admin"
  on public.disease_predictions for select
  using (
    exists (
      select 1 from public.disease_cases dc
      where dc.id = disease_case_id and (dc.user_id = auth.uid() or public.is_admin())
    )
  );

-- Predictions are written by the backend's AI inference service (service-role, bypasses
-- RLS) after processing the uploaded image, never inserted directly by the mobile client.
grant select on public.disease_predictions to authenticated;
