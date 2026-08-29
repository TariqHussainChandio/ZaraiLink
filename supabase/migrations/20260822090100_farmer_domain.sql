-- SRDS v4.0 Module 4 (Farmer domain, §8). Purely additive — no existing table changes.

create table public.crops (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  created_at timestamptz not null default now()
);

alter table public.crops enable row level security;

create policy "crops_select_all"
  on public.crops for select
  using (true);

create policy "crops_admin_write"
  on public.crops for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.crops to anon, authenticated;
grant insert, update, delete on public.crops to authenticated;

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  location jsonb,
  area numeric(12, 2),
  land_unit text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index farms_owner_id_idx on public.farms (owner_id);

create trigger set_farms_updated_at
  before update on public.farms
  for each row execute function public.set_updated_at();

alter table public.farms enable row level security;

create policy "farms_select_owner_or_admin"
  on public.farms for select
  using (owner_id = auth.uid() or public.is_admin());

create policy "farms_owner_write"
  on public.farms for all
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.farms to authenticated;

create table public.farm_crops (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  crop_id uuid references public.crops (id) on delete set null,
  variety text,
  planting_date date,
  area numeric(12, 2),
  expected_harvest_date date,
  growth_stage text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index farm_crops_farm_id_idx on public.farm_crops (farm_id);

create trigger set_farm_crops_updated_at
  before update on public.farm_crops
  for each row execute function public.set_updated_at();

alter table public.farm_crops enable row level security;

create policy "farm_crops_select_owner_or_admin"
  on public.farm_crops for select
  using (
    exists (
      select 1 from public.farms f
      where f.id = farm_id and (f.owner_id = auth.uid() or public.is_admin())
    )
  );

create policy "farm_crops_owner_write"
  on public.farm_crops for all
  using (
    exists (
      select 1 from public.farms f
      where f.id = farm_id and (f.owner_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.farms f
      where f.id = farm_id and (f.owner_id = auth.uid() or public.is_admin())
    )
  );

grant select, insert, update, delete on public.farm_crops to authenticated;
