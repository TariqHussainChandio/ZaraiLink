# common/notifications (API)

In-app notifications and the unread count.

- **Owner lane:** `zl-comms` (docs/plan.md §3)
- **Routes:** `/api/v1/notifications` (see `backend/openapi.json`)
- **App side:** [`frontend/common/notifications`](../../../../frontend/common/notifications/README.md)
- **Uses:** tables `notifications`
- **Tests:** `backend/tests/common/notifications/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `fetch_notifications`, `fetch_unread_count`, `mark_read`, `mark_all_read`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.
