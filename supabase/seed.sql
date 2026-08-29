-- Local dev seed data. Run automatically by `supabase db reset` (see [db.seed] in config.toml).
--
-- Demo users are intentionally NOT seeded here: rows in `auth.users` must go through the auth
-- service (GoTrue) so passwords are hashed correctly — plain INSERTs into auth.users are not a
-- supported path. Create demo accounts via `supabase.auth.signUp` from the app, or with the
-- Supabase Studio "Add user" UI, once running locally. `public.profiles` rows are created
-- automatically for each new auth user by the `on_auth_user_created` trigger.

insert into public.categories (name, slug, icon) values
  ('Vegetables', 'vegetables', 'carrot'),
  ('Fruits', 'fruits', 'apple'),
  ('Grains & Cereals', 'grains-cereals', 'wheat'),
  ('Dairy', 'dairy', 'milk'),
  ('Livestock', 'livestock', 'beef'),
  ('Seeds & Saplings', 'seeds-saplings', 'sprout'),
  ('Fertilizers', 'fertilizers', 'flask-conical'),
  ('Farm Equipment', 'farm-equipment', 'tractor')
on conflict (slug) do nothing;

insert into public.crops (name, category) values
  ('Wheat', 'cereal'),
  ('Rice', 'cereal'),
  ('Maize', 'cereal'),
  ('Sugarcane', 'cash_crop'),
  ('Cotton', 'cash_crop'),
  ('Potato', 'vegetable'),
  ('Tomato', 'vegetable'),
  ('Onion', 'vegetable'),
  ('Chili', 'vegetable'),
  ('Mango', 'fruit'),
  ('Citrus', 'fruit'),
  ('Banana', 'fruit')
on conflict (name) do nothing;

-- Reference data (§22): minimal Pakistan-focused baseline so the country/province/city
-- pickers and unit/currency dropdowns Module 5 builds have real rows to show.

insert into public.countries (name, iso_code) values
  ('Pakistan', 'PK')
on conflict (iso_code) do nothing;

insert into public.phone_codes (country_id, calling_code)
select id, '+92' from public.countries where iso_code = 'PK'
on conflict (country_id) do nothing;

insert into public.currencies (code, symbol, name) values
  ('PKR', 'Rs.', 'Pakistani Rupee')
on conflict (code) do nothing;

insert into public.units (code, label, applies_to) values
  ('kg', 'Kilogram', 'weight'),
  ('g', 'Gram', 'weight'),
  ('ton', 'Ton', 'weight'),
  ('liter', 'Liter', 'volume'),
  ('bag', 'Bag', 'quantity'),
  ('dozen', 'Dozen', 'quantity'),
  ('piece', 'Piece', 'quantity'),
  ('acre', 'Acre', 'area'),
  ('kanal', 'Kanal', 'area'),
  ('marla', 'Marla', 'area')
on conflict (code) do nothing;

insert into public.provinces (country_id, name)
select id, province
from public.countries, unnest(array[
  'Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Gilgit-Baltistan',
  'Azad Jammu & Kashmir', 'Islamabad Capital Territory'
]) as province
where iso_code = 'PK'
on conflict (country_id, name) do nothing;

insert into public.cities (province_id, name)
select p.id, c.name
from public.provinces p
join (values
  ('Punjab', 'Lahore'),
  ('Punjab', 'Faisalabad'),
  ('Punjab', 'Multan'),
  ('Punjab', 'Rawalpindi'),
  ('Sindh', 'Karachi'),
  ('Sindh', 'Hyderabad'),
  ('Sindh', 'Sukkur'),
  ('Khyber Pakhtunkhwa', 'Peshawar'),
  ('Khyber Pakhtunkhwa', 'Abbottabad'),
  ('Balochistan', 'Quetta'),
  ('Gilgit-Baltistan', 'Gilgit'),
  ('Azad Jammu & Kashmir', 'Muzaffarabad'),
  ('Islamabad Capital Territory', 'Islamabad')
) as c(province_name, name) on c.province_name = p.name
on conflict (province_id, name) do nothing;
