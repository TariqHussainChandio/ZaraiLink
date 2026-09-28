# common/analytics (API)

The numbers on the farmer, dealer, expert and admin dashboards.

- **Owner lane:** `zl-commerce` (docs/plan.md §3)
- **Routes:** `/api/v1/analytics` (see `backend/openapi.json`)
- **App side:** [`frontend/common/analytics`](../../../../frontend/common/analytics/README.md)
- **Uses:** tables `consultations`, `experts`, `inventory_transactions`, `listings`, `orders`, `payments`, `profiles`, `reports`
- **Tests:** `backend/tests/common/analytics/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `fetch_farmer_analytics`, `fetch_dealer_analytics`, `fetch_expert_analytics`, `fetch_admin_analytics`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.

Rows another module already serves (a user's farms, orders, consultations, reviews, dealer stock) come through that module's `service.py` (A1 module boundary). Its own repository reads only the status and amount columns it counts, with the caller's token, so row-level security decides what each role sees.
