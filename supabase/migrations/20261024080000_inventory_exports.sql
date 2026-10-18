-- B5: dealer inventory exports (CSV reports) live in Supabase Storage, never in git or on the API's disk
-- (SRDS §45–§46: Supabase holds application files, Git holds code only).
--
-- A private bucket. Files sit at '{dealer_id}/...', so the first path segment names the one dealer who owns the file.
-- The same limit style as the other private buckets (20260922080200_storage_bucket_limits.sql): 10 MB is far above any
-- one dealer's CSV report, and only text/csv is accepted, so the bucket cannot be used to park other file types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory-exports', 'inventory-exports', false, 10485760, array['text/csv']);

-- BR-03/04 and SRDS §15: dealer inventory is dealer-only. An approved dealer reads only the files under their own
-- folder; there is deliberately no admin clause, unlike the document buckets, because no other role may see a
-- dealer's stock. is_approved_dealer() also shuts out a dealer who is pending or rejected. A suspended dealer still
-- reads their own folder, exactly as they still read their own inventory rows (B0: suspended users read, never write;
-- 20261021080000_inventory_data_model.sql); the API refuses a suspended account outright, so no new export is made.
--
-- There is no insert, update or delete policy: the backend writes and removes export files with the service role after
-- it has built the report itself, so a client can never plant or overwrite a file that looks like a server export.
create policy "inventory_exports_owner_read" on storage.objects for select to authenticated
  using (
    (bucket_id = 'inventory-exports')
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and (select public.is_approved_dealer())
  );
