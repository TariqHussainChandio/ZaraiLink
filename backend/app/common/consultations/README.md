# common/consultations (API)

Consultation requests, their status and images, and the consultation thread.

- **Owner lane:** `zl-expert` (docs/plan.md §3)
- **SRDS:** §34–§35
- **Routes:** `/api/v1/consultations` (see `backend/openapi.json`)
- **App side:** [`frontend/common/consultations`](../../../../frontend/common/consultations/README.md)
- **Uses:** tables `consultation_messages`, `consultations`
- **Tests:** `backend/tests/common/consultations/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `create_request`, `update_images`, `fetch_for_user`, `fetch_for_expert`, `fetch_by_id`, `update_status`, `fetch_messages`, `send_message`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.

An expert is looked up through `app.expert.service.find_expert` (A1 module boundary).
