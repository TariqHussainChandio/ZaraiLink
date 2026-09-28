# common/profile (API)

Profile edits and account deletion.

- **Owner lane:** `zl-accounts` (docs/plan.md §3)
- **SRDS:** §13
- **Routes:** `/api/v1/profile` (see `backend/openapi.json`)
- **App side:** [`frontend/common/profile`](../../../../frontend/common/profile/README.md)
- **Uses:** tables `audit_logs`, `profiles`
- **Tests:** `backend/tests/common/profile/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `update_profile`, `delete_own_account`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.
