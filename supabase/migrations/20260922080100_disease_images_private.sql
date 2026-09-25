-- Security fix C2 (standardization plan P3, docs/process/standardization-plan.md §1.2).
--
-- `disease_cases.image_url` let the client hand the backend ANY url, which `predict()`
-- (backend/app/services/disease_service.py) then fetched server-side with no restriction — a
-- blind SSRF, confirmed in the P0 runtime baseline: the server fetched its own gateway and
-- itself, with distinguishable errors for reachable vs. unreachable targets.
--
-- Fix: the client can now only ever hand the backend a storage PATH inside the disease-images
-- bucket (validated further by the API layer against the caller's own id), never an arbitrary
-- URL. The server resolves that path through the Storage API itself (download for inference,
-- create_signed_url for display) — it never makes an outbound request to a client-chosen host.
-- The bucket goes private so the old public-URL shape stops working entirely, matching the
-- existing `expert-documents` pattern (20260828080000_expert_module_extensions.sql).

-- Existing rows (if any — N1/N3 in the baseline meant few if any create_case calls ever
-- succeeded against a real database) carry a Supabase public-URL string; extract the path
-- segment after the bucket name so nothing is silently dropped.
alter table public.disease_cases add column storage_path text;

update public.disease_cases
set storage_path = regexp_replace(image_url, '^.*?/disease-images/', '')
where storage_path is null;

alter table public.disease_cases alter column storage_path set not null;
alter table public.disease_cases drop column image_url;

update storage.buckets set public = false where id = 'disease-images';

drop policy if exists "disease_images_public_read" on storage.objects;

create policy "disease_images_owner_or_admin_read"
  on storage.objects for select
  using (bucket_id = 'disease-images' and (owner = auth.uid() or public.is_admin()));
