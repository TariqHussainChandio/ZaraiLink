-- Module 15 (AI Disease Advisory, §17). New public bucket for disease-case photos, policies
-- copied 1:1 from `listing-images` (20260820000000_core_schema.sql): public read (the FastAPI
-- inference service fetches the image by its public URL, no signed-URL resolution needed),
-- owner-scoped write via the object's path prefix.

insert into storage.buckets (id, name, public)
values ('disease-images', 'disease-images', true)
on conflict (id) do nothing;

create policy "disease_images_public_read"
  on storage.objects for select
  using (bucket_id = 'disease-images');

create policy "disease_images_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'disease-images' and owner = auth.uid());

create policy "disease_images_owner_update"
  on storage.objects for update
  using (bucket_id = 'disease-images' and owner = auth.uid());

create policy "disease_images_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'disease-images' and owner = auth.uid());
