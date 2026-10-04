-- P6 (item 3): allowed and rejected paths for the farmer, dealer, expert, disease and report policies, and for
-- every storage bucket. Users: F/F2 farmers, D/D2 dealers, E expert, B/B2 buyers, S suspended, A admin.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();
select tests.world();

-- farms, farm crops, farmer profiles -------------------------------------------------------------------
select tests.expect(tests.fx('F'), 'select id from public.farms where id = ' || tests.l('FARM1'), 'rows:1', 'farms: the owner reads their farm');
select tests.expect(tests.fx('F2'), 'select id from public.farms where id = ' || tests.l('FARM1'), 'rows:0', 'farms: another farmer does not');
select tests.expect(tests.fx('A'), 'select id from public.farms where id = ' || tests.l('FARM1'), 'rows:1', 'farms: an admin does');
select tests.expect(tests.fx('F'), 'insert into public.farms (owner_id, name) values (' || tests.l('F') || $$, 'Second farm')$$, 'n:1', 'farms: an owner adds one');
select tests.expect(tests.fx('F'), 'insert into public.farms (owner_id, name) values (' || tests.l('F2') || $$, 'Forged')$$, 'err:42501', 'farms: cannot add one for someone else');
select tests.expect(tests.fx('F'), $$update public.farms set name = 'Renamed' where id = $$ || tests.l('FARM1'), 'n:1', 'farms: the owner updates');
select tests.expect(tests.fx('F2'), $$update public.farms set name = 'Hijack' where id = $$ || tests.l('FARM1'), 'n:0', 'farms: another farmer cannot');
select tests.expect(tests.fx('F2'), 'delete from public.farms where id = ' || tests.l('FARM1'), 'n:0', 'farms: another farmer cannot delete');
select tests.expect(tests.fx('F'), 'select id from public.farm_crops where id = ' || tests.l('FC1'), 'rows:1', 'farm_crops: the farm owner reads them');
select tests.expect(tests.fx('F2'), 'select id from public.farm_crops where id = ' || tests.l('FC1'), 'rows:0', 'farm_crops: another farmer does not');
select tests.expect(tests.fx('F'), 'insert into public.farm_crops (farm_id) values (' || tests.l('FARM1') || ')', 'n:1', 'farm_crops: the owner adds one');
select tests.expect(tests.fx('F2'), 'insert into public.farm_crops (farm_id) values (' || tests.l('FARM1') || ')', 'err:42501', 'farm_crops: another farmer cannot');
select tests.expect(tests.fx('F'), 'update public.farm_crops set updated_at = now() where id = ' || tests.l('FC1'), 'n:1', 'farm_crops: the owner updates');
select tests.expect(tests.fx('F2'), 'update public.farm_crops set updated_at = now() where id = ' || tests.l('FC1'), 'n:0', 'farm_crops: another farmer cannot');
select tests.expect(tests.fx('F2'), 'delete from public.farm_crops where id = ' || tests.l('FC1'), 'n:0', 'farm_crops: another farmer cannot delete');
select tests.expect(tests.fx('F'), 'delete from public.farm_crops where id = ' || tests.l('FC1'), 'n:1', 'farm_crops: the owner deletes');
select tests.expect(tests.fx('F'), 'select id from public.farmer_profiles where id = ' || tests.l('F'), 'rows:1', 'farmer_profiles: the farmer reads their own');
select tests.expect(tests.fx('F2'), 'select id from public.farmer_profiles where id = ' || tests.l('F'), 'rows:0', 'farmer_profiles: another farmer does not');
select tests.expect(tests.fx('A'), 'select id from public.farmer_profiles where id = ' || tests.l('F'), 'rows:1', 'farmer_profiles: an admin does');
select tests.expect(tests.fx('F2'), 'insert into public.farmer_profiles (id) values (' || tests.l('F2') || ')', 'n:1', 'farmer_profiles: a farmer creates their own');
select tests.expect(tests.fx('F'), 'insert into public.farmer_profiles (id) values (' || tests.l('B') || ')', 'err:42501', 'farmer_profiles: cannot create one for someone else');
select tests.expect(tests.fx('F'), 'update public.farmer_profiles set updated_at = now() where id = ' || tests.l('F'), 'n:1', 'farmer_profiles: the farmer updates theirs');
select tests.expect(tests.fx('F2'), 'update public.farmer_profiles set updated_at = now() where id = ' || tests.l('F'), 'n:0', 'farmer_profiles: another farmer cannot');
select tests.expect(tests.fx('F2'), 'delete from public.farmer_profiles where id = ' || tests.l('F'), 'err:42501', 'farmer_profiles: nobody deletes through the API (no delete grant)');

-- dealer stores, suppliers, inventory ------------------------------------------------------------------
select tests.expect(tests.fx('D'), 'select id from public.dealer_stores where id = ' || tests.l('DS1'), 'rows:1', 'dealer_stores: the dealer reads their store');
select tests.expect(tests.fx('D2'), 'select id from public.dealer_stores where id = ' || tests.l('DS1'), 'rows:0', 'dealer_stores: another dealer does not');
select tests.expect(tests.fx('A'), 'select id from public.dealer_stores where id = ' || tests.l('DS1'), 'rows:1', 'dealer_stores: an admin reads (oversight)');
select tests.expect(tests.fx('A'), 'insert into public.dealer_stores (dealer_id, name) values (' || tests.l('D') || $$, 'Admin store')$$, 'err:42501', 'dealer_stores: an admin cannot write into a dealer store (BR-03/04: dealer-only)');
select tests.expect(tests.fx('D'), 'insert into public.dealer_stores (dealer_id, name) values (' || tests.l('D') || $$, 'Second store')$$, 'n:1', 'dealer_stores: the dealer adds one');
select tests.expect(tests.fx('D2'), 'insert into public.dealer_stores (dealer_id, name) values (' || tests.l('D') || $$, 'Forged')$$, 'err:42501', 'dealer_stores: cannot add one for another dealer');
select tests.expect(tests.fx('D'), $$update public.dealer_stores set name = 'Renamed' where id = $$ || tests.l('DS1'), 'n:1', 'dealer_stores: the dealer updates');
select tests.expect(tests.fx('D2'), $$update public.dealer_stores set name = 'Hijack' where id = $$ || tests.l('DS1'), 'n:0', 'dealer_stores: another dealer cannot');
select tests.expect(tests.fx('A'), $$update public.dealer_stores set name = 'Admin edit' where id = $$ || tests.l('DS1'), 'n:0', 'dealer_stores: an admin cannot');
select tests.expect(tests.fx('D2'), 'delete from public.dealer_stores where id = ' || tests.l('DS1'), 'n:0', 'dealer_stores: another dealer cannot delete');
select tests.expect(tests.fx('D'), 'delete from public.dealer_stores where id = ' || tests.l('DS1'), 'n:1', 'dealer_stores: the dealer deletes');
select tests.expect(tests.fx('D'), 'select id from public.suppliers where id = ' || tests.l('SUP1'), 'rows:1', 'suppliers: the dealer reads them');
select tests.expect(tests.fx('D2'), 'select id from public.suppliers where id = ' || tests.l('SUP1'), 'rows:0', 'suppliers: another dealer does not');
select tests.expect(tests.fx('A'), 'select id from public.suppliers where id = ' || tests.l('SUP1'), 'rows:1', 'suppliers: an admin reads');
select tests.expect(tests.fx('D'), 'insert into public.suppliers (dealer_id, name) values (' || tests.l('D') || $$, 'Second supplier')$$, 'n:1', 'suppliers: the dealer adds one');
select tests.expect(tests.fx('D2'), 'insert into public.suppliers (dealer_id, name) values (' || tests.l('D') || $$, 'Forged')$$, 'err:42501', 'suppliers: another dealer cannot');
select tests.expect(tests.fx('D'), $$update public.suppliers set name = 'Renamed' where id = $$ || tests.l('SUP1'), 'n:1', 'suppliers: the dealer updates');
select tests.expect(tests.fx('D2'), $$update public.suppliers set name = 'Hijack' where id = $$ || tests.l('SUP1'), 'n:0', 'suppliers: another dealer cannot');
select tests.expect(tests.fx('D2'), 'delete from public.suppliers where id = ' || tests.l('SUP1'), 'n:0', 'suppliers: another dealer cannot delete');
select tests.expect(tests.fx('D'), 'delete from public.suppliers where id = ' || tests.l('SUP1'), 'n:1', 'suppliers: the dealer deletes');
select tests.expect(tests.fx('D'), 'select id from public.inventory where id = ' || tests.l('INV1'), 'rows:1', 'inventory: the dealer reads theirs');
select tests.expect(tests.fx('D2'), 'select id from public.inventory where id = ' || tests.l('INV1'), 'rows:0', 'inventory: another dealer does not');
select tests.expect(tests.fx('F'), 'select id from public.inventory where id = ' || tests.l('INV1'), 'rows:0', 'inventory: a farmer does not (BR-03/04)');
select tests.expect(tests.fx('A'), 'select id from public.inventory where id = ' || tests.l('INV1'), 'rows:1', 'inventory: an admin reads (oversight)');
select tests.expect(tests.fx('D'), 'insert into public.inventory (dealer_id) values (' || tests.l('D') || ')', 'n:1', 'inventory: the dealer adds a row');
select tests.expect(tests.fx('D2'), 'insert into public.inventory (dealer_id) values (' || tests.l('D') || ')', 'err:42501', 'inventory: another dealer cannot');
select tests.expect(tests.fx('A'), 'insert into public.inventory (dealer_id) values (' || tests.l('D') || ')', 'err:42501', 'inventory: an admin cannot write');
select tests.expect(tests.fx('D'), 'update public.inventory set updated_at = now() where id = ' || tests.l('INV1'), 'n:1', 'inventory: the dealer updates');
select tests.expect(tests.fx('D2'), 'update public.inventory set updated_at = now() where id = ' || tests.l('INV1'), 'n:0', 'inventory: another dealer cannot');
select tests.expect(tests.fx('D2'), 'delete from public.inventory where id = ' || tests.l('INV1'), 'n:0', 'inventory: another dealer cannot delete');
select tests.expect(tests.fx('D'), 'select id from public.inventory_transactions where id = ' || tests.l('IT1'), 'rows:1', 'inventory_transactions: the dealer reads them');
select tests.expect(tests.fx('D2'), 'select id from public.inventory_transactions where id = ' || tests.l('IT1'), 'rows:0', 'inventory_transactions: another dealer does not');
select tests.expect(tests.fx('A'), 'select id from public.inventory_transactions where id = ' || tests.l('IT1'), 'rows:1', 'inventory_transactions: an admin reads');
select tests.expect(tests.fx('D'), 'insert into public.inventory_transactions (inventory_id, type, quantity) values (' || tests.l('INV1') || $$, 'addition', 1)$$, 'n:1', 'inventory_transactions: the dealer records one');
select tests.expect(tests.fx('D2'), 'insert into public.inventory_transactions (inventory_id, type, quantity) values (' || tests.l('INV1') || $$, 'addition', 1)$$, 'err:42501', 'inventory_transactions: another dealer cannot');
select tests.expect(tests.fx('A'), 'insert into public.inventory_transactions (inventory_id, type, quantity) values (' || tests.l('INV1') || $$, 'addition', 1)$$, 'err:42501', 'inventory_transactions: an admin cannot');

-- experts ----------------------------------------------------------------------------------------------
select tests.expect(tests.fx('E'), 'select id from public.experts where id = ' || tests.l('E'), 'rows:1', 'experts: an expert reads their own record');
select tests.expect(tests.fx('B'), 'select id from public.experts where id = ' || tests.l('E'), 'rows:1', 'experts: others see an approved expert');
select tests.make_user('E3', 'expert');
insert into public.experts (id) values (tests.fx('E3'));
select tests.expect(tests.fx('B'), 'select id from public.experts where id = ' || tests.l('E3'), 'rows:0', 'experts: others do not see an unapproved expert');
select tests.expect(tests.fx('A'), 'select id from public.experts where id = ' || tests.l('E'), 'rows:1', 'experts: an admin does');
select tests.make_user('E4', 'expert');
select tests.expect(tests.fx('E4'), 'insert into public.experts (id) values (' || tests.l('E4') || ')', 'n:1', 'experts: an expert registers themselves, while pending');
select tests.expect(tests.fx('F2'), 'insert into public.experts (id) values (' || tests.l('F2') || ')', 'err:42501', 'experts: any other role cannot file an expert application (20261005080000)');
select tests.expect(tests.fx('B'), 'insert into public.experts (id) values (' || tests.l('B2') || ')', 'err:42501', 'experts: cannot register someone else');
select tests.expect(tests.fx('S'), 'insert into public.experts (id) values (' || tests.l('S') || ')', 'err:42501', 'experts: a suspended user cannot');
select tests.expect(tests.fx('E'), 'update public.experts set updated_at = now() where id = ' || tests.l('E'), 'n:1', 'experts: the expert updates their record');
select tests.expect(tests.fx('B'), 'update public.experts set updated_at = now() where id = ' || tests.l('E'), 'n:0', 'experts: another user cannot');
select tests.expect(tests.fx('A'), 'update public.experts set updated_at = now() where id = ' || tests.l('E'), 'n:0', 'experts: an admin without a second factor cannot (20260928090000)');
select tests.expect(tests.fx('A'), 'update public.experts set updated_at = now() where id = ' || tests.l('E'), 'n:1', 'experts: an admin with a second factor can', 'aal2');
alter table public.experts disable trigger guard_experts_verification_status;
update public.experts set verification_status = 'approved' where id = tests.fx('E');
alter table public.experts enable trigger guard_experts_verification_status;
select tests.expect(tests.fx('B'), 'select id from public.experts where id = ' || tests.l('E'), 'rows:1', 'experts: once approved, everyone can see them');
select tests.expect(null, 'select id from public.experts where id = ' || tests.l('E'), 'rows:1', 'experts: including anon');
select tests.expect(null, 'select expert_id from public.expert_specializations where expert_id = ' || tests.l('E'), 'rows:1', 'expert_specializations: anyone reads');
select tests.expect(tests.fx('E'), 'insert into public.expert_specializations (expert_id, specialization) values (' || tests.l('E') || $$, 'irrigation')$$, 'n:1', 'expert_specializations: the expert adds one');
select tests.expect(tests.fx('B'), 'insert into public.expert_specializations (expert_id, specialization) values (' || tests.l('E') || $$, 'soil_management')$$, 'err:42501', 'expert_specializations: another user cannot');
select tests.expect(tests.fx('B'), 'delete from public.expert_specializations where expert_id = ' || tests.l('E'), 'n:0', 'expert_specializations: another user cannot delete');
select tests.expect(tests.fx('E'), 'delete from public.expert_specializations where expert_id = ' || tests.l('E') || $$ and specialization = 'irrigation'$$, 'n:1', 'expert_specializations: the expert deletes');
select tests.expect(tests.fx('E'), 'select id from public.expert_verifications where id = ' || tests.l('EV1'), 'rows:1', 'expert_verifications: the expert reads theirs');
select tests.expect(tests.fx('B'), 'select id from public.expert_verifications where id = ' || tests.l('EV1'), 'rows:0', 'expert_verifications: another user does not');
select tests.expect(tests.fx('A'), 'select id from public.expert_verifications where id = ' || tests.l('EV1'), 'rows:1', 'expert_verifications: an admin does');
select tests.expect(tests.fx('E'), 'insert into public.expert_verifications (expert_id) values (' || tests.l('E') || ')', 'err:42501', 'expert_verifications: the expert files none directly; submit_application() writes one per submission (20261012080000)');
select tests.expect(tests.fx('B'), 'insert into public.expert_verifications (expert_id) values (' || tests.l('E') || ')', 'err:42501', 'expert_verifications: another user cannot');
select tests.expect(tests.fx('A'), 'update public.expert_verifications set reviewed_by = ' || tests.l('A') || ' where id = ' || tests.l('EV1'), 'err:42501', 'expert_verifications: an admin without a second factor cannot decide');
select tests.expect(tests.fx('A'), 'update public.expert_verifications set reviewed_by = ' || tests.l('A') || ' where id = ' || tests.l('EV1'), 'err:42501', 'expert_verifications: nor one with a second factor, directly; decide_account_status() records the decision with its audit row (20261005080000)', 'aal2');
select tests.expect(tests.fx('E'), 'update public.expert_verifications set reviewed_by = ' || tests.l('E') || ' where id = ' || tests.l('EV1'), 'err:42501', 'expert_verifications: the expert cannot approve themselves');

-- disease cases and predictions, reports ----------------------------------------------------------------
select tests.expect(tests.fx('B'), 'select id from public.disease_cases where id = ' || tests.l('DC1'), 'rows:1', 'disease_cases: the owner reads their case');
select tests.expect(tests.fx('B2'), 'select id from public.disease_cases where id = ' || tests.l('DC1'), 'rows:0', 'disease_cases: another user does not');
select tests.expect(tests.fx('A'), 'select id from public.disease_cases where id = ' || tests.l('DC1'), 'rows:1', 'disease_cases: an admin does');
select tests.expect(tests.fx('B'), 'insert into public.disease_cases (user_id, storage_path) values (' || tests.l('B') || ', ' || quote_literal(tests.fx('B')::text || '/new.jpg') || ')', 'n:1', 'disease_cases: a user creates a case');
select tests.expect(tests.fx('B'), 'insert into public.disease_cases (user_id, storage_path) values (' || tests.l('B2') || $$, 'x.jpg')$$, 'err:42501', 'disease_cases: cannot create one for someone else');
select tests.expect(tests.fx('S'), 'insert into public.disease_cases (user_id, storage_path) values (' || tests.l('S') || $$, 'x.jpg')$$, 'err:42501', 'disease_cases: a suspended user cannot');
select tests.expect(tests.fx('B'), $$update public.disease_cases set storage_path = 'moved' where id = $$ || tests.l('DC1'), 'err:42501', 'disease_cases: a case is immutable through the API');
select tests.expect(tests.fx('B'), 'select id from public.disease_predictions where id = ' || tests.l('DP1'), 'rows:1', 'disease_predictions: the case owner reads the result');
select tests.expect(tests.fx('B2'), 'select id from public.disease_predictions where id = ' || tests.l('DP1'), 'rows:0', 'disease_predictions: another user does not');
select tests.expect(tests.fx('A'), 'select id from public.disease_predictions where id = ' || tests.l('DP1'), 'rows:1', 'disease_predictions: an admin does');
select tests.expect(tests.fx('B'), 'insert into public.disease_predictions (disease_case_id, predicted_disease, confidence_score) values (' || tests.l('DC1') || $$, 'forged', 0.5)$$, 'err:42501', 'disease_predictions: a client cannot write a result (BR-13, backend only)');
select tests.expect(tests.fx('B'), 'select id from public.reports where id = ' || tests.l('REP1'), 'rows:1', 'reports: the reporter reads their report');
select tests.expect(tests.fx('B2'), 'select id from public.reports where id = ' || tests.l('REP1'), 'rows:0', 'reports: another user does not');
select tests.expect(tests.fx('A'), 'select id from public.reports where id = ' || tests.l('REP1'), 'rows:1', 'reports: an admin does');
select tests.expect(tests.fx('B2'), 'insert into public.reports (reporter_id, target_type, target_id, reason) values (' || tests.l('B2') || ', ' || quote_literal('user') || ',' || tests.l('F') || $$, 'abuse')$$, 'n:1', 'reports: a user files one');
select tests.expect(tests.fx('B'), 'insert into public.reports (reporter_id, target_type, target_id, reason) values (' || tests.l('B2') || ', ' || quote_literal('user') || ',' || tests.l('F') || $$, 'forged')$$, 'err:42501', 'reports: cannot file one as someone else');
select tests.expect(tests.fx('S'), 'insert into public.reports (reporter_id, target_type, target_id, reason) values (' || tests.l('S') || ', ' || quote_literal('user') || ',' || tests.l('F') || $$, 'suspended')$$, 'err:42501', 'reports: a suspended user cannot');
select tests.expect(tests.fx('A'), $$update public.reports set status = 'investigating' where id = $$ || tests.l('REP1'), 'n:0', 'reports: an admin without a second factor cannot act');
select tests.expect(tests.fx('A'), $$update public.reports set status = 'investigating' where id = $$ || tests.l('REP1'), 'n:1', 'reports: an admin with a second factor acts', 'aal2');
select tests.expect(tests.fx('B'), $$update public.reports set status = 'dismissed' where id = $$ || tests.l('REP1'), 'n:0', 'reports: the reporter cannot resolve their own report');

-- storage buckets --------------------------------------------------------------------------------------
insert into storage.objects (bucket_id, name, owner) values
  ('avatars', tests.fx('B')::text || '/a.png', tests.fx('B')),
  ('listing-images', tests.fx('F')::text || '/l.png', tests.fx('F')),
  ('disease-images', tests.fx('B')::text || '/leaf.png', tests.fx('B')),
  ('expert-documents', tests.fx('E')::text || '/cv.pdf', tests.fx('E')),
  ('message-attachments', tests.fx('C1')::text || '/' || tests.fx('B')::text || '/m.png', tests.fx('B')),
  ('consultation-attachments', tests.fx('CONS1')::text || '/c.png', tests.fx('B'));

-- Storage refuses direct deletes unless its API sets this flag; the policies are what is under test here.
select set_config('storage.allow_delete_query', 'true', true);
-- anon selecting storage.objects fails outright, not with zero rows: the select policies of the private buckets
-- read tables anon has no grant on (consultations, conversations). Public buckets are still served by the
-- Storage API's public URL, which does not go through these policies, so nothing user-facing depends on it.
select tests.expect(null, $$select id from storage.objects where bucket_id = 'avatars' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'err:42501', 'avatars: anon cannot list through SQL (public URLs are served by the Storage API)');
select tests.expect(tests.fx('B2'), $$select id from storage.objects where bucket_id = 'avatars' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:1', 'avatars: any signed-in user reads (public bucket)');
select tests.expect(tests.fx('B'), $$insert into storage.objects (bucket_id, name, owner) values ('avatars', $$ || quote_literal(tests.fx('B')::text || '/b.png') || ', ' || tests.l('B') || ')', 'n:1', 'avatars: an owner uploads');
select tests.expect(tests.fx('B'), $$insert into storage.objects (bucket_id, name, owner) values ('avatars', 'x.png', $$ || tests.l('F') || ')', 'err:42501', 'avatars: cannot upload as another owner');
select tests.expect(tests.fx('B'), $$update storage.objects set metadata = '{}'::jsonb where bucket_id = 'avatars' and owner = $$ || tests.l('B'), 'n:2', 'avatars: the owner updates');
select tests.expect(tests.fx('F'), $$update storage.objects set metadata = '{}'::jsonb where bucket_id = 'avatars' and owner = $$ || tests.l('B'), 'n:0', 'avatars: another user cannot');
select tests.expect(tests.fx('F'), $$delete from storage.objects where bucket_id = 'avatars' and owner = $$ || tests.l('B'), 'n:0', 'avatars: another user cannot delete');
select tests.expect(tests.fx('B'), $$delete from storage.objects where bucket_id = 'avatars' and owner = $$ || tests.l('B'), 'n:2', 'avatars: the owner deletes');
select tests.expect(tests.fx('B2'), $$select id from storage.objects where bucket_id = 'listing-images' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:1', 'listing-images: any signed-in user reads (public bucket)');
select tests.expect(tests.fx('F'), $$insert into storage.objects (bucket_id, name, owner) values ('listing-images', $$ || quote_literal(tests.fx('F')::text || '/l2.png') || ', ' || tests.l('F') || ')', 'n:1', 'listing-images: an owner uploads');
select tests.expect(tests.fx('F2'), $$insert into storage.objects (bucket_id, name, owner) values ('listing-images', 'x.png', $$ || tests.l('F') || ')', 'err:42501', 'listing-images: cannot upload as another owner');
select tests.expect(tests.fx('F'), $$update storage.objects set metadata = '{}'::jsonb where bucket_id = 'listing-images' and owner = $$ || tests.l('F'), 'n:2', 'listing-images: the owner updates');
select tests.expect(tests.fx('F2'), $$update storage.objects set metadata = '{}'::jsonb where bucket_id = 'listing-images' and owner = $$ || tests.l('F'), 'n:0', 'listing-images: another user cannot');
select tests.expect(tests.fx('F2'), $$delete from storage.objects where bucket_id = 'listing-images' and owner = $$ || tests.l('F'), 'n:0', 'listing-images: another user cannot delete');
select tests.expect(tests.fx('F'), $$delete from storage.objects where bucket_id = 'listing-images' and owner = $$ || tests.l('F'), 'n:2', 'listing-images: the owner deletes');
select tests.expect(tests.fx('B'), $$select id from storage.objects where bucket_id = 'disease-images' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:1', 'disease-images: the owner reads their photo');
select tests.expect(tests.fx('B2'), $$select id from storage.objects where bucket_id = 'disease-images' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:0', 'disease-images: private to others');
select tests.expect(null, $$select id from storage.objects where bucket_id = 'disease-images' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'err:42501', 'disease-images: closed to anon');
select tests.expect(tests.fx('A'), $$select id from storage.objects where bucket_id = 'disease-images' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:1', 'disease-images: an admin reads');
select tests.expect(tests.fx('B'), $$insert into storage.objects (bucket_id, name, owner) values ('disease-images', $$ || quote_literal(tests.fx('B')::text || '/leaf2.png') || ', ' || tests.l('B') || ')', 'n:1', 'disease-images: an owner uploads into their own folder');
select tests.expect(tests.fx('B'), $$insert into storage.objects (bucket_id, name, owner) values ('disease-images', $$ || quote_literal(tests.fx('F')::text || '/leaf.png') || ', ' || tests.l('B') || ')', 'err:42501', 'disease-images: not into another user''s folder');
select tests.expect(tests.fx('B'), $$update storage.objects set metadata = '{}'::jsonb where bucket_id = 'disease-images' and owner = $$ || tests.l('B'), 'n:2', 'disease-images: the owner updates');
select tests.expect(tests.fx('B2'), $$update storage.objects set metadata = '{}'::jsonb where bucket_id = 'disease-images'$$, 'n:0', 'disease-images: another user cannot');
select tests.expect(tests.fx('B2'), $$delete from storage.objects where bucket_id = 'disease-images'$$, 'n:0', 'disease-images: another user cannot delete');
select tests.expect(tests.fx('B'), $$delete from storage.objects where bucket_id = 'disease-images' and owner = $$ || tests.l('B'), 'n:2', 'disease-images: the owner deletes');
select tests.expect(tests.fx('E'), $$select id from storage.objects where bucket_id = 'expert-documents' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:1', 'expert-documents: the owner reads their document');
select tests.expect(tests.fx('B'), $$select id from storage.objects where bucket_id = 'expert-documents' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:0', 'expert-documents: private to others');
select tests.expect(tests.fx('A'), $$select id from storage.objects where bucket_id = 'expert-documents' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:1', 'expert-documents: an admin reads (verification)');
select tests.expect(tests.fx('E'), $$insert into storage.objects (bucket_id, name, owner) values ('expert-documents', $$ || quote_literal(tests.fx('E')::text || '/id.pdf') || ', ' || tests.l('E') || ')', 'err:42501', 'expert-documents: an approved expert''s application is closed to new files (20261012080000)');
select tests.expect(tests.fx('B'), $$insert into storage.objects (bucket_id, name, owner) values ('expert-documents', 'x.pdf', $$ || tests.l('E') || ')', 'err:42501', 'expert-documents: cannot upload as another owner');
select tests.expect(tests.fx('E'), $$delete from storage.objects where bucket_id = 'expert-documents'$$, 'n:0', 'expert-documents: nor deletes them (only while the application is editable, 20261012080000)');
select tests.expect(tests.fx('B'), $$select id from storage.objects where bucket_id = 'message-attachments' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:1', 'message-attachments: a participant reads');
select tests.expect(tests.fx('F'), $$select id from storage.objects where bucket_id = 'message-attachments' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:1', 'message-attachments: the other participant reads');
select tests.expect(tests.fx('B2'), $$select id from storage.objects where bucket_id = 'message-attachments' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:0', 'message-attachments: a stranger does not');
select tests.expect(tests.fx('A'), $$select id from storage.objects where bucket_id = 'message-attachments' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:0', 'message-attachments: chats stay private, even from an admin');
select tests.expect(tests.fx('F'), $$insert into storage.objects (bucket_id, name, owner) values ('message-attachments', $$ || quote_literal(tests.fx('C1')::text || '/' || tests.fx('F')::text || '/r.png') || ', ' || tests.l('F') || ')', 'n:1', 'message-attachments: a participant uploads into the conversation');
select tests.expect(tests.fx('B2'), $$insert into storage.objects (bucket_id, name, owner) values ('message-attachments', $$ || quote_literal(tests.fx('C1')::text || '/' || tests.fx('B2')::text || '/x.png') || ', ' || tests.l('B2') || ')', 'err:42501', 'message-attachments: a stranger cannot');
select tests.expect(tests.fx('B'), $$select id from storage.objects where bucket_id = 'consultation-attachments' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:1', 'consultation-attachments: the requester reads');
select tests.expect(tests.fx('E'), $$select id from storage.objects where bucket_id = 'consultation-attachments' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:1', 'consultation-attachments: the expert reads');
select tests.expect(tests.fx('A'), $$select id from storage.objects where bucket_id = 'consultation-attachments' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:1', 'consultation-attachments: an admin reads');
select tests.expect(tests.fx('B2'), $$select id from storage.objects where bucket_id = 'consultation-attachments' and owner in ($$ || tests.l('B') || ',' || tests.l('F') || ',' || tests.l('E') || ')', 'rows:0', 'consultation-attachments: a stranger does not');
select tests.expect(tests.fx('E'), $$insert into storage.objects (bucket_id, name, owner) values ('consultation-attachments', $$ || quote_literal(tests.fx('CONS1')::text || '/e.png') || ', ' || tests.l('E') || ')', 'n:1', 'consultation-attachments: the expert uploads');
select tests.expect(tests.fx('B2'), $$insert into storage.objects (bucket_id, name, owner) values ('consultation-attachments', $$ || quote_literal(tests.fx('CONS1')::text || '/x.png') || ', ' || tests.l('B2') || ')', 'err:42501', 'consultation-attachments: a stranger cannot');


-- deletes that need a row with no dependants, and updates on a key-only table -------------------------------
do $$
declare tf uuid; ti uuid;
begin
  insert into public.farms (owner_id, name) values (tests.fx('F'), 'Temp farm') returning id into tf;
  insert into public.inventory (dealer_id) values (tests.fx('D')) returning id into ti;
  insert into tests.fixtures values ('TFARM', tf), ('TINV', ti);
end $$;
select tests.expect(tests.fx('F2'), 'delete from public.farms where id = ' || tests.l('TFARM'), 'n:0', 'farms: another farmer cannot delete');
select tests.expect(tests.fx('F'), 'delete from public.farms where id = ' || tests.l('TFARM'), 'n:1', 'farms: the owner deletes a farm');
select tests.expect(tests.fx('D2'), 'delete from public.inventory where id = ' || tests.l('TINV'), 'n:0', 'inventory: another dealer cannot delete');
select tests.expect(tests.fx('D'), 'delete from public.inventory where id = ' || tests.l('TINV'), 'n:1', 'inventory: the dealer deletes a row');
select tests.expect(tests.fx('E'), $$update public.expert_specializations set specialization = 'general_agriculture' where expert_id = $$ || tests.l('E') || $$ and specialization = 'plant_diseases'$$, 'n:1', 'expert_specializations: the expert changes one');
select tests.expect(tests.fx('B'), $$update public.expert_specializations set specialization = 'irrigation' where expert_id = $$ || tests.l('E'), 'n:0', 'expert_specializations: another user cannot');

-- suspended owners: still able to read, never to write ---------------------------------------------------
select tests.suspended_world();
select tests.expect(tests.fx('SF'), 'select id from public.farms where id = ' || tests.l('SFARM'), 'rows:1', 'farms: a suspended owner still reads their farm');
select tests.expect(tests.fx('SF'), $$update public.farms set name = 'x' where id = $$ || tests.l('SFARM'), 'n:0', 'farms: but cannot update it');
select tests.expect(tests.fx('SF'), 'delete from public.farms where id = ' || tests.l('SFARM'), 'n:0', 'farms: or delete it');
select tests.expect(tests.fx('SF'), 'update public.farm_crops set updated_at = now() where id = ' || tests.l('SFC'), 'n:0', 'farm_crops: a suspended owner cannot update');
select tests.expect(tests.fx('SF'), 'delete from public.farm_crops where id = ' || tests.l('SFC'), 'n:0', 'farm_crops: or delete');
select tests.expect(tests.fx('SF'), 'update public.farmer_profiles set updated_at = now() where id = ' || tests.l('SF'), 'n:0', 'farmer_profiles: a suspended farmer cannot update');
select tests.expect(tests.fx('SD'), $$update public.dealer_stores set name = 'x' where id = $$ || tests.l('SDS'), 'n:0', 'dealer_stores: a suspended dealer cannot update');
select tests.expect(tests.fx('SD'), 'delete from public.dealer_stores where id = ' || tests.l('SDS'), 'n:0', 'dealer_stores: or delete');
select tests.expect(tests.fx('SD'), $$update public.suppliers set name = 'x' where id = $$ || tests.l('SSUP'), 'n:0', 'suppliers: a suspended dealer cannot update');
select tests.expect(tests.fx('SD'), 'delete from public.suppliers where id = ' || tests.l('SSUP'), 'n:0', 'suppliers: or delete');
select tests.expect(tests.fx('SD'), 'update public.inventory set updated_at = now() where id = ' || tests.l('SINV'), 'n:0', 'inventory: a suspended dealer cannot update');
select tests.expect(tests.fx('SD'), 'delete from public.inventory where id = ' || tests.l('SINV'), 'n:0', 'inventory: or delete');
select tests.expect(tests.fx('SE'), 'update public.experts set updated_at = now() where id = ' || tests.l('SE'), 'n:0', 'experts: a suspended expert cannot update their record');

select * from finish();
rollback;
