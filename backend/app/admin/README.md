# admin (API)

Platform stats, users (suspend, change role), reports, the audit log and platform orders. Every admin write is audit-logged (BR-15) and needs a second factor.

- **Owner lane:** `zl-admin` (docs/plan.md §3)
- **SRDS:** §12, §14, §51
- **Routes:** `/api/v1/admin` (see `backend/openapi.json`)
- **App side:** [`frontend/admin`](../../../frontend/admin/README.md)
- **Uses:** tables `audit_logs`, `listings`, `orders`, `profiles`, `reports`
- **Tests:** `backend/tests/admin/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `fetch_platform_stats`, `fetch_all_profiles`, `set_profile_suspended`, `update_user_role`, `fetch_reports`, `resolve_report`, `dismiss_report`, `fetch_audit_logs`, `fetch_all_orders`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.

Platform orders come through `app.common.orders.service`, not its repository (A1 module boundary).
