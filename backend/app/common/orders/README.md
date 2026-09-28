# common/orders (API)

Checkout, orders, status changes and status history. The delivery charge is its own line (BR-09); there are no logistics entities (BR-10).

- **Owner lane:** `zl-commerce` (docs/plan.md §3)
- **SRDS:** §26–§29
- **Routes:** `/api/v1/orders` (see `backend/openapi.json`)
- **App side:** [`frontend/common/orders`](../../../../frontend/common/orders/README.md)
- **Uses:** tables `listings`, `order_items`, `order_status_history`, `orders`; database functions `available_stock`
- **Tests:** `backend/tests/common/orders/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `checkout`, `fetch_orders_for_user`, `read_orders_for_user`, `fetch_all_orders`, `fetch_order_by_id`, `fetch_order_status_history`, `update_order_status`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.
