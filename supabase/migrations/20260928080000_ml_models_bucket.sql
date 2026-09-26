-- Model weights live in Supabase Storage (SRDS §45–§46: Supabase holds application files, Git holds code only).
-- The trained disease model used to be a GitHub release asset, and before that a file in git history.
--
-- A private bucket. No storage.objects policy mentions it, so neither anon nor a signed-in user can list, read or
-- write it; only the service role can, and a signed URL it issues lets CI and the deployment download one file.
-- The app never reads this bucket: scripts/fetch_model_weights.py puts the file on the backend's disk.
-- Idempotent, because the hosted project got the bucket before this migration was pushed there.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ml-models', 'ml-models', false, 52428800, array['application/octet-stream'])
on conflict (id) do nothing;
