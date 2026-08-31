-- SRDS v4.0 Module 5 revision (Phase 0.5b). Replaces the Pakistan-only country/province/city
-- reference tables with free text, since the pickers they backed only ever had one seeded
-- country. phone_codes goes the same way — PhoneInput becomes a single free-text E.164 field.
-- currencies/units are a separate concern and are untouched.

drop table if exists public.phone_codes cascade;
drop table if exists public.cities cascade;
drop table if exists public.provinces cascade;
drop table if exists public.countries cascade;

alter table public.profiles drop column country_id;
alter table public.profiles drop column province_id;
alter table public.profiles drop column city_id;

alter table public.profiles add column country text;
alter table public.profiles add column province text;
alter table public.profiles add column city text;
