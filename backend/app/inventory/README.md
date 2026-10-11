# backend/app/inventory

The dealer Inventory Management System API (Plan B, `docs/plan-inventory.md`). Owned by `zl-inventory-api`.

- `schemas.py`, `repository.py`: the models and data access over the tables of
  `supabase/migrations/20261021080000_inventory_data_model.sql` (B1) and `20261022090000_inventory_sync.sql` (B3).
- One file per B2 sub-lane, each with its service functions and its own `APIRouter`: `products.py`, `stock.py`
  (stock and locations, transfers), `movements.py` (ledger, Stock In/Out, Adjustment), `purchasing.py` (suppliers,
  purchases), `alerts.py` (low and out of stock, settings), `dashboard.py` (SRDS §18), `sync.py` (B3 sync log, retry,
  reconciliation). `errors.py` maps the stock functions' errors (P0001 → 422 `insufficient_stock`).
- `router.py` mounts them under `/api/v1/inventory`; every route requires an approved dealer (`require_dealer`).
- `service.py` is the entry point for other modules: the dealer module's legacy inventory, store and supplier routes
  and the dealer analytics read the IMS through it, in their old response shapes.

Stock and the ledger change only through the database functions (`record_movement`, `transfer_stock`,
`receive_purchase`, `retry_dispatch_events`; dispatch through `apply_dispatch_event`); the repository never writes
`inventory_stock` or `inventory_movements`. Every call uses the dealer's own token, so row-level security keeps each
dealer to their own rows and the admin out.
