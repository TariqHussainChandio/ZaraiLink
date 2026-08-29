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
   endpoint uses the Supabase service-role key and therefore bypasses RLS (e.g. payment
   verification, AI inference writes).
3. **Frontend guards** (route guards, conditional UI) are a UX convenience only — never the
   security boundary. A user who forges a request must still be stopped by (1) or (2).

## Ownership rules by resource

| Resource | Who may read | Who may write | Notes |
|---|---|---|---|
| `profiles` | Owner; admin (all) | Owner (own row only); admin (any row) | §6.2. `role` is trigger-guarded (`guard_profiles_role`): only admin may change it, even on your own row — RLS alone can't express column-level write restrictions, so this one is enforced in a `before update` trigger, same pattern as `experts.verification_status` (BR-06) |
| `listings` | Public (active only); owner; admin | Owner; admin | Farmer/Dealer only — buyers never write |
| `orders` / `order_items` | Buyer and seller on that order; admin | Buyer (create); seller (status transitions); admin | Status transitions validated server-side (BR-08) |
| `conversations` / `messages` | Participants only; admin | Participants only | |
| `dealer_stores` / `suppliers` / `inventory` / `inventory_transactions` | Owning dealer; admin | Owning dealer; admin | **§48's explicit example: a dealer must not read or write another dealer's inventory/stores/suppliers merely by being authenticated as a dealer** — scope every query and policy by `dealer_id = auth.uid()`, never by role alone (BR-03) |
| `farms` / `farm_crops` | Owning farmer; admin | Owning farmer; admin | Never exposed to the dealer inventory module (BR-04) |
| `experts` / `expert_verifications` | Public (verified only); owning expert (own record); admin | Owning expert (profile fields); admin (verification status) | Only admin can move `verification_status` (BR-05, BR-06) |
| `consultations` / `consultation_messages` | Requesting user and assigned expert; admin | Requesting user (create); expert (accept/respond/close); admin | |
| `payments` / `payment_transactions` | Buyer on that order; seller (status only); admin | Server-side only (backend, service-role) | Client never writes payment status directly (BR-14) |
| `reviews` | Public | Buyer, and only for their own **completed** order (BR-07) | |
| `reports` | Reporter (own reports); admin | Reporter (create); admin (resolve) | |
| `notifications` | Owning user | System/server-side only | |
| `audit_logs` | Admin only | System/server-side only, insert-only | BR-15 |
| Reference data (`countries`, `provinces`, `cities`, `phone_codes`, `currencies`, `units`, `categories`) | Public | Admin only | §21.8 |

## Status

Enforced today: `profiles`, `listings`, `orders`/`order_items`, `conversations`/`messages`
(Module 4 core schema — RLS policies written, **not yet pushed** to the linked Supabase
project). Everything else in the table above is pending the table/policy it depends on
(tracked per-resource in Module 4's checklist) — this document exists so those policies get
written against an agreed rule instead of being improvised per migration.
