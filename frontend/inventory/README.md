# inventory (app)

Today's dealer inventory screens (stock items and their movements, stores, suppliers), moved here unchanged in A1. Plan B rebuilds this as the separate Inventory Management System with its own shell (B4).

- **Owner lane:** `zl-inventory-app` (docs/plan.md §3)
- **SRDS:** §15–§25, §41
- **API side:** [`backend/app/dealer`](../../backend/app/dealer/README.md)

## Public API

None: no other module imports from this one.

## Inside

`components/` · `hooks/` · `screens/` (6) · `services/` · `types/`. Tests sit beside the code they test.

Dealer only (BR-03/04). It has no `index.ts` yet; the dealer dashboard reaches these screens through `navigation/`. Their API is still in `backend/app/dealer` until B0 creates `backend/app/inventory`.
