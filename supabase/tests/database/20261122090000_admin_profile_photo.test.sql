-- Pair for migration 20261122090000_admin_profile_photo.sql (D20).
-- Proves: the admin changes their own photo from a user session; their name, phone and address are still fixed; a
-- user still cannot change someone else's photo; the admin's role is still fixed.
-- Users (helpers/rls_helpers.inc): A admin, B/B2 buyers, F farmer.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();
select tests.world();

select tests.expect(tests.fx('A'), $$update public.profiles set avatar_url = 'https://example.test/a.jpg' where id = $$ || tests.l('A'),
  'n:1', 'profiles: the admin changes their own photo');
select tests.expect(tests.fx('A'), $$update public.profiles set full_name = 'Someone else' where id = $$ || tests.l('A'),
  'err:42501', 'profiles: but still not their name');
select tests.expect(tests.fx('A'), $$update public.profiles set phone = '+923001234567' where id = $$ || tests.l('A'),
  'err:42501', 'profiles: nor their phone');
select tests.expect(tests.fx('A'), $$update public.profiles set avatar_url = 'https://example.test/b.jpg', street = 'Mall Road' where id = $$ || tests.l('A'),
  'err:42501', 'profiles: nor an address slipped in beside a photo');
select tests.expect(tests.fx('A'), $$update public.profiles set role = 'buyer' where id = $$ || tests.l('A'),
  'err:42501', 'profiles: and the admin role is still fixed');
select tests.expect(tests.fx('B'), $$update public.profiles set avatar_url = 'https://example.test/x.jpg' where id = $$ || tests.l('B2'),
  'n:0', 'profiles: a user reaches no one else''s photo');
select tests.expect(tests.fx('F'), $$update public.profiles set avatar_url = 'https://example.test/f.jpg' where id = $$ || tests.l('F'),
  'n:1', 'profiles: a farmer still changes their own photo');

select * from finish();
rollback;
