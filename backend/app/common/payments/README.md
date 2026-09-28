# common/payments (API)

Manual payments (cash on delivery, bank transfer): initiate, mark received or failed, and the transaction record. No escrow, wallet or held funds (BR-11).

- **Owner lane:** `zl-commerce` (docs/plan.md §3)
- **SRDS:** §26
- **Routes:** `/api/v1/payments` (see `backend/openapi.json`)
- **App side:** [`frontend/common/payments`](../../../../frontend/common/payments/README.md)
- **Uses:** tables `orders`, `payment_transactions`, `payments`
- **Tests:** `backend/tests/common/payments/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `initiate_payment`, `fetch_payment_by_id`, `fetch_payment_by_order_id`, `fetch_payment_transactions`, `mark_payment_received`, `mark_payment_failed`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.
