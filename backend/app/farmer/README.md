# farmer (API)

Farms, farm crops and the farmer profile.

- **Owner lane:** `zl-farmer` (docs/plan.md §3)
- **SRDS:** §5
- **Routes:** `/api/v1/farmer` (see `backend/openapi.json`)
- **App side:** [`frontend/farmer`](../../../frontend/farmer/README.md)
- **Uses:** tables `farm_crops`, `farmer_profiles`, `farms`
- **Tests:** `backend/tests/farmer/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `fetch_farms`, `fetch_farm_by_id`, `create_farm`, `update_farm`, `delete_farm`, `fetch_farm_crops`, `fetch_farm_crop_by_id`, `create_farm_crop`, `update_farm_crop`, `delete_farm_crop`, `fetch_farmer_profile`, `upsert_farmer_profile`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.
