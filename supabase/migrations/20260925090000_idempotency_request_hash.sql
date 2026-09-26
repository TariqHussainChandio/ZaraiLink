-- P5 (item 6, follow-up from the independent verification): remember what a key was first used for.
-- Without this, reusing an Idempotency-Key with a different request body replayed the first response as if
-- it answered the new request. The application stores a SHA-256 of the canonical request body here and
-- rejects a reuse whose hash differs (422), which is how payment providers treat the same mistake.
-- Nullable: rows written before this column existed have no hash and are replayed as before (they expire
-- after 24 hours). Table-level grants and the owner-only RLS policy from 20260925080000 already cover it.
alter table public.idempotency_keys add column request_hash text;
