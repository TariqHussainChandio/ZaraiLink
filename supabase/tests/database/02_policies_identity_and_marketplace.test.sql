-- P6 (item 3): allowed and rejected paths for the identity, reference-data, marketplace and review policies.
-- Every case runs one statement as a real role through row-level security (helpers/rls_helpers.inc).
-- Users: F/F2 farmers, B/B2 buyers, D dealer, E expert, S suspended buyer, A admin; null is anon.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();
select tests.world();

-- profiles ---------------------------------------------------------------------------------------------
select tests.expect(tests.fx('B'), 'select id from public.profiles where id = ' || tests.l('B'), 'rows:1', 'profiles: a user reads their own row');
select tests.expect(tests.fx('B'), 'select id from public.profiles where id = ' || tests.l('F'), 'rows:0', 'profiles: a user cannot read another user''s row');
select tests.expect(null, 'select id from public.profiles where id = ' || tests.l('B'), 'rows:0', 'profiles: anon reads nothing');
select tests.expect(tests.fx('A'), 'select id from public.profiles where id in (' || tests.l('B') || ',' || tests.l('F') || ')', 'rows:2', 'profiles: an admin reads any row');
select tests.expect(tests.fx('B'), $$update public.profiles set full_name = 'Renamed' where id = $$ || tests.l('B'), 'n:1', 'profiles: a user updates their own row');
select tests.expect(tests.fx('B'), $$update public.profiles set full_name = 'Renamed' where id = $$ || tests.l('F'), 'n:0', 'profiles: a user cannot update another user''s row');
select tests.expect(tests.fx('S'), $$update public.profiles set full_name = 'Renamed' where id = $$ || tests.l('S'), 'n:0', 'profiles: a suspended user cannot update even their own row');
select tests.expect(tests.fx('B'), $$update public.profiles set role = 'admin' where id = $$ || tests.l('B'), 'err:P0001', 'profiles: a user cannot promote themselves (role guard trigger)');
select tests.expect(tests.fx('A'), $$update public.profiles set full_name = 'By admin' where id = $$ || tests.l('F'), 'n:0', 'profiles: an admin without a second factor cannot edit another profile');
select tests.expect(tests.fx('A'), $$update public.profiles set full_name = 'By admin' where id = $$ || tests.l('F'), 'n:1', 'profiles: an admin with a second factor can', 'aal2');
select tests.expect(tests.fx('B'), $$insert into public.profiles (id, role, full_name) values (gen_random_uuid(), 'buyer', 'x')$$, 'err:42501', 'profiles: no client can insert a profile (only the signup trigger)');
select tests.expect(null, 'select id from public.profiles_public where id = ' || tests.l('F'), 'rows:1', 'profiles_public: anon reads the public name view (id, name, avatar only)');

-- reference data ---------------------------------------------------------------------------------------
select ok((select count(*) from public.categories) > 0 and (select count(*) from public.crops) > 0
      and (select count(*) from public.currencies) > 0 and (select count(*) from public.units) > 0, 'seed reference data is present');
select tests.expect(null, 'select id from public.categories', 'rows:' || (select count(*) from public.categories), 'categories: anon reads all');
select tests.expect(null, 'select id from public.crops', 'rows:' || (select count(*) from public.crops), 'crops: anon reads all');
select tests.expect(null, 'select code from public.currencies', 'rows:' || (select count(*) from public.currencies), 'currencies: anon reads all');
select tests.expect(null, 'select code from public.units', 'rows:' || (select count(*) from public.units), 'units: anon reads all');
select tests.expect(tests.fx('A'), $$insert into public.categories (name, slug) values ('Pg cat', 'pg-cat')$$, 'n:1', 'categories: an admin inserts');
select tests.expect(tests.fx('B'), $$insert into public.categories (name, slug) values ('Pg cat 2', 'pg-cat-2')$$, 'err:42501', 'categories: a buyer cannot insert');
select tests.expect(null, $$insert into public.categories (name, slug) values ('Pg cat 3', 'pg-cat-3')$$, 'err:42501', 'categories: anon cannot insert');
select tests.expect(tests.fx('A'), $$update public.categories set name = 'Pg cat renamed' where slug = 'pg-cat'$$, 'n:1', 'categories: an admin updates');
select tests.expect(tests.fx('B'), $$update public.categories set name = 'hijack' where slug = 'pg-cat'$$, 'n:0', 'categories: a buyer updates nothing');
select tests.expect(tests.fx('B'), $$delete from public.categories where slug = 'pg-cat'$$, 'n:0', 'categories: a buyer deletes nothing');
select tests.expect(tests.fx('A'), $$delete from public.categories where slug = 'pg-cat'$$, 'n:1', 'categories: an admin deletes');
select tests.expect(tests.fx('A'), $$insert into public.crops (name) values ('Pg crop')$$, 'n:1', 'crops: an admin inserts');
select tests.expect(tests.fx('F'), $$insert into public.crops (name) values ('Pg crop 2')$$, 'err:42501', 'crops: a farmer cannot insert');
select tests.expect(tests.fx('F'), $$update public.crops set name = 'x' where name = 'Pg crop'$$, 'n:0', 'crops: a farmer updates nothing');
select tests.expect(tests.fx('F'), $$delete from public.crops where name = 'Pg crop'$$, 'n:0', 'crops: a farmer deletes nothing');
select tests.expect(tests.fx('A'), $$update public.crops set name = 'Pg crop b' where name = 'Pg crop'$$, 'n:1', 'crops: an admin updates');
select tests.expect(tests.fx('A'), $$delete from public.crops where name = 'Pg crop b'$$, 'n:1', 'crops: an admin deletes');
select tests.expect(tests.fx('A'), $$insert into public.currencies (code, symbol, name) values ('PGT', 'P', 'Pg tender')$$, 'err:42501', 'currencies: an admin without a second factor cannot insert');
select tests.expect(tests.fx('A'), $$insert into public.currencies (code, symbol, name) values ('PGT', 'P', 'Pg tender')$$, 'n:1', 'currencies: an admin with a second factor inserts', 'aal2');
select tests.expect(tests.fx('B'), $$update public.currencies set name = 'x' where code = 'PGT'$$, 'n:0', 'currencies: a buyer updates nothing');
select tests.expect(tests.fx('A'), $$update public.currencies set name = 'Pg tender 2' where code = 'PGT'$$, 'n:1', 'currencies: an admin with a second factor updates', 'aal2');
select tests.expect(tests.fx('B'), $$delete from public.currencies where code = 'PGT'$$, 'n:0', 'currencies: a buyer deletes nothing');
select tests.expect(tests.fx('A'), $$delete from public.currencies where code = 'PGT'$$, 'n:1', 'currencies: an admin with a second factor deletes', 'aal2');
select tests.expect(tests.fx('A'), $$insert into public.units (code, label) values ('pgu', 'Pg unit')$$, 'err:42501', 'units: an admin without a second factor cannot insert');
select tests.expect(tests.fx('A'), $$insert into public.units (code, label) values ('pgu', 'Pg unit')$$, 'n:1', 'units: an admin with a second factor inserts', 'aal2');
select tests.expect(tests.fx('B'), $$update public.units set label = 'x' where code = 'pgu'$$, 'n:0', 'units: a buyer updates nothing');
select tests.expect(tests.fx('A'), $$update public.units set label = 'Pg unit 2' where code = 'pgu'$$, 'n:1', 'units: an admin with a second factor updates', 'aal2');
select tests.expect(tests.fx('B'), $$delete from public.units where code = 'pgu'$$, 'n:0', 'units: a buyer deletes nothing');
select tests.expect(tests.fx('A'), $$delete from public.units where code = 'pgu'$$, 'n:1', 'units: an admin with a second factor deletes', 'aal2');

-- listings ---------------------------------------------------------------------------------------------
select tests.expect(null, 'select id from public.listings where id = ' || tests.l('L1'), 'rows:1', 'listings: anon sees an active listing');
select tests.expect(null, 'select id from public.listings where id = ' || tests.l('L2'), 'rows:0', 'listings: anon does not see an inactive listing');
select tests.expect(tests.fx('F'), 'select id from public.listings where id = ' || tests.l('L2'), 'rows:1', 'listings: the owner sees their inactive listing');
select tests.expect(tests.fx('F2'), 'select id from public.listings where id = ' || tests.l('L2'), 'rows:0', 'listings: another farmer does not');
select tests.expect(tests.fx('A'), 'select id from public.listings where id = ' || tests.l('L2'), 'rows:1', 'listings: an admin sees it');
select tests.expect(tests.fx('F'), $$insert into public.listings (owner_id, title, price) values ($$ || tests.l('F') || $$, 'New', 5)$$, 'n:1', 'listings: an owner inserts');
select tests.expect(tests.fx('F'), $$insert into public.listings (owner_id, title, price) values ($$ || tests.l('F2') || $$, 'Forged', 5)$$, 'err:42501', 'listings: cannot insert as someone else');
select tests.expect(tests.fx('S'), $$insert into public.listings (owner_id, title, price) values ($$ || tests.l('S') || $$, 'Suspended', 5)$$, 'err:42501', 'listings: a suspended user cannot insert');
select tests.expect(tests.fx('F'), $$update public.listings set price = 7 where id = $$ || tests.l('L1'), 'n:1', 'listings: an owner updates');
select tests.expect(tests.fx('F2'), $$update public.listings set price = 1 where id = $$ || tests.l('L1'), 'n:0', 'listings: another farmer updates nothing');
select tests.expect(tests.fx('A'), $$update public.listings set price = 8 where id = $$ || tests.l('L1'), 'n:1', 'listings: an admin updates (moderation)');
select tests.expect(tests.fx('F2'), $$delete from public.listings where id = $$ || tests.l('L2'), 'n:0', 'listings: another farmer deletes nothing');
select tests.expect(tests.fx('F'), $$delete from public.listings where id = $$ || tests.l('L2'), 'n:1', 'listings: an owner deletes');

-- listing views ----------------------------------------------------------------------------------------
select tests.expect(tests.fx('B2'), 'insert into public.listing_views (listing_id, viewer_id) values (' || tests.l('L1') || ',' || tests.l('B2') || ')', 'n:1', 'listing_views: a signed-in user records a view');
select tests.expect(tests.fx('F'), 'insert into public.listing_views (listing_id, viewer_id) values (' || tests.l('L1') || ',' || tests.l('F') || ')', 'err:42501', 'listing_views: an owner''s own view is not counted');
select tests.expect(tests.fx('B'), 'insert into public.listing_views (listing_id, viewer_id) values (' || tests.l('L1') || ',' || tests.l('F2') || ')', 'err:42501', 'listing_views: cannot record a view as someone else');
select tests.expect(tests.fx('F'), 'select id from public.listing_views where listing_id = ' || tests.l('L1'), 'rows:2', 'listing_views: the owner reads their listing''s views');
select tests.expect(tests.fx('B2'), 'select id from public.listing_views where listing_id = ' || tests.l('L1'), 'rows:0', 'listing_views: a viewer cannot read the view log');
select tests.expect(tests.fx('A'), 'select id from public.listing_views where listing_id = ' || tests.l('L1'), 'rows:2', 'listing_views: an admin reads it');

-- reviews ----------------------------------------------------------------------------------------------
select tests.expect(null, 'select id from public.reviews where id = ' || tests.l('REV1'), 'rows:1', 'reviews: anyone reads reviews');
select tests.expect(tests.fx('B'), $$delete from public.reviews where id = $$ || tests.l('REV1'), 'n:0', 'reviews: a buyer cannot delete');
select tests.expect(tests.fx('A'), $$delete from public.reviews where id = $$ || tests.l('REV1'), 'n:1', 'reviews: an admin deletes');
do $$
declare done uuid; open_o uuid;
begin
  insert into public.orders (buyer_id, seller_id, product_subtotal, status)
    values (tests.fx('B'), tests.fx('F'), 10, 'completed') returning id into done;
  insert into public.orders (buyer_id, seller_id, product_subtotal, status)
    values (tests.fx('B'), tests.fx('F'), 10, 'pending') returning id into open_o;
  insert into tests.fixtures values ('O_DONE', done), ('O_OPEN', open_o);
end $$;
select tests.expect(tests.fx('B'), 'insert into public.reviews (seller_id, buyer_id, rating, order_id) values (' || tests.l('F') || ',' || tests.l('B') || ',5,' || tests.l('O_DONE') || ')', 'n:1', 'reviews: a buyer reviews a completed order');
select tests.expect(tests.fx('B'), 'insert into public.reviews (seller_id, buyer_id, rating, order_id) values (' || tests.l('F') || ',' || tests.l('B') || ',5,' || tests.l('O_OPEN') || ')', 'err:42501', 'reviews: not an order that is still open');
select tests.expect(tests.fx('B2'), 'insert into public.reviews (seller_id, buyer_id, rating, order_id) values (' || tests.l('F') || ',' || tests.l('B2') || ',5,' || tests.l('O_DONE') || ')', 'err:42501', 'reviews: not someone else''s order');
select tests.expect(tests.fx('B2'), 'insert into public.reviews (seller_id, buyer_id, rating, order_id) values (' || tests.l('F') || ',' || tests.l('B') || ',5,' || tests.l('O_DONE') || ')', 'err:42501', 'reviews: cannot review as another buyer');

-- audit log and idempotency keys -----------------------------------------------------------------------
select tests.expect(tests.fx('A'), $$insert into public.audit_logs (action, target_entity) values ('pgtap', 'test')$$, 'n:1', 'audit_logs: an admin writes an entry');
select tests.expect(tests.fx('B'), $$insert into public.audit_logs (action, target_entity) values ('forged', 'test')$$, 'err:42501', 'audit_logs: a user cannot write one');
select tests.expect(tests.fx('A'), $$select id from public.audit_logs where action = 'pgtap'$$, 'rows:1', 'audit_logs: an admin reads entries');
select tests.expect(tests.fx('B'), $$select id from public.audit_logs$$, 'rows:0', 'audit_logs: a user reads none');
select tests.expect(tests.fx('B'), 'insert into public.idempotency_keys (user_id, key, endpoint) values (' || tests.l('B') || $$, 'pgtap-key-0001', 'orders.checkout')$$, 'n:1', 'idempotency_keys: a user claims a key');
select tests.expect(tests.fx('B'), 'insert into public.idempotency_keys (user_id, key, endpoint) values (' || tests.l('F') || $$, 'pgtap-key-0002', 'orders.checkout')$$, 'err:42501', 'idempotency_keys: cannot claim one for someone else');
select tests.expect(tests.fx('B2'), $$select id from public.idempotency_keys where key = 'pgtap-key-0001'$$, 'rows:0', 'idempotency_keys: another user cannot see it');
select tests.expect(tests.fx('B'), $$select id from public.idempotency_keys where key = 'pgtap-key-0001'$$, 'rows:1', 'idempotency_keys: the owner can');


-- suspended owners: still able to read, never to write ---------------------------------------------------
select tests.suspended_world();
select tests.expect(tests.fx('SF'), 'select id from public.listings where id = ' || tests.l('SL'), 'rows:1', 'listings: a suspended owner still reads their listing');
select tests.expect(tests.fx('SF'), $$update public.listings set price = 9 where id = $$ || tests.l('SL'), 'n:0', 'listings: but cannot update it');
select tests.expect(tests.fx('SF'), 'delete from public.listings where id = ' || tests.l('SL'), 'n:0', 'listings: or delete it');

select * from finish();
rollback;
