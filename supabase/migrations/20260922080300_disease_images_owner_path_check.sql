-- Follow-up to the C2 fix (20260922080100_disease_images_private.sql), found by this phase's
-- verifier: `disease_images_owner_write`/`_update`/`_delete` (20260901080000_disease_images_bucket.sql)
-- check `owner = auth.uid()`, but Storage auto-sets `owner` to the uploader regardless of the
-- chosen path — so that clause is trivially true for ANY path, not just one under the caller's
-- own id. Any authenticated user could write an object into another user's folder
-- (`<victim-id>/whatever.jpg`). Not an SSRF or data-exposure regression (disease_service.create_case's
-- `storage_path.startswith(f"{user.id}/")` check still stops a planted object from ever being
-- linked into a disease_cases row under someone else's name, and the read policy already checks
-- the real `owner` column, not the path), but a storage-quota-abuse gap worth closing at the same
-- layer C2 just hardened, matching the folder-ownership check already used for
-- `message-attachments`/`consultation-attachments` (20260826080000/20260828080100).

drop policy if exists "disease_images_owner_write" on storage.objects;
drop policy if exists "disease_images_owner_update" on storage.objects;
drop policy if exists "disease_images_owner_delete" on storage.objects;

create policy "disease_images_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'disease-images'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "disease_images_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'disease-images'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "disease_images_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'disease-images'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
