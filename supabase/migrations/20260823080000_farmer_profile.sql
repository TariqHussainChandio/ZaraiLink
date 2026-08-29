-- SRDS v4.0 Module 7 (Farmer agricultural profile, §8.1: experience, general agricultural
-- info). Farm name/location/size/crops are already covered by farms/farm_crops (Module 4);
-- this is just the small amount of free-text profile info left over.
--
-- Kept as its own satellite table rather than adding farmer-only columns to `profiles`,
-- matching the precedent already set by `experts` (a role-specific extension of a profile
-- row, not columns every role carries around unused).

create table public.farmer_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  experience text,
  agricultural_info text,
  updated_at timestamptz not null default now()
);

create trigger set_farmer_profiles_updated_at
  before update on public.farmer_profiles
  for each row execute function public.set_updated_at();

alter table public.farmer_profiles enable row level security;

create policy "farmer_profiles_select_own_or_admin"
  on public.farmer_profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "farmer_profiles_owner_write"
  on public.farmer_profiles for all
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

grant select, insert, update on public.farmer_profiles to authenticated;
