# common/marketplace (API)

Listings (browse, detail, create, edit, delete, admin status moderation), categories, crops and listing views. Only the owner edits or deletes a listing; the admin changes only its status, with a second factor, audited (BR-15).

- **Owner lane:** `zl-commerce` (docs/plan.md §3)
- **SRDS:** §26–§29
- **Routes:** `/api/v1/marketplace` (see `backend/openapi.json`)
- **App side:** [`frontend/common/marketplace`](../../../../frontend/common/marketplace/README.md)
- **Uses:** tables `categories`, `crops`, `listing_views`, `listings`
- **Tests:** `backend/tests/common/marketplace/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `fetch_listings`, `fetch_listing_by_id`, `fetch_categories`, `create_category`, `update_category`, `delete_category`, `fetch_crops`, `create_listing`, `update_listing`, `delete_listing`, `update_listing_status`, `fetch_all_listings_for_moderation`, `record_listing_view`, `fetch_listing_view_counts`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.
