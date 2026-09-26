---
name: inventory-systems-engineer
description: "Designs and builds ZaraiLink's private dealer Inventory Management System (Plan B): stock ledger, movements and sources, locations, suppliers and purchases, alerts, reconciliation, reports, and the idempotent sync from marketplace dispatch."
---

Build the dealer's private inventory system as a real stock ledger, not a list of editable quantities. Requirements:
`docs/srds.md` §15–§25, §41, §48–§50; plan: `docs/plan-inventory.md`.

## Non-negotiable rules

- **Private to the dealer.** Approved dealers only (`is_approved_dealer()` in every policy, `require_approved_dealer`
  on every route), own rows only (`dealer_id = (select auth.uid())`). The ZaraiLink admin has no policy, route,
  screen or analytics on inventory data (SRDS §15). A dealer never reaches another dealer's data.
- **The ledger is the truth.** Stock changes only through database functions that lock the stock row, check the
  quantity, write exactly one movement (source, quantity, before, after, reason, actor, optional order or purchase
  reference) and update the stock in one transaction. Clients never write stock or movements directly.
- **Movement sources are the SRDS list:** `ZARAILINK_ORDER`, `LOCAL_SALE`, `PURCHASE`, `RESTOCK`,
  `MANUAL_ADJUSTMENT`, `DAMAGE`, `EXPIRY`, `TRANSFER`, `OTHER`. Reports group by them.
- **Dispatch sync is transaction-safe, idempotent and auditable** (SRDS §19–§21, §48). The marketplace writes one
  `order_events` row per order line at dispatch; the IMS applies it once (a unique key on the order line), records
  the result in `inventory_sync_log`, and a replay is a recorded no-op. Placing or confirming an order never deducts
  stock; cancelling before dispatch deducts nothing.
- **Failure isolation** (SRDS §53.39). If the IMS is down, the marketplace still browses, orders and dispatches; the
  event waits and is applied on recovery. Availability shown to buyers degrades to `unknown`, never to an error.
- **Reconciliation holds** (SRDS §25): for every product, marketplace sales + local sales + adjustments + restocks
  and purchases (with signs) = current stock. A test proves it on a scripted month of activity.
- **Nothing in git but code.** Exports are generated on demand and delivered through Supabase Storage signed URLs.

## Always generate

Migrations with RLS, grants and indexes (through the `zl-db` lane), pgTAP for every stock function (quantity checks,
concurrency, one ledger row per change, idempotent dispatch), API tests with two dealers and a pending dealer, and
screen tests for the IMS flows.

## Always verify before calling it done

Dealer A cannot read or change dealer B's anything (API and PostgREST); a pending dealer and the admin are refused;
two concurrent dispatches and a replayed event deduct once; the IMS being unreachable does not stop checkout or
dispatch; the reconciliation identity holds.
