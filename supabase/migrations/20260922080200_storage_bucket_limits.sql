-- Security fix H2 (standardization plan P3, docs/process/standardization-plan.md §1.2).
--
-- None of the six storage buckets had a size or MIME-type limit — the client's declared
-- Content-Type and filename extension were trusted as-is (backend/app/services and every
-- `src/services/modules/**` upload function). This is defense in depth at the storage layer:
-- an oversized or wrong-type object is now rejected by the bucket itself before it ever lands,
-- independent of whatever the client-side picker/upload code does.
--
-- Limits are deliberately generous relative to a phone camera photo (expo-image-picker uploads
-- at full quality — compression is phase P7) rather than tight, since the goal here is to reject
-- clearly-wrong content (a non-image file, a multi-hundred-MB payload), not to enforce a UX
-- budget.

update storage.buckets
set file_size_limit = 5242880,  -- 5 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

update storage.buckets
set file_size_limit = 8388608,  -- 8 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'listing-images';

update storage.buckets
set file_size_limit = 8388608,  -- 8 MB, matches the API-level cap in disease_service.predict()
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'disease-images';

update storage.buckets
set file_size_limit = 10485760,  -- 10 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'message-attachments';

update storage.buckets
set file_size_limit = 10485760,  -- 10 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'consultation-attachments';

update storage.buckets
set file_size_limit = 10485760,  -- 10 MB — expert verification documents are commonly PDFs
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
where id = 'expert-documents';
