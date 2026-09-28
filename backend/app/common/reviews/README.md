# common/reviews (API)

Reviews of orders and consultations, and the listing, seller and expert review lists.

- **Owner lane:** `zl-commerce` (docs/plan.md §3)
- **SRDS:** §26, §35
- **Routes:** `/api/v1/reviews` (see `backend/openapi.json`)
- **App side:** [`frontend/common/reviews`](../../../../frontend/common/reviews/README.md)
- **Uses:** tables `consultations`, `orders`, `reviews`
- **Tests:** `backend/tests/common/reviews/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `create_review`, `create_consultation_review`, `fetch_review_by_id`, `fetch_review_by_order_id`, `fetch_review_by_consultation_id`, `fetch_reviews_for_listing`, `fetch_reviews_for_seller`, `fetch_reviews_for_expert`, `delete_review`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.
