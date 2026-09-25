-- SRDS v4.0 Module 5 (Reference Data, §6.2/§6.3).
-- `profiles.location` (free text) predates the reference-data tables from Module 4 and stays
-- as-is — additive only, so existing rows (real users already registered) are untouched.
-- New structured columns let the app use country → province → city pickers going forward;
-- `location` keeps working as a human-readable fallback/display string composed by the app.

alter table public.profiles add column country_id uuid references public.countries (id) on delete set null;
alter table public.profiles add column province_id uuid references public.provinces (id) on delete set null;
alter table public.profiles add column city_id uuid references public.cities (id) on delete set null;
alter table public.profiles add column village text;
alter table public.profiles add column street text;

create index profiles_city_id_idx on public.profiles (city_id);
