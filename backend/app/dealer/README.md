# dealer (API)

Today's dealer inventory: stock items, stock adjustments, stores and suppliers. B0 moves the inventory part to `backend/app/inventory` (the IMS API).

- **Owner lane:** `zl-dealer (the inventory part passes to zl-inventory-api in B0)` (docs/plan.md §3)
- **SRDS:** §15–§17, §23
- **Routes:** `/api/v1/dealer` (see `backend/openapi.json`)
- **App side:** [`frontend/dealer`](../../../frontend/dealer/README.md)
- **Uses:** tables `dealer_stores`, `inventory`, `inventory_transactions`, `listings`, `suppliers`; database functions `adjust_stock`
- **Tests:** `backend/tests/dealer/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `fetch_inventory`, `fetch_inventory_by_id`, `fetch_dealer_listings`, `create_inventory_item`, `update_inventory_item`, `delete_inventory_item`, `fetch_inventory_transactions`, `adjust_stock`, `adjust_stock_as_user`, `fetch_stores`, `fetch_store_by_id`, `create_store`, `update_store`, `delete_store`, `fetch_suppliers`, `fetch_supplier_by_id`, `create_supplier`, `update_supplier`, `delete_supplier`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.

Dealer only (BR-03/04): the admin has no access to these routes or tables.
