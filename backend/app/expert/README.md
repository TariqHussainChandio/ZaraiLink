# expert (API)

The expert application and profile, the expert directory, and the admin verification queue with document links.

- **Owner lane:** `zl-expert` (docs/plan.md §3)
- **SRDS:** §10–§12
- **Routes:** `/api/v1/expert` (see `backend/openapi.json`)
- **App side:** [`frontend/expert`](../../../frontend/expert/README.md)
- **Uses:** tables `expert_specializations`, `expert_verifications`, `experts`; storage bucket `expert-documents`
- **Tests:** `backend/tests/expert/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `submit_application`, `update_profile`, `fetch_my_profile`, `find_expert`, `fetch_expert_by_id`, `fetch_experts`, `fetch_experts_for_admin`, `fetch_expert_for_admin_by_id`, `review_verification`, `get_document_url`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.
