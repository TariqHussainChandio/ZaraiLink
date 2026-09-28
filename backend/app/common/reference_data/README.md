# common/reference_data (API)

Currencies, units and the reference rows the admin manages (audit-logged).

- **Owner lane:** `zl-commerce` (docs/plan.md §3)
- **Routes:** `/api/v1/reference-data` (see `backend/openapi.json`)
- **App side:** [`frontend/common/reference-data`](../../../../frontend/common/reference-data/README.md)
- **Uses:** tables `currencies`, `units`
- **Tests:** `backend/tests/common/reference_data/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `fetch_currencies`, `fetch_units`, `fetch_rows`, `create_row`, `update_row`, `delete_row`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.
