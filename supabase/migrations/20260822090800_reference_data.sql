-- SRDS v4.0 Module 4 (Reference Data, §22). Purely additive.
-- Public read (the mobile app consumes these directly), admin-only write (Module 18).

create table public.countries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  iso_code text not null unique
);

create table public.provinces (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries (id) on delete cascade,
  name text not null,
  unique (country_id, name)
);

create index provinces_country_id_idx on public.provinces (country_id);

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  province_id uuid not null references public.provinces (id) on delete cascade,
  name text not null,
  unique (province_id, name)
);

create index cities_province_id_idx on public.cities (province_id);

create table public.phone_codes (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries (id) on delete cascade unique,
  calling_code text not null
);

create index phone_codes_country_id_idx on public.phone_codes (country_id);

create table public.currencies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  symbol text not null,
  name text not null
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  applies_to text
);

do $$
declare
  tbl text;
begin
  foreach tbl in array array['countries', 'provinces', 'cities', 'phone_codes', 'currencies', 'units']
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('create policy "%s_select_all" on public.%I for select using (true)', tbl, tbl);
    execute format(
      'create policy "%s_admin_write" on public.%I for all using (public.is_admin()) with check (public.is_admin())',
      tbl, tbl
    );
    execute format('grant select on public.%I to anon, authenticated', tbl);
    execute format('grant insert, update, delete on public.%I to authenticated', tbl);
  end loop;
end;
$$;
