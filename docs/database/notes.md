# Database notes (hand-written)

Why the schema is shaped the way it is: what each table is for, the business rules behind the design, and gotchas.
The structure itself (columns, indexes, policies, grants, triggers) is generated: see [schema.md](schema.md), which
is rebuilt from the live database by `scripts/gen_schema_docs.py` and checked in CI.

This file predates the generator and still holds the original hand-maintained tables; where a detail here disagrees
with schema.md, schema.md is right.

Source of truth: `supabase/migrations/`. This file is a human-readable summary, kept in sync
alongside each migration — update it in the same commit that adds/changes a table.

## Tables

| Table | Purpose | Key columns | RLS |
|---|---|---|---|
| `profiles` | One row per `auth.users` user, created automatically by the `on_auth_user_created` trigger | `id` (= auth user id), `role`, `full_name`, `phone` (E.164, entered as a single free-text field client-side since `phone_codes` was dropped — §6.2 revision, Phase 0.5b), `avatar_url`, `location` (legacy display string), `country`/`province`/`city`/`village`/`street` (free text, no reference-table FKs — §6.2 revision, Phase 0.5b), `is_suspended`, `notifications_enabled` (default `true`) | Read own row or admin reads all; update own row or admin; `role` is trigger-guarded — only admin may change it |

| `categories` | Produce/product categories | `name`, `slug`, `icon` | Public read; admin write |
| `listings` | Farmer/dealer produce listings | `owner_id`, `category_id`, `title`, `price`, `unit`, `quantity`, `images[]`, `status`, `crop_compatibility[]`, `brand`, `condition`, `location`, `seller_role` (auto-set from owner's profile) | Public read of `active` listings (+ owner sees own of any status); owner-only write |
| `orders` | Buyer ↔ seller orders | `buyer_id`, `seller_id`, `status`, `product_subtotal`, `delivery_charge`, `total` (generated: subtotal + delivery, BR-09) | Participants-only read/update; buyer-only insert |
| `order_items` | Line items on an order | `order_id`, `listing_id`, `quantity`, `unit_price` | Participants-only read; buyer-only insert |
| `order_status_history` | Status transition log for an order | `order_id`, `from_status`, `to_status`, `changed_by` | Participants-only read/insert |
| `conversations` | 1:1 message threads | `participant_one`, `participant_two` | Participants-only |
| `messages` | Messages within a conversation | `conversation_id`, `sender_id`, `body`, `attachments` (storage paths, §18), `read_at` | Participants-only |
| `crops` | Reference list of crop types | `name`, `category` | Public read; admin write |
| `farms` | A farmer's farms | `owner_id`, `name`, `location`, `area`, `land_unit`, `notes` | Owner-only (+ admin) |
| `farm_crops` | Crops planted on a farm | `farm_id`, `crop_id`, `variety`, `planting_date`, `area`, `expected_harvest_date`, `growth_stage` | Scoped via parent farm's owner (+ admin) |
| `farmer_profiles` | Farmer-only agricultural profile blurb (§8.1) | `id` (= profile id), `experience`, `agricultural_info` | Owner-only (+ admin) — same satellite-table pattern as `experts` |
| `dealer_stores` | A dealer's store locations | `dealer_id`, `name`, `address`, `location`, `status` | Owner (dealer) read/write; admin read-only |
| `suppliers` | A dealer's suppliers | `dealer_id`, `name`, `contact`, `products_supplied`, `status` | Owner (dealer) read/write; admin read-only |
| `inventory` | Dealer stock levels | `dealer_id`, `listing_id`, `stock_quantity`, `unit`, `purchase_cost`, `selling_price`, `min_stock_threshold` | Owner (dealer) read/write; admin read-only — never farmers (BR-04) |
| `inventory_transactions` | Stock movement log | `inventory_id`, `type`, `quantity`, `actor`, `notes` | Scoped via parent inventory's dealer; admin read-only |
| `payments` | Standard (non-escrow) payment records | `order_id`, `buyer_id`, `amount`, `currency`, `method`, `provider`, `provider_transaction_ref`, `status` | Buyer/order-seller read; buyer-only insert; order-seller (or admin) may update, trigger-guarded to `status` only (BR-11: no escrow columns) |
| `payment_transactions` | Payment event log (manual confirmation/failure for now; provider webhooks once a real gateway lands) | `payment_id`, `event_type`, `payload` | Buyer and order-seller (via payment) read; order-seller (or admin) insert-only, append-only |
| `reviews` | Buyer reviews of a completed **order** or a resolved/closed **consultation** (§15's two review types) — `order_id` and `consultation_id` are both nullable but mutually exclusive (`reviews_exactly_one_subject` check: exactly one of the two must be set) | `order_id` (nullable, unique), `consultation_id` (nullable, unique), `listing_id`, `seller_id`, `buyer_id`, `rating`, `comment` | Public read; buyer may insert only for their own `completed` order (BR-07) or their own `resolved`/`closed` consultation; admin-only delete (moderation) |
| `orders` guards | (behaviour of `public.orders`, `order_items`, `payments`) | | `guard_orders_update` (BEFORE UPDATE, signed-in users only): only `status` can change; moves follow the API's graph and party rules (seller-only, buyer-only, either may cancel, admin settles disputes); the money columns and both parties never change after insert (BR-09). Inserts are guarded too: a new order is pending and unpriced, items take the listing's price and the subtotal is their sum (BR-09), a payment opens pending for exactly the order total (BR-11), and status history and payment events are written by triggers (no client INSERT). Confirming an order commits the seller's stock in the same statement. `consultations` has the same kind of guard (`guard_consultations_update`), and only a verified expert other than yourself can be requested |
| `experts` | Expert profile + verification state | `id` (= profile id), `qualifications`, `degree`, `experience`, `verification_status` | Public read of `approved`; owner read/write own row; `verification_status` change requires admin (trigger-enforced, BR-06) |
| `expert_specializations` | An expert's specialization tags | `expert_id`, `specialization` | Public read; owner (+ admin) write |
| `expert_verifications` | Verification application/decision history | `expert_id`, `document_url`, `reviewed_by`, `decision`, `decision_at` | Owner + admin read; owner insert; admin-only update |
| `consultations` | Expert consultation requests | `user_id`, `expert_id`, `subject`, `crop_id`, `farm_id`, `priority`, `status` | Requester/assigned expert (+ admin) |
| `consultation_messages` | Messages within a consultation | `consultation_id`, `sender_id`, `body`, `attachments[]` | Scoped via parent consultation's participants |
| `disease_cases` | Uploaded crop images for AI advisory | `user_id`, `crop_id`, `storage_path` (private bucket; API responses carry a signed URL, never the path — security fix C2) | Owner-only (+ admin) |
| `disease_predictions` | AI inference results for a case | `disease_case_id`, `predicted_disease`, `confidence_score`, `recommended_actions[]` | Owner (via case) read-only; written by backend AI service |
| `reports` | User reports for moderation | `reporter_id`, `target_type`, `target_id`, `reason`, `status`, `resolution_notes` | Reporter (+ admin) read; reporter insert; admin-only update |
| `notifications` | In-app notifications (§19, Module 13; see `docs/architecture/notifications.md`) | `user_id`, `type`, `payload`, `read` | Owner-only read/update; written only by triggers via `create_notification` (no client insert path exists) |
| `audit_logs` | Admin/system action log (BR-15) | `actor_id`, `action`, `target_entity`, `target_id`, `previous_state`, `new_state` | Admin-only, insert-only |
| `idempotency_keys` | `Idempotency-Key` claims for order checkout and payment initiation (P5; `common/idempotency.py`) | `user_id`, `key` (8 to 128 chars), `endpoint`, `request_hash`, `response_status`, `response_body`, `created_at`; unique on (`user_id`, `key`, `endpoint`) | Owner-only (`user_id = (select auth.uid())`); rows older than 24 h are swept on each new claim |
| `currencies` / `units` | Reference data, admin-curated | see §22 | Public read; admin write |

## Views

| View | Purpose | Columns | Access |
|---|---|---|---|
| `profiles_public` | `select id, full_name, avatar_url from profiles` — the "who is this" identity every cross-user embed in the backend actually needs (a listing's `owner`, a review's `buyer`, an order's `buyer`/`seller`, a conversation's participants, a consultation's `user`/`expert`, an expert's own `profile`). Found broken by the P5a smoke matrix: `profiles`' own RLS only ever lets a caller read their own row, so every one of those embeds silently returned `null` for anyone else. Deliberately **not** `security_invoker` — it runs with the view owner's privileges (the same way a table owner is already exempt from their own table's RLS), so it bypasses `profiles_select_own_or_admin` by design, for exactly these three columns and no others (`phone`/`location` stay behind the restrictive policy). | `id`, `full_name`, `avatar_url` | `grant select` to `authenticated` and `anon` (matching the existing public-read reviews/listings pattern) |

## Enums

- `user_role`: `farmer` · `buyer` · `dealer` · `expert` · `admin`
- `listing_status`: `active` · `inactive` · `sold`
- `order_status`: `pending` · `confirmed` · `processing` · `ready` · `completed` · `cancelled` · `rejected` · `payment_failed` · `disputed` · `refunded` · `expired` (see the stale-order rule note below)
- `inventory_transaction_type`: `addition` · `reduction` · `adjustment` · `sale` · `restock` · `correction`
- `payment_status`: `pending` · `processing` · `successful` · `failed` · `cancelled` · `refunded`
- `verification_status`: `pending` · `approved` · `rejected` · `suspended`
- `expert_specialization`: `crop_management` · `plant_diseases` · `pest_management` · `fertilizer_management` · `irrigation` · `soil_management` · `crop_nutrition` · `general_agriculture`
- `consultation_status`: `requested` · `accepted` · `in_progress` · `resolved` · `closed` · `rejected` · `cancelled` · `expired`
- `consultation_priority`: `low` · `medium` · `high`
- `report_target_type`: `product` · `user` · `review` · `message` · `expert` · `listing`
- `report_status`: `open` · `investigating` · `resolved` · `dismissed`

## Storage buckets

- `avatars` — public read, owner-only write/update/delete
- `listing-images` — public read, owner-only write/update/delete
- `message-attachments` — **private** (unlike the two above): a chat is between two people, not
  public, so this bucket has no public-read policy. Objects live at
  `${conversation_id}/${sender_id}/...`; both read and insert are scoped via
  `storage.foldername(name)` to the two participants of that conversation (Module 12). Client
  code resolves paths to short-lived signed URLs (`resolveAttachmentUrls`,
  `messagingService.ts`) rather than calling `getPublicUrl`
- `expert-documents` — **private**: verification documents are sensitive, readable only by the
  owning expert or admin (reviewing the application); owner-only write. Signed-URL minting for
  these moved server-side (`GET /api/v1/expert/admin/{expert_id}/document-url`, admin-only) rather
  than being a bucket-level policy alone — see [backend-architecture.md](../architecture/backend-architecture.md)
- `consultation-attachments` — **private**, same `storage.foldername` participant-scoping pattern
  as `message-attachments`: read/write limited to the consultation's requester, assigned expert,
  or admin
- `disease-images` — public read (so the backend's service-role inference call can fetch the
  image by its public URL without a signed-URL round trip); owner-scoped insert/update via the
  object's path prefix

## Relationships (ERD, textual)

```
auth.users 1─1 profiles
profiles 1─* listings (owner_id) ── categories 1─* listings (category_id)
profiles 1─* orders (buyer_id) ── profiles 1─* orders (seller_id)
orders 1─* order_items ── listings (listing_id, nullable)
orders 1─* order_status_history
profiles 1─* conversations (participant_one/two)
conversations 1─* messages ── profiles (sender_id)

profiles(farmer) 1─1 farmer_profiles
profiles(farmer) 1─* farms 1─* farm_crops ── crops
profiles(dealer) 1─* dealer_stores
profiles(dealer) 1─* suppliers
profiles(dealer) 1─* inventory ── listings (nullable)
inventory 1─* inventory_transactions

orders 1─1 payments 1─* payment_transactions
orders 1─0..1 reviews ── listings, profiles(seller/buyer)

profiles(expert) 1─1 experts 1─* expert_specializations
experts 1─* expert_verifications
profiles(user) 1─* consultations ── experts, crops, farms
consultations 1─* consultation_messages
consultations 1─0..1 reviews (mutually exclusive with the orders edge above — see reviews_exactly_one_subject)

profiles 1─* disease_cases ── crops
disease_cases 1─1 disease_predictions

profiles 1─* reports
profiles 1─* notifications
profiles 1─* audit_logs (actor_id)
```

## Notes

- `supabase/config.toml` has `api.auto_expose_new_tables` unset (the current not-auto-exposed
  default), so every table needs explicit `GRANT`s to `anon`/`authenticated` in addition to RLS
  policies — see the migration file.
- The `ensure_rls` event trigger auto-enables RLS on any new table; every table above ships its
  own policies rather than relying on that as the only safeguard.
- `public.is_admin()` is a `security definer` helper used by policies that need admin bypass,
  so admin checks don't recursively re-trigger RLS on `profiles`.
- BR-11 (no escrow): `payments`/`payment_transactions` intentionally have no held-balance or
  release-workflow columns — they mirror a standard provider transaction record only.
- BR-09 (delivery charge is explicit): `orders.total` is a generated column
  (`product_subtotal + delivery_charge`) — it can never be written directly, and the two parts
  can never be silently merged.
- Stale-order rule: `order_status` gained a terminal `expired` value (migration
  `20260901140000_order_expiry_status.sql`). Applied lazily, not by a scheduler (none exists in
  this stack) — a `pending` order older than 48h flips to `expired` the next time either party
  reads their orders, reusing the existing `notify_order_status_changed` trigger to notify the
  other party for free.
- Free-text geography (Phase 0.5b): `countries`/`provinces`/`cities`/`phone_codes` were dropped
  entirely — they were seeded with only Pakistan, the literal "hardcoded" complaint. `profiles`'
  `country_id`/`province_id`/`city_id` FKs became plain `country`/`province`/`city` text columns;
  `farms`/`dealer_stores`/`listings`/`experts` already stored location as unconstrained `jsonb`,
  so only the shape written into them changed, not their schema. `currencies`/`units` stay
  exactly as they were — structurally independent, admin-curated, out of scope for this change.
- BR-03/BR-04 (dealer inventory boundary): `dealer_stores`/`suppliers`/`inventory`/
  `inventory_transactions` are scoped by `dealer_id = auth.uid()` in every policy, never by
  role alone, and no policy grants farmers access. See
  `docs/architecture/authorization-model.md` for the full resource-ownership matrix.
- Notifications (§19, Module 13): `public.create_notification(...)` is a `security definer`
  helper, but unlike `is_admin()`/`available_stock` it performs a *write* — so `EXECUTE` is
  revoked from `anon`/`authenticated`, and the 9 event trigger functions that call it are
  `security definer` themselves so the call still succeeds (as the function owner, not the
  invoking client). Full writeup in `docs/architecture/notifications.md`.
- Messaging vs. consultations (§16/§18, Module 12): `consultation_messages` is a deliberately
  separate table from the generic `messages`/`conversations` pair, not a workaround — a
  consultation is scoped to two specific roles (requester + assigned expert) with its own
  lifecycle (`consultation_status`), which the generic conversation model doesn't carry.
  `consultation_messages` was added to the `supabase_realtime` publication in
  `20260828080000_expert_module_extensions.sql`, alongside `messages`
  (`20260821000000_phase3_schema.sql`) — both get the same live-delivery treatment via
  `useRealtimeConsultationMessages`/`useRealtimeMessages`.
- BR-06 (expert verification): `experts.verification_status` can only change via a row that
  passes `public.is_admin()` in a `before update` trigger — RLS alone can't express
  column-level write restrictions cleanly, so this one rule is trigger-enforced.
- Payments (§14, Module 10): no real gateway sandbox is available yet, so `payments.status` is
  confirmed manually by the order's seller (cash/bank-transfer receipt) rather than by a
  provider webhook. `guard_payments_columns` (mirrors `guard_profiles_role`) restricts a
  non-admin update to the `status` column only — `amount`/`method`/`provider`/
  `provider_transaction_ref` stay fixed once the buyer creates the payment row. Swapping in a
  real gateway later only changes who calls `markPaymentReceived`/`markPaymentFailed`
  (`frontend/common/payments/services/paymentsService.ts`), not this schema.
- `public.available_stock(listing_ids uuid[])` — a `security definer` RPC (same bypass pattern
  as `is_admin()`) that lets any authenticated session look up available stock for a set of
  listings without being able to read `inventory` directly. Returns only `{listing_id,
  available}` — `available` is `inventory.stock_quantity` when a dealer inventory row is linked
  to the listing, else `listings.quantity`. Used by checkout's availability check (Module 9) so
  a buyer's stock re-validation doesn't require widening `inventory`'s owner-only RLS policy,
  which would otherwise leak `purchase_cost`/`selling_price`/`dealer_id` to every buyer.
