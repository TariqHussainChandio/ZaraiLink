# Authorization Model

Resource-ownership and business-rule authorization checks required by SRDS v4.0 §48 ("Each
protected endpoint shall verify: authentication, user status, role, resource ownership,
business-rule permissions") and the relevant business rules from §40. This is the reference
other modules implement against — it does not change enforcement by itself.

## Enforcement layers

1. **RLS policies** (`supabase/migrations/`, Module 4) are the source of truth. Every table
   read/written directly by the mobile client must have a policy that encodes the rule below,
   not just an application-level check.
2. **Backend mirror** (`backend/app/`, Module 19) re-implements the same rule wherever an
   endpoint uses the Supabase service-role key and therefore bypasses RLS — exactly **one** case
   today, disease inference (`disease_repository.py`); see backend-architecture.md's "Three
   Supabase client modes" section for why the three domains that might look like other
   candidates (audit logging, the notifications trigger domain, the `available_stock` checkout
   RPC) deliberately don't use it — each either already has RLS permission as the calling admin,
   or the elevation lives in a `security definer` Postgres function/trigger instead of the
   calling client. Payments is *not* one of these either — `payments_service`/
   `payments_repository` use the caller's own user-scoped client, so RLS still applies as normal;
   the backend there adds cross-row business-rule checks (only the order's seller may confirm/fail
   a payment) on top of RLS, not instead of it.
3. **Frontend guards** (route guards, conditional UI) are a UX convenience only — never the
   security boundary. A user who forges a request must still be stopped by (1) or (2).

## Ownership rules by resource

| Resource | Who may read | Who may write | Notes |
|---|---|---|---|
| `profiles` | Owner; admin (all) | Owner (own row only); admin (any row) | §6.2. `role` is trigger-guarded (`guard_profiles_role`): only admin may change it, even on your own row — RLS alone can't express column-level write restrictions, so this one is enforced in a `before update` trigger, same pattern as `experts.verification_status` (BR-06) |
| `listings` | Public (active only); owner; admin | Owner; admin | Farmer/Dealer only — buyers never write |
| `orders` / `order_items` | Buyer and seller on that order; admin | Buyer (create); seller (status transitions); admin | Status transitions validated server-side (BR-08) |
| `conversations` / `messages` | Participants only; admin | Participants only | |
| `dealer_stores` / `suppliers` / `inventory` / `inventory_transactions` | Owning dealer; admin (oversight) | Owning dealer only — **not** admin | **§48's explicit example: a dealer must not read or write another dealer's inventory/stores/suppliers merely by being authenticated as a dealer** — scope every query and policy by `dealer_id = auth.uid()`, never by role alone (BR-03). Admin write access was closed in `20260901090000_admin_write_scope_hardening.sql`: admin is moderation/oversight-only here (read), never a write path — the earlier `or public.is_admin()` on these tables' write policies meant any admin could silently write any dealer's data, which was never the intent. The companion fix in the same migration narrows `orders_service.update_order_status()` so a non-participant admin can only act to resolve a `disputed` order, never to confirm one (confirming reduces stock using the caller's own token). |
| `farms` / `farm_crops` | Owning farmer; admin | Owning farmer; admin | Never exposed to the dealer inventory module (BR-04) |
| `experts` / `expert_verifications` | Public (verified only); owning expert (own record); admin | Owning expert (profile fields); admin (verification status) | Only admin can move `verification_status` (BR-05, BR-06) |
| `consultations` / `consultation_messages` | Requesting user and assigned expert; admin | Requesting user (create); expert (accept/respond/close); admin | |
| `payments` / `payment_transactions` | Buyer on that order; seller (status only); admin | Server-side only, via backend business-rule checks — RLS still applies (user-scoped client, not service-role) | Client never writes payment status directly (BR-14) |
| `reviews` | Public | Buyer, and only for their own **completed** order (BR-07) | |
| `reports` | Reporter (own reports); admin | Reporter (create); admin (resolve) | |
| `notifications` | Owning user | System/server-side only | |
| `audit_logs` | Admin only | System/server-side only, insert-only | BR-15 |
| Reference data (`currencies`, `units`, `categories`) | Public | Admin only | §21.8. `countries`/`provinces`/`cities`/`phone_codes` were dropped (Phase 0.5b) — country/province/city/phone are now free text, not admin-curated reference rows |

## Suspension is a cross-cutting gate, not a per-resource rule

`profiles.is_suspended` blocks writes across every table above, not just `profiles` itself:
`public.is_suspended()` (mirroring `is_admin()`'s shape) is gated into every write policy's
ownership check across 24 tables (`20260901110000_rls_suspension_enforcement.sql`). A suspended
user can still read their own profile (so the app can render the suspension banner) but can't
write to farms, dealer_stores, orders, or anything else in the table above. The backend mirrors
the same check server-side (`core/auth.py`, 403 on a suspended token) — see
[backend-architecture.md](backend-architecture.md).

## Status

All resources in the table above have their policies written and enforced — this is no longer a
pending checklist. The table itself remains the reference other modules implement against, and
should be updated in the same commit as any policy change, not treated as a one-time snapshot.

## How the rules are enforced and tested (P5)

Role gates live in `require_role(...)` dependencies, and every route's requirement is recorded in
`backend/tests/integration/smoke/authorization_policy.json`. The authorization matrix probes each route as farmer,
buyer, dealer, expert, admin, anonymous and an admin without a second factor over real HTTP, and fails if a route's
declared roles differ from that reviewed file, so weakening a gate shows up as a failing test and a diff. Every
admin-reachable write must leave an `audit_logs` row (BR-15); a test enumerates those routes and fails on one with no
audit assertion.

The row-level-security layer itself is proven separately, in the database: `supabase/tests/database` (pgTAP) runs
allowed and rejected statements as each role against every policy and storage bucket, and
`scripts/db/policy_mutation.py` breaks each policy in turn to show a test notices. Policies call `auth.uid()` and the
`is_*` helpers wrapped as `(select ...)` so they are evaluated once per query, not once per row.

