-- Pair for migration 20260928080000_ml_models_bucket.sql: the model-weights bucket is private and closed to every
-- client role; only the service role (which bypasses row-level security) can use it.
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();

select is(
  (select public from storage.buckets where id = 'ml-models'),
  false, 'ml-models: the bucket exists and is private');
select is(
  (select file_size_limit from storage.buckets where id = 'ml-models'),
  52428800::bigint, 'ml-models: uploads are capped at 50 MB');
select is(
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and (qual ilike '%ml-models%' or with_check ilike '%ml-models%')),
  0::bigint, 'ml-models: no storage policy opens the bucket to any client role');

select tests.world();
insert into storage.objects (bucket_id, name) values ('ml-models', 'mobilenetv2/model.pth');

select tests.expect(null, $$select id from storage.objects where bucket_id = 'ml-models'$$, 'err:42501', 'ml-models: anon cannot list it');
select tests.expect(tests.fx('B'), $$select id from storage.objects where bucket_id = 'ml-models'$$, 'rows:0', 'ml-models: a signed-in user sees nothing in it');
select tests.expect(tests.fx('A'), $$select id from storage.objects where bucket_id = 'ml-models'$$, 'rows:0', 'ml-models: not even an admin reads it through the API');
select tests.expect(tests.fx('F'), $$insert into storage.objects (bucket_id, name, owner) values ('ml-models', 'x/model.pth', $$ || tests.l('F') || ')', 'err:42501', 'ml-models: a signed-in user cannot upload to it');

select * from finish();
rollback;
