# Plan B — Dealer Inventory Management System (IMS)

> Part of the plan of record ([`docs/plan.md`](plan.md)); requirements in [`docs/srds.md`](srds.md) §15–§25, §41,
> §48–§50. The IMS is a private, dealer-only system with its own dashboard, navigation and interface, opened from the
> approved dealer's ZaraiLink dashboard. The dealer controls it; the ZaraiLink admin has no operational access.
> Its data lives in the same Supabase project, isolated by ownership and authorization.
>
> Plan B starts after Plan A's A1 (restructure) and A3 (dealer approval). It consumes two Plan A outputs: the
> account-status contract and the order-dispatched event. Lanes, contracts and decisions: `docs/plan.md` §3–§6.

## 1. Where the repository stands

| SRDS requirement | Today | Verdict |
|---|---|---|
| Only approved dealers reach the IMS (§16, §50) | Every dealer reaches inventory screens from the Home stack; dealers are active at sign-up | Change (needs A3) |
| Admin has no operational access (§15, §53.12) | RLS lets the admin read `inventory`, `inventory_transactions`, `dealer_stores`, `suppliers`; admin analytics can read inventory movements | Remove |
| A dealer never sees another dealer's inventory (§50) | Enforced by `dealer_id = auth.uid()` policies; one row per listing per dealer; listing must belong to the dealer | Keep |
| Own application interface and dashboard (§16–§18) | Inventory list, stock movement history, stores, suppliers, dealer analytics, inside the marketplace tabs | Build (separate app) |
| Products/SKUs, stock, storage locations, suppliers (§17) | `inventory` rows linked to listings (no SKU, no product separate from a listing); `dealer_stores` (shops); `suppliers` | Change |
| Stock movements with sources: ZARAILINK_ORDER, LOCAL_SALE, PURCHASE, RESTOCK, MANUAL_ADJUSTMENT, DAMAGE, EXPIRY, TRANSFER, OTHER (§24) | `inventory_transactions` types addition, reduction, adjustment, sale, restock, correction; no source, no order reference, no before/after | Change |
| Manual stock in/out/adjust with reasons (§22–§23) | `adjust_stock` with a type and notes | Change |
| Low-stock alerts (§17–§18) | `min_stock_threshold` + a low-stock notification trigger | Keep, extend |
| Purchase/restock records (§17) | None | Build |
| Reports, analytics, reconciliation, settings (§17, §25) | Dealer analytics (sales, movement, low stock, best sellers) in the marketplace | Build |
| Stock reduced automatically at **dispatch**, idempotent, auditable, transaction-safe (§19–§21, §48) | Reduced at **confirm** by a trigger, once per status change; no event, no order reference on the movement | Change |
| IMS failure never takes down the marketplace (§53.39) | Order confirm fails if stock is short; no isolation | Build |

## 2. Data model (target)

All tables owned by the dealer (`dealer_id`), with row-level security `dealer_id = (select auth.uid()) and
is_approved_dealer()`, no admin policy, indexes on every policy and foreign-key column, explicit grants.

| Table | Purpose |
|---|---|
| `inventory_products` | A dealer's product/SKU: SKU, name, category, unit, cost price, selling price, reorder threshold, optional `listing_id` (the marketplace listing it feeds), active flag. Replaces `inventory` rows |
| `inventory_locations` | The dealer's own storage places (shop, godown, shelf); existing `dealer_stores` rows migrate here |
| `inventory_stock` | Quantity per product per location; never edited directly, only by movements |
| `inventory_movements` | The ledger: product, location, `direction` (in/out), `source` (the nine SRDS sources), quantity, quantity before and after, reason, actor, optional `order_id` / `order_item_id`, optional `purchase_id`, `created_at`. Unique on (`source`, `order_item_id`) for `ZARAILINK_ORDER`, so an order line is deducted once. Replaces `inventory_transactions` |
| `inventory_suppliers` | Internal suppliers; existing `suppliers` migrate here |
| `inventory_purchases` + `inventory_purchase_items` | Purchase/restock records; receiving one writes PURCHASE or RESTOCK movements |
| `inventory_alert_settings` | Per-dealer and per-product thresholds and alert preferences |
| `inventory_sync_log` | One row per processed dispatch event: status (applied, skipped-duplicate, failed), error, attempts; the dealer sees it |

Stock changes happen only through `SECURITY DEFINER` functions (`set search_path = public, pg_temp`) that lock the
stock row, check the quantity, write the movement and update the stock in one transaction: `record_movement`,
`transfer_stock`, `receive_purchase`, `apply_order_dispatch`. Clients get no direct write grant on
`inventory_stock` or `inventory_movements`.

## 3. Phases

Lanes in one phase run in parallel; "needs" names what must exist first. Every lane ends with its tests green and
evidence; the phase ends with the integration checkpoint (database → API → contract → app) and a `zl-verifier`
sign-off with fresh context.

### B0 — Inventory boundary

**Goal:** only approved dealers reach inventory data, and the admin reaches none of it. Plan mode first (RLS).

| Lane | Tasks | Needs |
|---|---|---|
| `zl-db` | Remove the admin branch from every inventory, store, supplier and movement SELECT policy; add `is_approved_dealer()` to every inventory policy; pgTAP: dealer A vs dealer B, pending vs approved dealer, admin refused | A3 contract |
| `zl-admin` | Remove any admin screen, query or analytics that reads inventory data | — |
| `zl-backend-core` | `require_approved_dealer` on every inventory route (built as `require_dealer`, which admits only an approved dealer through `get_current_user` since A3a) | A3 contract |

**Exit:** two-dealer, pending-dealer and admin proofs through API and PostgREST; policy mutation 0 survivors.

**B0 status (2026-10-05): built with A4, waiting for verification and merge.**
`20261019090000_inventory_boundary.sql` replaces the four read policies with owner-and-approved ones and no admin
branch. pgTAP `20261019090000_inventory_boundary`: the owner reads; another dealer, a farmer, the admin (aal1 and
aal2), a pending and a rejected dealer read nothing; a suspended dealer still reads their own (suspended users read,
never write). `test_a_pending_dealer_and_the_admin_reach_no_inventory_data` proves both doors; policy mutation reports
0 survivors. No admin route, screen or analytics read inventory, so `zl-admin` had nothing to remove.

### B1 — Inventory data model

> **Status (2026-10-11): done.** Migration `20261021080000_inventory_data_model.sql` (plus `20261025080000_numeric_nan_guards.sql` from the verifier's findings); pgTAP `20261021080000_inventory_data_model` (122 assertions) passes; reset rebuilds from migrations; the reconciliation identity holds on the scripted scenario; a fresh-context verifier found a High (NaN quantities) and four lesser issues, all fixed and tested. Decisions: the listing holds the product link (`listings.inventory_product_id`), dispatch draws from the default location, an opening-balance OTHER movement fills gaps in carried-over history.

**Goal:** the tables and functions in §2, with the existing data carried over. Plan mode first (migrations).

| Lane | Tasks | Needs |
|---|---|---|
| `zl-db` | Migrations for §2, and `listings.inventory_product_id` (moved here from A4: it points at `inventory_products`); data migration (`inventory` → products + stock at a default location per dealer; `dealer_stores` → locations; `suppliers` → inventory suppliers; `inventory_transactions` → movements with a mapped source); stock functions; pgTAP for each function (quantity checks, locking, one ledger row per change, before/after correct), and for the uniqueness that makes dispatch idempotent | B0 |
| `zl-inventory-api` | Pydantic schemas and repository skeleton against the new tables (no routes yet), so B2 lanes can start | `zl-db` table definitions agreed |

**Exit:** `supabase db reset` rebuilds everything from migrations; reconciliation identity holds on a scripted
scenario (restock + local sale + adjustment + damage = current stock).

### B2 — Inventory API

> **Status (2026-10-11): done.** Every B2 endpoint tested: unit (`backend/tests/inventory/`, 341) and real stack with two dealers (`test_smoke_inventory_api.py`, `test_smoke_inventory_isolation.py`, `test_smoke_inventory_races.py`); the authorization matrix covers every route. The tests found five defects (empty unit, an inactive default location, silent rounding of movements and purchase lines, a refused purchase leaving a draft), all fixed. The fresh-context verifier first returned NOT VERIFIED: concurrent purchase edits duplicated lines and receiving then multiplied stock. Fixed in the database with locked definer functions (`20261025090000_purchase_atomic_writes.sql`), plus guards for the default location, the 1000-row cap, idempotency keys on movements and purchase create, and length and date caps. Re-verification: VERIFIED WITH FINDINGS, its Lows fixed. Returns have no SRDS source, so a customer return is a Stock In with a reason.

**Goal:** `backend/app/inventory/` covers every SRDS §17 capability, approved dealers only, own data only.

The inventory API splits into sub-lanes by feature; each sub-lane owns its own router and service files inside
`backend/app/inventory/` (`products.py`, `stock.py`, ...), and `zl-inventory-api` owns the package's `__init__`
and router registration.

| Sub-lane | Endpoints | Needs |
|---|---|---|
| products | products/SKUs CRUD, link to a marketplace listing the dealer owns | B1 |
| stock and locations | stock by product and location; locations CRUD; transfer between locations | B1 |
| movements | movement history with filters (source, product, location, dates); Stock In, Stock Out (local sale, damage, expiry, own use), Adjustment with reason | B1 |
| suppliers and purchases | suppliers CRUD; purchase/restock records; receive a purchase into stock | B1 |
| alerts and settings | low-stock and out-of-stock lists; thresholds; alert preferences | B1 |
| dashboard | totals (products, stock units, low, out, value), recent movements, adjustments, restocks, alerts, trends (SRDS §18) | movements |

**Exit:** real-stack tests for each endpoint with two dealers; the OpenAPI document and client regenerated.

### B3 — Marketplace synchronisation

> **Status (2026-10-12): done.** pgTAP `20261022090000_inventory_sync` (and the eight files the dropped legacy tables broke, repaired); unit and real-stack (`test_smoke_inventory_sync.py`, `test_smoke_dispatch.py`, `test_smoke_listing_inventory_link.py`, `test_smoke_checkout_stock.py`). Testing fixed: D6 summed per product and per unlinked listing and net of owed lines; a dealer with no location dispatches with lines pending; retry rotation; the sync log names order, line and listing. The fresh-context verifier returned NOT VERIFIED (owed lines ignored, an IMS hang broke checkout and dispatch, exact stock readable by any signed-in user); all fixed. Round 2 found on the emulator that the shared picker drew no options (FlashList measured zero inside the sheet), so a dealer could not link a listing; fixed with the keyboard and cart-ownership issues it surfaced. Final re-verification: VERIFIED WITH FINDINGS (N4 the trade-off below; N5, the sync log screen naming its order, deferred to B4). Emulator walk: link in Edit Listing → buyer sees the word only → checkout → dispatch → the sync log shows the applied line → the next account's cart is empty.

> **D6/D7 trade-off (recorded 2026-10-12, B3 verifier).** D6 refuses a dispatch only for a shortage the IMS can read. When the IMS stock is locked past the bound (2 s for a table lock, under the 8 s statement timeout for a row lock), the stock is unknown, so the dispatch goes through (D7: the marketplace never breaks) and its linked lines are logged pending, counted as owed by availability and later dispatches, and applied by the dealer's retry. No client can take such a lock (MAINTAIN is revoked, PostgREST has no LOCK), so only maintenance or DDL can open this window.

**Goal:** SRDS §19–§21, §48, §53.14–§53.15, §53.39 (D5–D8).

| Lane | Tasks | Needs |
|---|---|---|
| `zl-db` | `apply_order_dispatch(event)`: finds the dealer's product linked to the listing, deducts in one transaction, writes a `ZARAILINK_ORDER` movement with the order id; a replay is a no-op (`skipped-duplicate`); failures recorded in `inventory_sync_log`; trigger or worker that picks up new `order_events` | A4 contract |
| `zl-inventory-api` | Sync worker endpoint/job with retries; `listing_availability(listing_ids)` (in, low, out, unknown; timeout → unknown); dispatch pre-check used by `zl-commerce` for the D6 shortage block | A4 contract |
| `zl-commerce` | Switch the marketplace's availability and dispatch pre-check to the IMS contract; show `unknown` when the IMS does not answer; dealer listing form links an inventory product | contract |

**Exit:** tests prove: dispatch deducts once; replaying the event, double-clicking Dispatch and two concurrent
dispatches deduct once; cancelling before dispatch deducts nothing; IMS unavailable → marketplace browses and
orders, the event stays pending, and is applied on recovery; every deduction has a movement with the order id.

### B4 — IMS app

**Goal:** the separate inventory application (SRDS §16–§18) in `frontend/inventory/`.

| Sub-lane (`zl-inventory-app`) | Screens | Needs |
|---|---|---|
| shell | Own root navigator and header (IMS name, business, location switcher), own navigation (Dashboard, Products, Stock, Reports, More), alert centre, "Back to ZaraiLink" | A2 shell slot |
| dashboard | SRDS §18 figures, trend chart, recent movements/adjustments/restocks, alerts, marketplace sync panel | B2 dashboard |
| products and stock | Product list, detail (stock by location, movement history, linked listing), add/edit; stock by location | B2 |
| operations | Stock In, Stock Out, Adjustment, Transfer forms (quantity stepper, source, reason) | B2 |
| suppliers and purchases | Suppliers; purchase/restock records; receive into stock | B2 |
| alerts and settings | Low-stock list, thresholds, preferences, activity history | B2 |
| `zl-dealer` | "Inventory Management — Open Inventory System" tile on the dealer dashboard, approved dealers only | contract "Inventory entry" |

**Exit:** every IMS flow runs on the emulator against the real API; offline reads come from cache and writes fail
clearly; an unapproved dealer never sees the tile or reaches a screen.

### B5 — Reports, analytics and reconciliation

| Lane | Tasks | Needs |
|---|---|---|
| `zl-inventory-api` | Reports: stock summary, valuation (cost), movements by source, low and out of stock, supplier purchases, marketplace vs local sales; reconciliation per product (§25); analytics (trends, fast/slow movers, best sellers); CSV export generated server-side and delivered through a signed Storage URL (nothing written to git) | B2, B3 |
| `zl-inventory-app` | Reports with date ranges, charts and tables; reconciliation screen highlighting differences; export and share | API lane |

**Exit:** the reconciliation identity holds for every product in a scripted month of activity; exports open.

### B6 — IMS verification and release

| Lane | Tasks |
|---|---|
| `zl-verifier` | Fresh-context attack: dealer A reaching dealer B's data, a pending dealer, the admin, replayed and concurrent dispatch, IMS outage |
| `zl-devops` | Airplane-mode script extended to the IMS; release build check |
| `zl-orchestrator` | Feature register rows for every IMS capability; Field Manual update |

## 4. Integration checkpoints

As in Plan A: `zl-db` merges first (`db reset`, `test db`, policy mutation), then the API lanes (backend suite with
the real stack), then `zl-backend-core` regenerates the contract, then the app lanes (Jest `--ci --runInBand`, lint,
typecheck, reality gate, emulator), then `zl-verifier`.
