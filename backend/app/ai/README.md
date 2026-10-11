# ai (API)

Disease cases and prediction. `engine.py` runs the model in `checkpoints/`, which `scripts/fetch_model_weights.py` downloads from the private `ml-models` bucket; the weights are never committed. Results are advice only (BR-13).

- **Owner lane:** `zl-ai` (docs/plan.md §3)
- **SRDS:** §32–§37, §40
- **Routes:** `/api/v1/disease` (see `backend/openapi.json`)
- **App side:** [`frontend/ai`](../../../frontend/ai/README.md)
- **Uses:** tables `disease_cases`, `disease_predictions`, `disease_knowledge`; storage bucket `disease-images`
- **Tests:** `backend/tests/ai/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `create_case`, `get_case_for_user`, `predict`, `list_knowledge`, and `fetch_case_report(access_token, case_id)` for other modules (the consultations lane reads the case and its AI report as the caller, so RLS decides). The report text comes from the `disease_knowledge` table.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.
