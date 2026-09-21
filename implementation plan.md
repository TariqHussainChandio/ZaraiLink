# ZaraiLink — Implementation Plan

**Aligned to:** SRDS v4.0 (5-role ecosystem: Buyer, Farmer, Dealer, Expert, Admin — escrow
payment explicitly excluded; delivery charges handled as an explicit, non-custodial line item)

This plan turns the current scaffold (see repository structure under `src/`, `backend/`,
`supabase/`) into a working product that satisfies SRDS v4.0. It is organized into **modules
that map 1:1 onto existing or planned folders**, so each task has an obvious home in the
codebase. Modules are broken into small, independently completable tasks — most are sized to
be one commit / one PR.

Status legend: `[ ]` not started · `[~]` partially covered by existing scaffold · `[x]` done

**Hard constraints carried over from SRDS v4.0 (do not violate in any module):**
- No escrow wallets, held funds, or escrow-release workflows anywhere in the payment module (BR-11).
- Delivery charge is always a distinct line item (`product_subtotal + delivery_charge = total`), never folded into product price (BR-09).
- ZaraiLink owns no logistics infrastructure — no rider/vehicle/warehouse entities (BR-10).
- Dealer inventory is dealer/admin-only; farmers never get the inventory module (BR-03/BR-04).
- AI disease results are advisory only and must route to Expert consultation, never replace it (BR-13).
- Every admin/moderation action must be audit-logged (BR-15).

---

## How to use this plan

- Work top to bottom within a phase; modules inside the same phase can be parallelized
  across contributors since they touch different folders.
- Every task references the exact file(s)/folder(s) it belongs in, based on the existing
  `src/`, `backend/`, and `supabase/` layout (new folders are called out explicitly where
  SRDS v4.0 introduces a domain the current scaffold doesn't have yet, e.g. `payments/`,
  `experts/`, `disease/`, `reviews/`, `notifications/`, `reference-data/`).
- This file is a living document — check items off (`[x]`) as they land, and add tasks as
  scope is discovered. Keep tasks small; if a task grows past ~1 day of work, split it.
- This rewrite does not change any application code — it only reorganizes and expands the
  plan to match SRDS v4.0. Existing `[x]` items were verified against the current repo state.
- **Post-hoc note #1**: after this plan was last edited, a directory-restructure pass moved several
  folders referenced throughout (`components/{9 domains}` → `components/features/{9 domains}`,
  `services/{14 domains}` → `services/modules/{14 domains}`, `store/{auth,cart,marketplace,
  reference-data}/*` flattened to `store/*.ts`, `hooks/` split into `hooks/{realtime,api}/`,
  `navigation/*Navigator.tsx` → `navigation/stacks/`, `backend/app/api/*.py` → `api/v1/
  endpoints/*.py`, `backend/app/services/disease_inference.py` → `ai_engine.py`,
  `backend/app/ml/model.pth` → `ml/checkpoints/model.pth`, `backend/tests/test_*.py` →
  `tests/unit/`). Every path reference below was updated to match; the restructure changed no
  application logic and was verified with a full `pytest`/`tsc`/`eslint`/`jest` pass afterward.
- **Post-hoc note #2** (this update, cross-checked against the current repo — `git log`, `git
  diff`, live file contents — not re-derived from memory): a large wave of hardening and
  richness work landed since note #1, almost entirely in commit `e25772f` ("security hardening,
  business-logic fixes, UI/UX richness pass, and full frontend test coverage") plus a separate
  CI-verification pass (two merged PRs). Checkboxes below are updated per-module to reflect it.
  Headline items, all independently verified against current code/migrations in this pass:
  dealer-inventory admin write access closed to read-only, free-text country/city/phone
  replacing the four dropped reference tables, `is_suspended` now enforced in RLS (not just
  FastAPI), CORS allowlist + rate limiting, the three dead-tap interaction bugs fixed, an
  order-expiry rule and an atomic (row-locked) stock-adjustment fix, dark mode, camera capture,
  and frontend test coverage going from one smoke test to **734 tests across 132 suites**
  (backend: 112, up from 106). CI is now proven against real merged PRs, not just configured. A
  separate, currently **uncommitted** pass in the working tree right now reconciles 6
  documentation files against this new state (Module 23) and retrofits localization across 62
  of 64 screens (Module 5) — one real, newly-found gap survived that retrofit:
  `SellerDashboard.tsx` (the shared component Farmer's and Dealer's dashboards delegate to) has
  no translation calls at all.

---

## Phase overview

| Phase | Modules | Goal |
|---|---|---|
| 1 — Foundation | 1. Design System · 2. Navigation & App Shell · 3. Auth · 4. Database Schema · 5. Reference Data & Localization | App boots, users can sign up/in, role-based shell renders, geography/units come from data not hardcoding |
| 2 — Marketplace & Sellers | 6. Marketplace · 7. Farmer Module · 8. Dealer Module | Farmers/dealers can list and manage agricultural products; buyers can browse |
| 3 — Commerce | 9. Orders & Cart · 10. Payments · 11. Reviews & Ratings | Buyers can order, pay (no escrow), and review completed purchases |
| 4 — Engagement | 12. Messaging · 13. Notifications · 16. Role Dashboards & Analytics · 17. Profile & Settings | Users can talk to each other, stay informed, and manage their account |
| 5 — Advisory | 14. Expert Module · 15. AI Disease Advisory | Verified experts and AI-assisted crop advisory, wired together |
| 6 — Governance | 18. Admin Module · 20. Security & Audit Logging | Centralized platform governance, moderation, and traceability |
| 7 — Backend & Hardening | 19. FastAPI Backend Service · 21. Testing & QA · 22. CI/CD · 23. Documentation · 24. Production Readiness | Server-side logic that shouldn't live in the client, ship-ready quality bar |

---

## Module 1 — Design System & Theme
**Folders:** `src/theme/`, `src/components/ui/`, `src/constants/`
**Goal:** a single source of truth for colors/type/spacing and a small reusable primitive
library, plus the SRDS v4.0 master color system (brand palette + per-role accent colors),
so screens stop hand-rolling styles and the five roles stay visually distinguishable within
one unified brand.

- [x] Define color tokens (brand, semantic success/warning/error, neutrals) in `src/theme/colors.ts`
- [x] Reconcile `src/theme/colors.ts` against the SRDS v4.0 master palette — updated `semantic.*`
      to exact spec hex values, added `brand.primaryTint` (`#E8F5E9`), renamed
      `secondary`/`secondaryLight` to `secondary` (`#8D6E63` Earth Brown) + `accent`
      (`#F9A825` Golden Yellow, unused pre-change so no call-site impact), and added
      `background.default`/`background.surface`, `text.primary`/`text.secondary`, and
      `border` tokens. Existing `neutral.*` keys kept for the ~190 existing call sites;
      `gray50`/`gray200`/`gray500`/`gray900` were tuned to match the new background/border/
      text values so both naming schemes stay visually consistent
- [x] Add `src/theme/roleColors.ts` — per-role accent used only for badges/icons/dashboard
      indicators/status labels, never as a full alternate theme: Buyer `#1976D2`, Farmer
      `#2E7D32`, Dealer `#EF6C00`, Expert `#7B1FA2`, Admin `#374151`
- [x] Add `src/theme/moduleAccents.ts` — Marketplace `#2E7D32`, Dealer/Inventory `#EF6C00`,
      Buyer/Orders `#1976D2`, Expert/Consultation `#7B1FA2`, AI Disease Advisory `#00897B`,
      Payments `#43A047`, Messages `#1976D2`, Notifications `#F9A825`, Admin `#374151`
- [x] Add `src/theme/statusColors.ts` — Success/Completed `#43A047`, Pending `#FB8C00`,
      Processing `#1976D2`, Warning `#F57C00`, Rejected `#D32F2F`, Cancelled `#757575`,
      Failed `#C62828`, Verified `#2E7D32`, Under Review `#F9A825`, Suspended `#D32F2F`
- [x] Define type scale + font weights in `src/theme/typography.ts`
- [x] Define spacing/radius/shadow scale in `src/theme/spacing.ts`
- [x] Add light theme object composing the above; stub dark theme for later
- [x] `src/constants/roles.ts` — role enum (`farmer`, `buyer`, `dealer`, `expert`, `admin`)
- [x] `src/constants/routes.ts` — centralized screen/route name constants
- [x] Build `src/components/ui/Button.tsx` (primary/secondary/ghost/destructive variants)
- [x] Build `src/components/ui/Input.tsx` (text, with error/label state, integrates with react-hook-form)
- [x] Build `src/components/ui/Card.tsx`
- [x] Build `src/components/ui/Badge.tsx` (for order/listing/consultation/payment status pills — restyle on top of `statusColors.ts` once it lands)
- [x] Build `src/components/ui/Avatar.tsx`
- [x] Build `src/components/ui/EmptyState.tsx` and `src/components/ui/Spinner.tsx`
- [x] Build `src/components/ui/Sheet.tsx` for bottom sheets/dialogs
- [x] Build `src/components/ui/RoleBadge.tsx` — small pill using `roleColors.ts`, reused across marketplace (seller-role indicator), dashboards, admin user lists

## Module 2 — Navigation & App Shell
**Folders:** `src/navigation/`, `App.tsx`
**Depends on:** Module 3 (needs auth state to decide which stack to show)
**Goal:** a real, role-aware app shell covering all five roles' navigation trees from SRDS
v4.0 §34 (Buyer, Farmer, Dealer, Expert, Admin each get a distinct tab/stack set).

- [x] `src/navigation/stacks/RootNavigator.tsx` — now dispatches by role/status: `loading` → Splash, `suspended` → Suspended, unauthenticated → `AuthNavigator`, `expert` → `ExpertNavigator`, `admin` → `AdminNavigator`, else → `AppNavigator` (buyer/farmer/dealer)
- [x] `src/navigation/stacks/AuthNavigator.tsx` — stack for Login/Register/ForgotPassword
- [x] `src/navigation/stacks/AppNavigator.tsx` — shared bottom-tab shell for Buyer/Farmer/Dealer: Home, Marketplace, Orders, Consultations (buyer/farmer only — dealer's SRDS nav tree omits it), Messages, Profile
- [x] Per-role tab configs — Expert and Admin now get their own dedicated top-level navigators (see below) instead of a reduced version of the shared one; Home/Marketplace/Orders/Messages/Profile all render real screens (Modules 6/9/12/16/17), only the newly-added destinations below render `PlaceholderScreen` pending their owning module
- [x] Farmer tab/stack additions per SRDS §34: Dashboard/Marketplace/Orders/Messages/Profile as tabs (shared `AppNavigator`); Consultations as a tab; My Listings/Farms & Crops/Disease Advisory added as `HOME_ROUTES` stack screens in `HomeNavigator.tsx`, reachable via new Quick Actions on the farmer dashboard (`SellerDashboard.tsx`) — all three are placeholders pending Modules 7/15
- [x] Dealer tab/stack additions: Dashboard/Marketplace/Orders/Messages/Profile as tabs (no Consultations tab, matching its SRDS nav tree); Products/Inventory/Stores/Suppliers added as `HOME_ROUTES` stack screens, reachable via new Quick Actions on the dealer dashboard (`SellerDashboard.tsx`) — placeholders pending Module 8
- [x] Expert tab/stack: `src/navigation/stacks/ExpertNavigator.tsx` — dedicated bottom-tab navigator (Dashboard, Consultations, Messages, Notifications, Profile), deliberately no Marketplace/Orders tabs; Consultations and Notifications are placeholder stacks pending Modules 14/13
- [x] Admin tab/stack additions: `src/navigation/stacks/AdminNavigator.tsx` — dedicated bottom-tab navigator (Home, Profile); Home hosts a stack with Dashboard + Users/Listing Moderation (real, existing screens) + Expert Verification/Orders/Reports/Categories/Reference Data/Audit Logs (placeholders pending Module 18), all reachable via Quick Actions added to `AdminDashboardScreen.tsx`; Settings is covered by the existing Profile tab
- [x] Buyer tab additions: Consultations tab added to `AppNavigator.tsx`, plus a "Consult an Expert" Quick Action on `BuyerDashboardScreen.tsx`
- [x] Register `src/navigation/PaymentsNavigator.tsx` — stack shell for PaymentMethod/PaymentProcessing/PaymentResult (all placeholders). **Not yet wired to `CheckoutScreen`** — `checkout()` has no payment step to hand off to yet (Module 10 dependency), so wiring it in now would change today's working checkout flow's behavior rather than just extend the shell; Module 10 connects it once real payment initiation exists
- [x] Register `src/navigation/stacks/ExpertNavigator.tsx` and `src/navigation/stacks/AdminNavigator.tsx` stacks referenced by the new tab configs above
- [x] Splash/bootstrap screen shown while the initial session check resolves
- [x] Wire `App.tsx` to render `RootNavigator` inside `NavigationContainer` (retire the current smoke-test body)
- [x] Deep-link config stub (`linking.ts`) even if unused initially

## Module 3 — Authentication & Authorization
**Folders:** `src/screens/auth/`, `src/services/modules/auth/`, `src/store/` (`authStore.ts`)
**Depends on:** Module 4 (`profiles` table must exist)
**Goal:** email/password auth with role selection, session persistence, and route guarding
enforced on both frontend and backend (SRDS §6.1, §31).

- [x] `src/services/modules/auth/authService.ts` — `signUp`, `signIn`, `signOut`, `resetPassword`, wraps `supabase.auth`
- [~] `src/services/modules/auth/session.ts` — folded into `authStore.initialize()` instead of a separate file; subscribes to `supabase.auth.onAuthStateChange`
- [x] `src/store/authStore.ts` — Zustand store: `session`, `user`, `role`, `status` (loading/authenticated/unauthenticated)
- [x] Persist session token via `@react-native-async-storage/async-storage` (Supabase client storage adapter)
- [x] `src/screens/auth/LoginScreen.tsx` (react-hook-form + zod validation)
- [x] `src/screens/auth/RegisterScreen.tsx` (includes role selection)
- [x] `src/screens/auth/ForgotPasswordScreen.tsx`
- [~] `src/screens/auth/VerifyOtpScreen.tsx` — built and wired up (`verifySignupOtp`/`resendSignupOtp` in `authService.ts`); **not yet end-to-end** because the linked project is on the free-tier default email provider, which rejects all email template customization, so the confirmation email still contains a link, not the code this screen expects. Needs custom SMTP (e.g. Resend/Brevo) to finish
- [x] Route guard: redirect unauthenticated users to Auth stack; redirect by role after login
- [x] Resource-ownership + business-rule authorization checks documented per SRDS §48 (a dealer must not modify another dealer's inventory, etc.) in `docs/architecture/authorization-model.md` — a reference table of who-may-read/write per resource, to be enforced primarily via RLS (Module 4) and mirrored in `backend/` (Module 19) once endpoints exist that bypass RLS with the service-role key

## Module 4 — Database Schema (Supabase)
**Folders:** `supabase/migrations/`
**Goal:** every entity from SRDS §28 behind the existing `ensure_rls` guardrail trigger, each
with RLS policies. Grouped by domain; existing tables are marked done, everything else is new.

**Core (done):**
- [x] `profiles` table (id → `auth.users`, `role`, `full_name`, `phone`, `avatar_url`, `location`, `is_suspended`) + RLS: user can read/update own row, admins can read/write all — `20260820000000_core_schema.sql` + `20260821000000_phase3_schema.sql` (`is_suspended`); `role` additionally trigger-guarded as of `20260822085900_profiles_role_guard.sql`. **Confirmed live** on the linked project (`supabase migration list` showed these as already applied when Module 4 started)
- [x] `categories` table + RLS: public read, admin write
- [x] `listings` table (owner_id, category_id, title, description, price, unit, quantity, images[], status) + RLS: public read of active listings, owner-only write
- [x] `orders` table (buyer_id, seller_id, status, total, created_at) + `order_items` table + RLS: participants-only read/write
- [x] `conversations` and `messages` tables + RLS: participants-only access
- [x] Storage buckets: `avatars` (public read) and `listing-images` (public read, owner write)

**Security fix found during this module (not a pre-planned checklist item):**
- [x] `profiles_update_own_or_admin` (Module 3's RLS) let any user change their own `role` column directly — a buyer could self-promote to admin with a plain client update. Fixed in `20260822085900_profiles_role_guard.sql` with a `before update` trigger (`guard_profiles_role`) that rejects any `role` change not made by an admin. Same pattern used below for `experts.verification_status` (BR-06)

**Marketplace extensions (§7.2, BR-09) — `20260822090000_marketplace_and_order_lifecycle.sql`:**
- [x] Extend `listings`: `crop_compatibility text[]`, `brand text`, `condition text`, `location jsonb`, `seller_role` (auto-populated from the owner's profile via a `before insert` trigger, so `listingsService.createListing` didn't need to change)
- [x] Extend `orders`: renamed `total` → `product_subtotal`, added `delivery_charge numeric not null default 0`, added `total numeric generated always as (product_subtotal + delivery_charge) stored` — enforces BR-09 at the schema level (verified: a direct `insert ... total` is rejected by Postgres with "column total is a generated column"); `ordersService.checkout()` updated to insert `product_subtotal` instead of `total`, `types/orders.ts`/`StatusBadge.tsx`/`OrderDetailScreen.tsx`/buyer dashboard updated for the rename
- [x] Added `order_status_history` table (order_id, from_status, to_status, changed_by, timestamp) — backs SRDS §12.2 lifecycle auditability (not yet written to by `ordersService`; that wiring is Module 9)
- [x] Widened `order_status` enum to the full lifecycle (`fulfilled` renamed to `completed` to match SRDS vocabulary, plus `processing, ready, rejected, payment_failed, disputed, refunded` added); `ALLOWED_TRANSITIONS` in `ordersService.ts` keeps today's behavior (pending→confirmed→completed/cancelled) with the new statuses present but not yet reachable from any UI — full transition design is Module 9's job

**Farmer domain (§8) — `20260822090100_farmer_domain.sql`:**
- [x] `farms` table (owner_id, name, location, area, land_unit, notes)
- [x] `farm_crops` table (farm_id, crop_id, variety, planting_date, area, expected_harvest_date, growth_stage, notes)
- [x] `crops` reference table (name unique, category) — seeded with 12 common crop types in `supabase/seed.sql`

**Dealer domain (§9, BR-03/BR-04) — `20260822090200_dealer_domain.sql`:**
- [x] `dealer_stores` table (dealer_id, name, address, location, contact, opening_info, status)
- [x] `suppliers` table (dealer_id, name, contact, products_supplied, notes, status)
- [x] `inventory` table (dealer_id, listing_id, stock_quantity, unit, purchase_cost, selling_price, min_stock_threshold)
- [x] `inventory_transactions` table (inventory_id, type: addition/reduction/adjustment/sale/restock/correction, quantity, actor, notes, timestamp)
- [x] Every policy scoped by `dealer_id = auth.uid()` (never role alone) — this is the concrete §48 example from `docs/architecture/authorization-model.md`; **behaviorally verified** in a throwaway local Postgres container: a second dealer can neither see nor update another dealer's `inventory` row (0 rows returned/affected)

**Payments (§14, BR-11/BR-12/BR-14 — no escrow tables of any kind) — `20260822090300_payments.sql`:**
- [x] `payments` table (order_id, buyer_id, amount, currency default `PKR`, method, provider, provider_transaction_ref, status, created_at) — status enum: `pending, processing, successful, failed, cancelled, refunded`; no `held_amount`/`release_status`/escrow-shaped columns
- [x] `payment_transactions` table for provider webhook/event log (append-only; select-only for the client, written by the future backend service-role — Module 19)

**Reviews (§15, BR-07) — `20260822090400_reviews.sql`:**
- [x] `reviews` table (order_id unique, listing_id, seller_id, buyer_id, rating, comment, created_at) + RLS: buyer can only insert a review for their own `completed` order; public read; admin-only delete — **behaviorally verified**: reviewing a `pending` order is rejected by RLS, the same insert succeeds once the order is `completed`

**Expert domain (§16, BR-05/BR-06) — `20260822090500_expert_domain.sql`:**
- [x] `experts` table (id = profile id, qualifications, degree, experience, professional_description, location, contact, verification_status)
- [x] `expert_specializations` table (expert_id, specialization) — crop management/plant diseases/pest management/fertilizer/irrigation/soil/nutrition/general
- [x] `expert_verifications` table (expert_id, document_url, reviewed_by, decision, decision_at, notes)
- [x] `consultations` table (user_id, expert_id, subject, crop_id, problem_description, farm_id nullable, images[], priority, status, created_at) — status: `requested, accepted, in_progress, resolved, closed, rejected, cancelled, expired`
- [x] `consultation_messages` table (consultation_id, sender_id, body, attachments[], created_at)
- [x] `verification_status` can only be changed by an admin, enforced by a `before update` trigger (`guard_experts_verification_status`) — RLS alone can't express column-level write restrictions; **behaviorally verified**: an expert self-approving is rejected, the same update succeeds when run as admin

**AI Disease Advisory (§17) — `20260822090600_disease_advisory.sql`:**
- [x] `disease_cases` table (user_id, crop_id, image_url, created_at)
- [x] `disease_predictions` table (disease_case_id, predicted_disease, confidence_score, description, recommended_actions[], model_version) — select-only for the client; written by the future backend AI service (Module 19)

**Reports & Moderation (§21.6) and Notifications (§19) and Audit Logs (§21.9, BR-15) — `20260822090700_governance.sql`:**
- [x] `reports` table (reporter_id, target_type: product/user/review/message/expert/listing, target_id, reason, status, resolution_notes, resolved_by, resolved_at)
- [x] `notifications` table (user_id, type, payload jsonb, read boolean, created_at) + RLS: user reads/updates own only
- [x] `audit_logs` table (actor_id, action, target_entity, target_id, previous_state jsonb, new_state jsonb, metadata jsonb, created_at) — insert-only, admin-only read/insert (client-side admin actions can write directly for now since Module 19's backend doesn't exist yet)

**Reference Data (§22) — `20260822090800_reference_data.sql`:**
- [x] `countries`, `provinces`, `cities` tables (hierarchical geography, unique-constrained for idempotent seeding)
- [x] `phone_codes` table (country_id unique, calling_code)
- [x] `currencies` table (code, symbol, name)
- [x] `units` table (code, label, applies_to: weight/area/volume/quantity)
- [x] Seeded in `supabase/seed.sql`: Pakistan + its 7 provinces/territories + 13 major cities + `+92` phone code + `PKR` currency + 10 common units — a minimal real baseline for Module 5's pickers rather than empty tables

**Ongoing:**
- [~] Seed script (`supabase/seed.sql`) — categories, crops, and reference data all seeded (idempotent — re-running is a no-op, verified locally); demo users still documented as out-of-scope for plain SQL seeding (must go through the auth service)
- [x] `docs/database/` ERD/table reference kept in sync — `docs/database/schema.md` rewritten to cover every table/enum above, plus a Notes section cross-referencing BR-09/BR-11/BR-03/BR-04/BR-06

**Function hardening (found via Supabase's own security advisor, post-push) — `20260822091000_function_search_path_hardening.sql`:**
- [x] Pinned `search_path` on `set_updated_at`, `set_listings_seller_role`, `guard_profiles_role`, `guard_experts_verification_status` (all `SECURITY DEFINER`-adjacent trigger functions) — closes a schema-shadowing attack vector the advisor flagged (`function_search_path_mutable`). Re-ran the advisor after pushing: all 4 warnings gone, guard-trigger behavior regression-tested unaffected. Remaining advisor warnings (`is_admin`/`handle_new_user`/`rls_auto_enable` RPC-exposure, Auth leaked-password-protection, MFA options) are pre-existing/benign or already tracked in Module 24 — see the migration file's header comment for why each was left as-is

**Validation:** all 14 migration files (existing + new) and `seed.sql` were applied end-to-end against a throwaway local Supabase Postgres container (not the linked project) each time, per the standing rule in memory (`feedback_supabase_migration_workflow`) — clean runs, zero errors, seed confirmed idempotent. The dealer-isolation, role-escalation, expert-verification, generated-`total`, and completed-order-review guarantees above were each exercised directly (not just read over) before being marked done, and re-verified after the search_path hardening pass.

**Pushed to the live linked Supabase project** (`ZaraiLink`, ref `uqcxwshlxvmoovjpizlf`) — `supabase db push` applied cleanly, `seed.sql` applied via `supabase db query --linked`, row counts verified on the remote project (8 categories, 12 crops, 1 country, 7 provinces, 13 cities, 1 currency, 1 phone code, 10 units). The Module 3 core schema (`profiles`/`categories`/`listings`/`orders`/`conversations`/`messages`) turned out to already be live from an earlier push — the "not yet pushed" notes on those items above are now stale.

**Post-hoc note #2 additions — hardening, business-logic fixes, and a scope reduction (7 new migrations, all committed, all confirmed present in the current migration set):**
- [x] `20260901080000_disease_images_bucket.sql` — new public `disease-images` Storage bucket for the AI disease advisory flow (Module 15 dependency)
- [x] `20260901090000_admin_write_scope_hardening.sql` — closed a real over-privilege gap: admin previously had full write access (not just read) to `dealer_stores`/`suppliers`/`inventory`/`inventory_transactions` via `or public.is_admin()` on every write policy, and a companion gap in `orders_service.update_order_status()` let a non-participant admin confirming a pending order actually reduce that dealer's stock using the admin's own token. Both closed together: admin is read-only oversight on these four tables now, and the order-status endpoint only lets a non-participant admin act to resolve a `disputed` order, never confirm one
- [x] `20260901100000_freetext_location_and_phone.sql` — **scope reduction, user-directed**: dropped `countries`/`provinces`/`cities`/`phone_codes` entirely (they were seeded with only Pakistan — the literal "hardcoded" complaint this plan's Module 5 was trying to solve, solved differently than originally planned). `profiles.country_id`/`province_id`/`city_id` became plain free-text `country`/`province`/`city` columns; `farms`/`dealer_stores`/`listings`/`experts` already stored location as unconstrained `jsonb`, so only the shape written into them changed. `currencies`/`units` are unaffected — structurally independent, admin-curated, out of scope for this change. `LocationPicker.tsx`/`PhoneInput.tsx` (Module 5) were correspondingly simplified to plain text inputs.
- [x] `20260901110000_rls_suspension_enforcement.sql` — closed the long-standing, self-documented `is_suspended`-not-in-RLS gap (originally flagged in `phase3_schema.sql`'s own comment, unclosed for 28 migrations): a new `public.is_suspended()` helper is gated into every write policy's ownership check across 24 tables. Reads and the admin-bypass branch are untouched.
- [x] `20260901120000_search_path_and_listing_views_fix.sql` — two independent gaps in one batch: `guard_messages_updates()` was missing the `search_path` pin every sibling guard-trigger function has (retrofitted); `listing_views`'s INSERT policy didn't exclude the listing's own owner, so self-view-count inflation was enforced client-side only (fixed at the RLS layer).
- [x] `20260901130000_atomic_stock_adjustment.sql` — found and fixed a real concurrency bug: the order-confirmation stock decrement was a read-then-compute-then-write sequence across two separate PostgREST round-trips with no lock, so two concurrent confirmations against the same inventory row could each pass a `>= 0` check independently and jointly oversell stock. Replaced with `select ... for update`-based `adjust_stock`/`reduce_stock_for_order` Postgres functions.
- [x] `20260901140000_order_expiry_status.sql` — added a terminal `expired` value to `order_status` for the "a pending order the seller never confirms should auto-expire" business rule; applied lazily (no scheduler exists in this stack) by `orders_service._expire_stale_pending_orders` on every order list/detail read, using a 48-hour threshold.
- [x] `20260901150000_profile_notification_preferences.sql` — backs the Settings screen's previously-unpersisted notification toggle with a real `profiles.notifications_enabled boolean not null default true` column.

Table count is now **32** (down from 36) and migration count is now **35** (up from 28) after these additions and the geography-table drop. All 7 were Docker-validated per the standing workflow before being described as done here; not independently re-validated again in this specific documentation-update pass (this pass re-read the migration SQL and cross-checked it against current code, but did not spin up a fresh local Postgres container).

## Module 5 — Reference Data & Localization
**Folders:** `src/services/modules/reference-data/` (new), `src/store/` (`referenceDataStore.ts`, new), `src/localization/` (new), `src/components/ui/` (SelectField, PhoneInput), `src/screens/admin/`
**Depends on:** Module 4 (reference-data tables)
**Goal:** stop hardcoding geography/units/currencies in the app (§22), and support English +
Urdu with a language switch (§23) without touching backend business logic.

- [x] `src/services/modules/reference-data/referenceDataService.ts` — `fetchCountries`, `fetchProvinces(countryId)`, `fetchCities(provinceId)`, `fetchPhoneCodes`, `fetchCurrencies`, `fetchUnits`
- [x] `src/store/referenceDataStore.ts` — cache reference lists client-side (they change rarely); countries/phone-codes/currencies/units cached once each, provinces/cities cached per parent id
- [x] New reusable `src/components/ui/SelectField.tsx` (searchable Sheet-based picker) and `src/components/ui/PhoneInput.tsx` (calling-code + local-number, composes/validates E.164) — not explicitly named in this module's folder list, but needed to actually build the cascading pickers below; added to the existing `ui/` folder rather than a new one
- [x] DB: `profiles` extended with nullable `country_id`/`province_id`/`city_id`/`village`/`street` (`20260822092000_profile_structured_location.sql`) — additive only; the existing free-text `location` column is kept as a display string the app composes from the structured fields, so the 3 real profiles already in the live project were left untouched (verified on the live project post-push: all still `full_name`/nothing else, no backfill, no dummy data)
- [x] Wire `EditProfileScreen.tsx` to use country → province → city cascading `SelectField`s (clearing province/city when a parent changes) plus `village`/`street` inputs, replacing the old single free-text `location` input
- [~] `RegisterScreen` intentionally **not** wired to the location pickers — it only ever collected name/email/password/role (no free-text location field existed there to replace), and SRDS doesn't mandate collecting full address at signup. Address entry happens once via Edit Profile, consistent with the existing minimal-signup UX
- [ ] Farm/store forms — Modules 7/8 haven't been built yet, so there's nothing to wire yet; those modules should reuse `SelectField`/the reference-data store when they land
- [x] Phone number input formatted/stored as E.164 using `phone_codes` data (§6.2) — `PhoneInput` composes `+<calling_code><digits>`, validated against a standard E.164 regex; wired into `EditProfileScreen`. Only one calling code exists today (`+92`, from Module 4's seed), but the picker is built generically for when Module 18 adds more
- [x] `src/localization/` — i18n setup (`i18next` + `react-i18next`, newly installed), `en.json` and `ur.json` string bundles, language persisted to `AsyncStorage` and restored on app boot (`initLanguage()` called from `App.tsx`)
- [x] Language-selection control in `SettingsScreen.tsx` — real English/اردو toggle wired to `setLanguage()`, no longer a static "English" label
- [~] Translation coverage is infrastructure-complete but **not retrofitted across every existing screen** — only the screens touched in this module (`SettingsScreen`, `EditProfileScreen`'s new fields) use `useTranslation()`/translation keys. Retrofitting the ~30 other screens' hardcoded strings is real but unbounded work; do it incrementally as those screens are next touched by their owning module, not as a one-shot pass here
- [ ] Admin-side reference-data management screens live in Module 18 (Admin), not here — this module only consumes the data
- Known limitation, not fixed here: i18next v4 JSON format relies on `Intl.PluralRules` for pluralization; none of the current keys use plurals so it's untested on-device. Revisit if/when a translation key needs plural forms (add `@formatjs/intl-pluralrules` polyfill if Hermes's build lacks it)

**Validation:** the new migration was applied end-to-end in a throwaway local Docker Postgres container alongside the full existing migration history (per the standing workflow in memory), then a real profile-update was exercised as a simulated authenticated user (own-row write with `country_id`/`province_id`/`city_id` resolved via FK joins, phone stored as E.164) before pushing. **Pushed to the live linked Supabase project** — confirmed via `supabase db query --linked` that all 3 real existing profiles are untouched (new columns present and `null`, no dummy/demo data written).

**Post-hoc note #2 additions:**
- [x] **Scope reduction, user-directed**: `countries`/`provinces`/`cities`/`phone_codes` were dropped entirely (`20260901100000_freetext_location_and_phone.sql`, Module 4) — the geography reference-data approach this module built was seeded with only Pakistan, the literal "hardcoded" complaint it was meant to solve. `referenceDataService.ts` now only exposes `fetchCurrencies`/`fetchUnits`; `LocationPicker.tsx` became three plain free-text inputs (country/province/city, no cascading FK lookups) and `PhoneInput.tsx` dropped its calling-code dropdown for a single free-text field. This is a real, deliberate simplification of this module's original design, not an incomplete implementation of it.
- [x] **Translation coverage — no longer just infrastructure-complete-but-unused**: a full i18n retrofit pass brought coverage from 2 screens (`SettingsScreen`, `EditProfileScreen`) to **62 of 64** screen files, with `en.json`/`ur.json` growing from 27 keys to 800+ lines each. This is currently **uncommitted**, sitting in the working tree. One real gap survived the retrofit: `SellerDashboard.tsx` (a shared component, not a screen file, so it fell outside the pass's own screen-by-screen scope check) still has zero `useTranslation()` calls, despite being what Farmer's and Dealer's `DashboardScreen.tsx` files actually render.
- [x] The `i18next`/`Intl.PluralRules` limitation noted below was never hit in practice — none of the 800+ new keys needed plural forms either.

## Module 6 — Marketplace
**Folders:** `src/screens/marketplace/`, `src/services/modules/marketplace/`, `src/store/` (`marketplaceStore.ts`), `src/components/features/marketplace/`, `src/components/ui/` (LocationPicker)
**Depends on:** Modules 1, 2, 4
**Goal:** farmers/dealers can publish listings; buyers can browse, search, and filter by the
full SRDS §7.3/§7.4 criteria (name, category, seller, location, crop, brand, price, availability, rating).

- [x] `src/services/modules/marketplace/listingsService.ts` — `fetchListings`, `fetchListingById`, `createListing`, `updateListing`, `deleteListing`
- [x] `src/store/marketplaceStore.ts` — active filters/search term, cached category list
- [x] `src/screens/marketplace/BrowseScreen.tsx` — paginated/infinite-scroll listing grid
- [x] `src/screens/marketplace/ListingDetailScreen.tsx`
- [x] `src/screens/marketplace/CreateListingScreen.tsx` (farmer/dealer only) with image picker → Storage upload
- [x] `src/screens/marketplace/EditListingScreen.tsx`
- [x] `src/components/features/marketplace/ListingCard.tsx` — now shows a `RoleBadge` (Module 1) for seller type, overlaid on the listing image; `RoleBadge`'s own background was switched from a light tint to solid white since this is its first real usage and a light tint wasn't legible over photos
- [x] `src/components/features/marketplace/FilterBar.tsx` — category + search stay always-visible; price range, location (country → province → city via `LocationPicker`, Module 5), and crop filters moved into a "Filters" `Sheet` behind a new filter-icon button (with an active-count badge) rather than cramming everything into the top bar — rating filtering still excluded, correctly, since it depends on Module 11
- [x] `src/components/features/marketplace/CategoryChip.tsx`
- [x] Search-by-keyword — implemented server-side (`ilike`) directly rather than client-side-first
- [x] Location filtering — `fetchListings` accepted `cityId` (exact `location->>city_id` match) originally; after Module 5's post-hoc free-text geography change dropped the `cities` table, this moved to `ilike` fuzzy text matching on the free-text city field instead. `cropName` filtering (crop_compatibility array containment) is unaffected. Wired end-to-end from `FilterBar` → `marketplaceStore` → `BrowseScreen` → `listingsService`
- [x] New shared `src/components/features/marketplace/ListingFormFields.tsx` — `CreateListingScreen`/`EditListingScreen` were about to triple their already-duplicated field JSX to add brand/condition/crop-compatibility/location, so the shared fields (everything except photo picking, which differs between the two screens) were extracted into one component + one zod schema instead of duplicating a third time
- [x] New shared `src/components/ui/LocationPicker.tsx` — the same country→province→city cascade is now needed by both `EditProfileScreen` (Module 5) and listing forms, so it's one component instead of two divergent copies; `EditProfileScreen` was refactored to use it too
- [ ] Rating filtering once `reviews`/aggregate seller rating lands — `reviews` exists now (Module 11) but `FilterBar` has no seller-aggregate-rating query to filter against yet; revisit if this becomes worth a dedicated Postgres view
- [x] Product-detail: reviews list + seller rating summary (Module 11) — `RatingSummary` + `ReviewCard` list wired into `ListingDetailScreen`
- [x] Product-detail: "Message seller" entry point — already existed, confirmed still working
- [x] "Add to cart" wired to real availability validation before order confirmation (§11) — added to `ordersService.checkout()` rather than the Add-to-Cart button, since SRDS §11 specifically requires validation *before order confirmation* and the cart is persisted locally (can go stale between add-to-cart and checkout, e.g. another buyer takes the last stock). Re-checks each listing's live `status`/`quantity` and throws a clear per-item error before any order/order_items rows are created. **Not** a fully atomic check-then-act guarantee against a simultaneous purchase — that needs a DB-level transaction/lock and is properly Module 8/9 territory (dealer inventory reduction) once that exists

## Module 7 — Farmer Module
**Folders:** `src/screens/farmer/`, `src/services/modules/farmer/`, `src/navigation/stacks/HomeNavigator.tsx` (new farm/crop routes)
**Depends on:** Modules 4, 6
**Goal:** farmers can maintain an agricultural profile, manage multiple farms and crops, and
have that data available to advisory/AI modules later (§8). This is new scope beyond the
current farmer dashboard shell.

- [x] `src/screens/farmer/DashboardScreen.tsx` — active listings, pending orders, quick "new listing" (thin wrapper over shared `components/features/dashboards/SellerDashboard.tsx`)
- [x] `src/services/modules/farmer/farmService.ts` — full CRUD for `farms` and `farm_crops`, plus `fetchFarmerProfile`/`upsertFarmerProfile`
- [x] `src/screens/farmer/FarmListScreen.tsx` — list of farmer's farms, "+ New Farm" FAB
- [x] `src/screens/farmer/FarmDetailScreen.tsx` / `CreateFarmScreen.tsx` — name, `LocationPicker` (Module 6) for location, area, land unit (`SelectField` sourced from `units` where `applies_to = 'area'`), notes; Detail doubles as view+edit (matches `EditProfileScreen`'s pattern) plus Delete
- [x] `src/screens/farmer/CropListScreen.tsx` / `AddCropScreen.tsx` — crop (`SelectField` reusing `marketplaceStore.crops`), variety, planting date, area, expected harvest date, growth stage, notes, scoped to a farm; `AddCropScreen` does double duty for create *and* edit (optional `cropId` param) rather than a separate edit screen the plan didn't call for
- [x] Farmer agricultural profile fields (experience, general agricultural info) — new `farmer_profiles` satellite table (`20260823080000_farmer_profile.sql`), same one-row-per-profile pattern already used for `experts` rather than bloating the generic `profiles` table with farmer-only columns; surfaced as a conditional section on `EditProfileScreen.tsx` (only rendered for `role === 'farmer'`)
- [x] Confirmed farmer listing creation flow reuses Module 6 `CreateListingScreen` (`BrowseScreen`'s `canSell = role === 'farmer' || role === 'dealer'` gate, one shared form) — no dealer inventory access per BR-04, confirmed via `SellerDashboard`'s role-conditional Quick Actions (farmer never gets Inventory/Stores/Suppliers)
- [x] Navigation: `HOME_ROUTES.FarmsAndCrops` (Module 2 placeholder) replaced with real routes — `FarmList`, `FarmDetail`, `CreateFarm`, `CropList`, `AddCrop` — registered in `HomeNavigator.tsx`; the farmer dashboard's "Farms & Crops" Quick Action now opens `FarmList` instead of a placeholder
- [x] New shared `GeoLocation` type (`types/referenceData.ts`) — was `Listing`-only (`ListingLocation`) before this module, renamed/relocated since `farms.location` needed the identical shape; avoids two structurally-identical types drifting apart

**Validation:** the new `farmer_profiles` migration was Docker-validated against the full history per the standing workflow, then behaviorally tested — a second farmer confirmed unable to see another farmer's `farms` row (0 rows), and farm→farm_crops→crops→farmer_profiles joins confirmed working end-to-end as the owning farmer. **Pushed to the live project**; security advisors re-run post-push with no new findings; row counts confirmed 0 (no dummy data) on `farms`/`farm_crops`/`farmer_profiles`.

## Module 8 — Dealer Module
**Folders:** `src/screens/dealer/`, `src/services/modules/dealer/` (new), `src/store/dealer/` (new), `src/components/features/dealer/` (new)
**Depends on:** Modules 4, 6
**Goal:** dealers manage stores, suppliers, and inventory — a module farmers never see (BR-03/BR-04).
This is new scope beyond the current dealer dashboard shell.

- [x] `src/screens/dealer/DashboardScreen.tsx` — shares `SellerDashboard` component with farmer (active listings + pending orders); extend with inventory/low-stock widgets once inventory lands
- [x] `src/services/modules/dealer/storeService.ts` — CRUD for `dealer_stores`
- [x] `src/screens/dealer/StoreListScreen.tsx` / `StoreDetailScreen.tsx` — `StoreDetailScreen` doubles as create+edit (optional `storeId` param), same pattern as `AddCropScreen` (Module 7), instead of a separate create screen the checklist didn't call for
- [x] `src/services/modules/dealer/supplierService.ts` — CRUD for `suppliers`
- [x] `src/screens/dealer/SupplierListScreen.tsx` / `SupplierDetailScreen.tsx` — same create+edit-doubling pattern as stores
- [x] `src/services/modules/dealer/inventoryService.ts` — CRUD for `inventory`, plus `adjustStock` writing to `inventory_transactions`; `addition`/`restock` increase stock, `reduction`/`sale` decrease it, `adjustment`/`correction` set an absolute known-correct count — the logged transaction quantity is always the resulting delta so the log stays additive/auditable regardless of type
- [x] `src/screens/dealer/InventoryScreen.tsx` — stock levels, unit, cost/price, low-stock indicator against `min_stock_threshold`; create/edit via an in-screen `Sheet` form rather than a separate route (stock quantity itself is only editable through `StockAdjustModal`/`adjustStock` once an item exists, to keep the transaction log authoritative)
- [x] `src/screens/dealer/InventoryTransactionScreen.tsx` — per-item stock movement history plus a "Record Stock Movement" entry point (reuses `StockAdjustModal`)
- [x] `src/components/features/dealer/InventoryRow.tsx`, `StockAdjustModal.tsx`
- [~] Order fulfillment reduces `inventory.stock_quantity` and writes an `inventory_transactions` row (sale-related reduction) — intentionally deferred to Module 9 as planned; `adjustStock` (this module) is what that wiring will call
- [x] RLS/authorization check: a dealer cannot read/write another dealer's inventory or stores — already enforced by Module 4's `dealer_id = auth.uid()` policies (no new migration needed this module); every service function here scopes by the signed-in dealer's id to match
- **Deviation:** skipped the planned `src/store/dealer/` Zustand store — stores/suppliers/inventory screens fetch directly via `useFocusEffect` with no cross-screen shared/cached state need, mirroring Module 7's farms/crops (which also skipped a store for the same reason despite an equivalent CRUD shape)

## Module 9 — Orders & Cart
**Folders:** `src/screens/orders/`, `src/services/modules/orders/`, `src/store/` (`cartStore.ts`), `src/components/features/orders/`
**Depends on:** Modules 4, 6, 8
**Goal:** buyers can build a cart, place orders with an explicit delivery charge, and all
parties can track the full SRDS §12.2 lifecycle.

- [x] `src/store/cartStore.ts` — add/remove/update quantity, derived totals, persisted locally
- [x] `src/services/modules/orders/ordersService.ts` — `checkout` (splits a multi-seller cart into one order per seller since `orders` is single-buyer/single-seller), `fetchOrdersForUser`, `updateOrderStatus`
- [x] `src/screens/orders/CartScreen.tsx`
- [x] `src/screens/orders/CheckoutScreen.tsx`
- [x] `src/screens/orders/OrderHistoryScreen.tsx` (segmented Purchases/Sales — any user can be both regardless of role; default segment follows role)
- [x] `src/screens/orders/OrderDetailScreen.tsx` with status timeline
- [x] `src/components/features/orders/OrderCard.tsx`, `src/components/features/orders/StatusBadge.tsx`, `src/components/features/orders/CartItemRow.tsx`
- [x] Order status transitions (pending → confirmed → fulfilled/cancelled) enforced in `ordersService` — needs widening to the full lifecycle below
- [x] Widened transition logic to `pending → confirmed → processing → ready → completed`, plus `rejected` (from pending), `cancelled` (from pending/confirmed), `disputed` (from completed), and `disputed → refunded/completed` for future admin resolution tooling (Module 18); `payment_failed` stays intentionally unreachable until Module 10 gives it a real in-edge. Every transition now writes an `order_status_history` row (`from_status`/`to_status`/`changed_by`), including the initial `null → pending` row written at checkout
- [x] `CheckoutScreen.tsx`: per-seller delivery-charge input (defaults to 0 = Option A); subtotal, delivery, and total always rendered as separate lines in both `CheckoutScreen` and `OrderDetailScreen`, never merged (BR-09). Real-time buyer/seller negotiation before order creation is out of scope for this module — the buyer proposes a delivery charge at checkout, and the seller can reject/cancel from `OrderDetailScreen` if they disagree, using the existing messaging channel (Module 12) to negotiate before re-ordering
- [x] Stock/availability re-validation at checkout against `inventory` for dealer-sourced items (Module 8 dependency) — **found and fixed a real access-control gap while wiring this up**: a buyer's RLS session cannot read another user's `inventory` rows (`inventory_select_owner_or_admin` is owner-only), so checkout's availability check couldn't see true dealer stock at all without either trusting stale `listings.quantity` or widening `inventory`'s RLS (which would leak `purchase_cost`/`selling_price`/`dealer_id` to every buyer). Fixed with a narrow `security definer` RPC, `public.available_stock(listing_ids uuid[])` (`20260824080000_available_stock_function.sql`, same bypass pattern as `is_admin()`), returning only `{listing_id, available}` — Docker-validated behaviorally: a buyer session gets 0 rows from a direct `inventory` select but the correct stock count from the RPC, both for inventory-linked and unlinked listings; pushed to the live project, `db advisors` shows only the same already-accepted "public can execute security-definer function" class of warning already carried by `is_admin()`
- [x] Seller order management screen updates: accept (`Confirm Order`) / reject (`Reject Order`) / advance through `processing`/`ready`/`completed` / cancel, all in `OrderDetailScreen.tsx`; buyer gets a `Dispute Order` action on completed orders. A `Status History` card renders `order_status_history` directly. "View payment status" is intentionally **not** built here — there's no payment step to report on yet (Module 10 dependency), matching the same documented deferral already used for `PaymentsNavigator` in Module 2
- [x] Order fulfillment reduces `inventory.stock_quantity`: confirming an order (pending→confirmed, the seller's accept action) now reduces stock for every order item with a linked dealer inventory row via `adjustStock(..., 'sale', ...)` (Module 8), logging a `sale` transaction. Availability across all linked items is checked before any reduction runs, so an under-stocked item fails the whole confirm rather than partially deducting

## Module 10 — Payments
**Folders:** `src/screens/payments/` (new), `src/services/modules/payments/` (new), `src/components/features/payments/` (new)
**Depends on:** Modules 4, 9
**Goal:** buyers pay for eligible orders using a standard, non-escrow provider transaction
model (§14). **No escrow wallets, held-balance logic, or release workflows in any form.**

- [x] Chose/confirmed payment provider: **manual/COD**, not a real gateway sandbox — asked the user directly (no Stripe/JazzCash/Easypaisa credentials exist for this deployment); buyer selects Cash on Delivery or Bank Transfer, and the *seller* confirms receipt themselves. `provider` stays `'manual'` on every `payments` row so swapping in a real gateway later is a change to `paymentsService`'s internals, not a schema change
- [x] `src/services/modules/payments/paymentsService.ts` — `initiatePayment(orderId, buyerId, amount, method)`, `fetchPaymentById`/`fetchPaymentByOrderId`, `fetchPaymentTransactions`, `markPaymentReceived(paymentId)`, `markPaymentFailed(paymentId, actorId, reason)`; all write to `payments`/`payment_transactions`
- [x] `src/screens/payments/PaymentMethodScreen.tsx` — select COD or Bank Transfer; redirects straight to `PaymentProcessing` if the order already has a payment on record instead of allowing a duplicate
- [x] `src/screens/payments/PaymentProcessingScreen.tsx` — since there's no provider callback to await, this is an honest "awaiting seller confirmation" state (not a transient spinner) with a manual refresh, auto-forwarding to `PaymentResult` once the status turns terminal
- [x] `src/screens/payments/PaymentResultScreen.tsx` — success/failure/cancelled/refunded copy, links back to `OrderDetailScreen`
- [x] `src/components/features/payments/PaymentStatusBadge.tsx` (uses `statusColors.ts` directly, not the `Badge`/`BadgeTone` abstraction the order `StatusBadge` uses)
- [~] Backend verification step (Module 19) — **not applicable to the manual/COD flow**: there's no provider transaction reference to verify server-side since there's no provider. Revisit if/when a real gateway is added; BR-14's actual constraint (no card/account credentials ever touch the ZaraiLink DB) already holds since only a `method` label and `provider='manual'` are stored
- [x] Order status auto-transitions on payment result — adapted for the manual/COD model rather than built as originally scoped: **not** "unlocks confirmed" (COD is paid at delivery, after fulfillment starts, so gating seller confirmation on prior payment would contradict the whole point of choosing COD). Instead, `markPaymentFailed` moves the order to `payment_failed` only while it's still `pending`/`confirmed` (both added as new `payment_failed` in-edges in `ordersService.ALLOWED_TRANSITIONS`) — a late payment problem on an order already being fulfilled becomes a manual dispute instead of an automatic kill
- [x] Notification on payment result (Module 13) — `notify_payment_status_changed` trigger notifies the buyer whenever `payments.status` changes
- [x] **Found and fixed during this module:** `payments` (Module 4) shipped select+insert only — nothing could ever mark a payment received, which blocks this module's entire manual-confirmation flow. Added `20260825080000_payments_update_policy.sql`: an update policy scoped to the order's seller (or admin) — never the buyer, since buyer self-confirmation would be trivially exploitable — plus a `guard_payments_columns` trigger restricting non-admin updates to the `status` column only (same pattern as `guard_profiles_role`/`guard_experts_verification_status`)
- [x] **Found and fixed during this module:** `payment_transactions` (Module 4) had no insert policy/grant at all — it assumed a backend service-role would write provider webhook events, but no backend exists yet and this flow's events come from the seller's own confirm/fail action. Added `20260825080100_payment_transactions_insert_policy.sql` (seller-of-order or admin, insert-only) and `20260825080200_payment_transactions_seller_select.sql` (the original select policy was buyer-only, so the seller could write events but never read their own history back — fixed to match the insert policy's scoping)
- All three payments migrations Docker-validated behaviorally before push (buyer can create a payment but not self-confirm it; the order's seller can confirm/fail and log+read events; an unrelated seller gets 0 rows on every one of these) and pushed to the live project; `db advisors` shows no new findings beyond the already-accepted classes; row counts confirmed 0 dummy data throughout

## Module 11 — Reviews & Ratings
**Folders:** `src/screens/reviews/` (new, or embedded in `orders/`/`marketplace/`), `src/services/modules/reviews/` (new), `src/components/features/reviews/` (new)
**Depends on:** Modules 4, 9
**Goal:** buyers review eligible completed purchases; sellers/experts accumulate a visible
rating (§15, BR-07). Currently entirely unimplemented.

- [x] `src/services/modules/reviews/reviewsService.ts` — `createReview`, `fetchReviewByOrderId`, `fetchReviewsForListing`, `fetchReviewsForSeller`. Server-side enforcement (order must belong to buyer and be `completed`) was already in place from Module 4's `reviews_insert_buyer_completed_order` policy — no new migration needed this module
- [x] `fetchReviewsForExpert` — built (`src/services/modules/reviews/reviewsService.ts:67`), filtering `seller_id = expertId` + `consultation_id is not null`. The nullable `reviews.consultation_id` column landed in Module 14's own migration (`20260828080000_expert_module_extensions.sql`) exactly as anticipated below, not bolted on speculatively
- [x] `src/screens/reviews/WriteReviewScreen.tsx` — reachable from a new "Write a Review" button on `OrderDetailScreen`, shown only when the signed-in user is the buyer, the order is `completed`, and no review exists yet for it (`fetchReviewByOrderId` gates it — `reviews_one_per_order` would reject a duplicate anyway, but hiding the button avoids a dead-end error). Registered in `OrdersNavigator.tsx`, same flat-stack pattern as Module 10's payment screens rather than a separate nested navigator
- [x] `src/components/features/reviews/ReviewCard.tsx`, `RatingStars.tsx` (dual-mode: read-only display, or an interactive picker when given an `onChange` — used both ways), `RatingSummary.tsx` (average + count, computed from a `reviews[]` prop rather than fetching itself, so a screen that already loaded reviews doesn't double-fetch)
- [x] Wired `RatingSummary` + a reviews list into `ListingDetailScreen` (Module 6); `fetchReviewsForExpert` (above) is consumed by `src/screens/expert/ExpertProfileScreen.tsx` (Module 14)
- [x] Admin moderation hook: `reports.target_type` already includes `'review'` and `reviews_admin_delete` already exists (both Module 4) — schema-side, nothing to add. The report-submission UI itself is **not** built here: no generic "report this content" flow exists anywhere in the app yet (`ReportsScreen.tsx` is still Module 18's unbuilt work), so a report button on `ReviewCard` would have nothing real to call — left for Module 18 to build once, generically, rather than one-off here

## Module 12 — Messaging
**Folders:** `src/screens/messaging/`, `src/services/modules/messaging/`, `src/components/features/messaging/`
**Depends on:** Modules 3, 4
**Goal:** buyers/farmers/dealers/experts can message each other, with live updates (§18).

- [x] `src/services/modules/messaging/messagingService.ts` — `fetchConversations`, `fetchMessages`, `sendMessage`, plus `findOrCreateConversation` and `markConversationRead`
- [x] Supabase Realtime subscription hook for live message delivery (`useRealtimeMessages`) — requires `public.messages` in the `supabase_realtime` publication, added in `20260821000000_phase3_schema.sql`, confirmed live on the linked project
- [x] `src/screens/messaging/ConversationListScreen.tsx`
- [x] `src/screens/messaging/ChatScreen.tsx`
- [x] `src/components/features/messaging/MessageBubble.tsx`, `ConversationListItem.tsx`, `ChatInput.tsx`
- [x] "Start conversation" entry points from `ListingDetailScreen` and `OrderDetailScreen`
- [x] Confirmed: consultations use their own `consultation_messages` table (Module 4), not the generic `messages`/`conversations` pair — a deliberate separation (scoped to requester + assigned expert, carries `consultation_status`), not a gap. Documented in `docs/database/schema.md`. The "Start conversation" entry point itself is still genuinely blocked on Module 14 (no expert profile screen exists yet to put the entry point on) — noted `consultation_messages` isn't in the `supabase_realtime` publication yet either, so live delivery needs that added when Module 14 builds the consultation chat UI
- [x] Image attachment support (§18 "may support") — buyers/sellers can attach up to 4 photos per message via `ChatInput`'s new image picker, with inline preview + remove before sending. **Found the same public-bucket risk while building this that Module 10 found for `inventory`**: `avatars`/`listing-images` are intentionally public buckets, but a chat is private between two people, so a new `message-attachments` bucket was added as **private**, with `storage.objects` RLS scoping both read and insert to the two participants of the conversation encoded in the object's path (`${conversation_id}/${sender_id}/...`, checked via `storage.foldername`). Client renders images via short-lived signed URLs (`resolveAttachmentUrls`), never `getPublicUrl`. Docker-validated behaviorally (a non-participant gets 0 rows on select and is rejected on insert into another conversation's folder) before push — note the validation container needed extra setup beyond previous modules' recipe: RLS isn't enabled by default on a raw-image `storage.objects` stub the way it is on the real managed platform, and `storage.foldername()` doesn't exist in the raw image either, so both had to be added to the local stub only (not the migration, which correctly assumes the real platform's built-in behavior)

## Module 13 — Notifications
**Folders:** `src/screens/notifications/` (new), `src/services/modules/notifications/` (new), `src/hooks/` (new hook)
**Depends on:** Module 4
**Goal:** role-aware in-app notifications for the event list in §19. Currently unimplemented.

- [x] `src/services/modules/notifications/notificationsService.ts` — `fetchNotifications`, `fetchUnreadCount`, `markRead`, `markAllRead`
- [x] `src/hooks/realtime/useRealtimeNotifications.ts` (mirrors `useRealtimeMessages`) for live notification delivery; `src/hooks/api/useUnreadNotificationsCount.ts` built on top of it to back both the Expert tab badge and the bell buttons — kept per-consumer rather than a shared store, same reasoning as Module 8's skipped dealer store
- [x] `src/screens/notifications/NotificationListScreen.tsx` — mounted in three different navigators (buyer/farmer/dealer's Home stack, Expert's Notifications tab, Admin's Home stack) with one shared implementation; tapping an order/payment/message notification deep-links to `OrderDetailScreen`/`ChatScreen` via the parent tab navigator (best-effort — no-ops harmlessly in a tab bar that doesn't have the target route, which in practice only matters for roles that would never receive that notification type anyway)
- [x] `src/components/features/notifications/NotificationRow.tsx` (icon/color by type via `moduleAccents.ts`), `NotificationBellButton.tsx` (header entry point + badge for roles without a dedicated tab)
- [x] Notification badge/count on relevant tab icons — real `tabBarBadge` on Expert's Notifications tab (the one role with a dedicated tab per SRDS §34); buyer/farmer/dealer and admin don't have one, so a bell-icon header button with the same badge was added to their dashboard header instead (`HOME_ROUTES.Notifications`, `ADMIN_HOME_ROUTES.Notifications`)
- [x] Server-side triggers for all 9 listed events (new order, order status update, payment result, new message, consultation request/status change, listing status, inventory low-stock, expert verification, account suspension as the "admin action" case) — one migration (`20260827080000_notifications_triggers.sql`), all writing through a shared `security definer` helper since `notifications` has no client insert grant. Consultation triggers are schema-ready but dormant (nothing writes to `consultations` yet, Module 14)
- [x] **Found and fixed a real bug during Docker validation**: the low-stock trigger initially notified nobody, because the generic "don't notify someone about their own action" rule (correct for order/listing status changes) also swallowed the one case where actor and recipient are legitimately the same person — a dealer adjusting their own stock down into the low-stock range needs that notification precisely because they caused it. Added a `skip_self` parameter to the shared helper, defaulting to the safe `true` everywhere except this one call site
- [x] **Found and fixed a real security gap after push, before calling this done**: `create_notification` (`security definer`) was left publicly callable — any `authenticated` client could call it directly via RPC to inject an arbitrary notification into any other user's inbox, bypassing `notifications`' owner-only insert grant entirely. Unlike `is_admin()`/`available_stock` (read-only, harmless if called directly, and both already an accepted advisor finding), this one performs a write, so leaving it callable was a real gap the advisor doesn't flag on its own. Fixed with a follow-up migration (`20260827080100_notifications_lockdown.sql`): made the 9 trigger functions `security definer` too (so their internal call to the helper runs as the function owner, not the invoking client) and revoked `EXECUTE` on the helper from `anon`/`authenticated`/`public`. Confirmed via Docker: direct RPC call now `permission denied`, while real trigger-driven notifications (including the self-notify low-stock case) still work end-to-end
- [x] Push notification integration confirmed out of scope for this FYP baseline (in-app only) — documented in `docs/architecture/notifications.md` along with the full trigger/event/entry-point writeup

## Module 14 — Expert Module
**Folders:** `src/screens/expert/`, `src/services/modules/expert/` (new), `src/components/features/expert/` (new)
**Depends on:** Modules 3, 4
**Goal:** the full §16 workflow — expert registration, admin verification, consultation
requests/lifecycle, and expert recommendations optionally linking to marketplace listings.

- [x] `src/screens/expert/DashboardScreen.tsx` — real dashboard: application-status banner (missing/pending/rejected), live open/resolved consultation counts, recent-consultations list, and (as of Module 16) an Analytics quick action
- [x] `src/services/modules/expert/expertService.ts` — `submitExpertApplication`, `fetchExpertProfile`, `updateExpertProfile`, `fetchExperts`
- [x] `src/screens/expert/ExpertApplicationScreen.tsx` — qualifications, degree/certification, specialization(s), experience, description, location, contact, document upload → Storage
- [x] `src/screens/expert/ExpertProfileScreen.tsx` (public-facing: name, image, specialization, qualifications, experience, rating, reviews, availability)
- [x] `src/screens/expert/ExpertListScreen.tsx` — browse verified experts
- [x] `src/services/modules/expert/consultationService.ts` — `createConsultationRequest`, `fetchConsultationsForUser`, `fetchConsultationsForExpert`, `updateConsultationStatus`, `sendConsultationMessage`
- [x] `src/screens/expert/RequestConsultationScreen.tsx` — subject, crop, problem description, farm info, images, priority
- [x] `src/screens/expert/ConsultationListScreen.tsx` / `ConsultationDetailScreen.tsx` — lifecycle: requested → accepted → in_progress → resolved → closed (+ rejected/cancelled/expired), including accept/reject, recommendation deep-links into `ListingDetailScreen`, and a post-resolution review prompt (`reviews.consultation_id`, Module 11)
- [x] **Navigation wiring fixed (alongside Module 15)** — added the real `src/navigation/stacks/ConsultationsNavigator.tsx` (`ConsultationList`/`ExpertList`/`ExpertProfile`/`RequestConsultation`/`ConsultationDetail`) that `ExpertListScreen.tsx`/`ExpertProfileScreen.tsx`/`RequestConsultationScreen.tsx` had been importing types from all along; `AppNavigator.tsx` now uses it instead of its own inline placeholder stack. `ExpertNavigator.tsx`'s `ExpertHomeStackParamList` gained `ExpertApplication` (fixing `DashboardScreen.tsx`'s dead status-banner navigate calls) and its Consultations tab now registers real `ConsultationListScreen`/`ConsultationDetailScreen` instead of a placeholder. All 3 pre-existing `tsc` errors from the missing module are gone.
- [ ] Expert verification workflow itself (approve/reject/suspend/reactivate) lives in Module 18 (Admin), not here

## Module 15 — AI Disease Advisory
**Folders:** `src/services/modules/ai/`, `src/screens/disease/`, `backend/app/{api,services,schemas,repositories,core,ml}/` (new)
**Depends on:** Module 19 (needs a FastAPI endpoint to call), Module 14 (AI→Expert handoff)
**Goal:** preliminary crop disease detection from an uploaded image, presented as advisory
only, with a clear path into Expert consultation (§17, BR-13).

- [x] Model scope note: `docs/architecture/ai-disease-advisory.md` — MobileNetV2 (torchvision), trained externally in Google Colab, weights dropped in at `backend/app/ml/checkpoints/model.pth`; class list and accuracy explicitly documented as provisional/placeholder pending real training data
- [x] New public `disease-images` Storage bucket (`supabase/migrations/20260901080000_disease_images_bucket.sql`, policies copied 1:1 from `listing-images`)
- [x] `src/types/disease.ts` — `DiseaseCase`, `DiseasePrediction`, `DiseaseCaseWithPrediction`, `DiseasePrefill`, `LOW_CONFIDENCE_THRESHOLD`
- [x] `src/services/modules/ai/diseaseService.ts` — `uploadDiseaseImage`, `createDiseaseCase` (direct client insert, RLS already permits), `predictDisease` (calls the new FastAPI endpoint), `fetchDiseaseCaseWithPrediction`
- [x] `src/screens/disease/DiseaseUploadScreen.tsx` — select crop, upload image (gallery-only via `launchImageLibrary`, matching every other upload flow in the app — no camera capture, a deliberate scope choice, not an oversight)
- [x] `src/screens/disease/DiseaseProcessingScreen.tsx` — loading state (latency-sensitive per SRDS §32.1); on failure (including the expected 503 until real weights land) shows Retry + "Talk to an Expert"
- [x] `src/screens/disease/DiseaseResultScreen.tsx` — predicted disease, confidence badge, description, recommended actions; always-visible disclaimer that this is advisory, not a replacement for professional consultation (§17.2, BR-13)
- [x] "Consult an Expert" CTA (always available, emphasized below `LOW_CONFIDENCE_THRESHOLD`) pre-fills `RequestConsultationScreen` (Module 14) with subject/description/crop/photo attached (§17.3)
- [x] Recommended-action → marketplace mapping: `DiseaseResultScreen` surfaces up to 5 matching listings via the existing `crop_compatibility` filter, captioned "may help — not a guarantee" (§17.4)
- [x] **Farmer-only** (user decision, revising the original "Buyer/Farmer/Dealer/Expert" scope from Module 2): the only entry point is `SellerDashboard.tsx`'s farmer branch, the same Quick-Actions-level gating that already makes Farms/Crops farmer-only and Inventory dealer-only within the same shared `HomeNavigator` stack — Buyer, Dealer, and Expert dashboards carry no "Disease Advisory" action, and Expert's own `DiseaseAdvisory`/`DiseaseProcessing`/`DiseaseResult` routes were removed from `ExpertNavigator.tsx` entirely (would otherwise be dead, unreachable code specific to that stack). Not enforced at the RLS layer — matches the existing app-wide pattern (Module 20) of role-exclusive features being gated in the UI, not the database
- [x] Minimal real FastAPI slice (a deliberate early slice of Module 19, whose own plan text names disease inference as one of the first two things to build): `backend/app/main.py`, `core/config.py`, `services/ai_engine.py` (MobileNetV2 load/predict, degrades to a clear `ModelUnavailableError` → `503` since `model.pth` is currently a placeholder), `schemas/disease.py`, `repositories/disease_repository.py` (service-role Supabase client), `api/v1/endpoints/disease.py` (`POST /api/v1/disease/predict`). Verified with `python -m py_compile` on every new file; not run end-to-end since `torch`/`torchvision` aren't installed in this dev environment (a ~1GB+ install, not done without asking) — real verification needs `pip install -r backend/requirements.txt` on the user's machine

## Module 16 — Role Dashboards & Analytics
**Folders:** `src/screens/{farmer,buyer,dealer,expert,admin}/`, `src/components/features/dashboards/`
**Depends on:** Modules 4, 6, 7, 8, 9, 10, 14
**Goal:** each role's home screen surfaces what matters to them, plus the role-specific
analytics from §38.

- [x] `src/components/features/dashboards/StatCard.tsx`, `ActivityFeed.tsx`, `QuickActions.tsx`
- [x] `src/screens/farmer/DashboardScreen.tsx` — active listings, pending orders, quick "new listing" (thin wrapper over shared `SellerDashboard.tsx`)
- [x] `src/screens/buyer/DashboardScreen.tsx` — recent orders done; "saved/favorite listings" formally dropped from this module's acceptance criteria — no `favorites` table exists and none is planned, buyer dashboard scope ends at recent orders
- [x] `src/screens/dealer/DashboardScreen.tsx` — same shared `SellerDashboard` as farmer
- [x] Extend farmer dashboard: crop/farm summary widget + consultation activity widget, added to `src/components/features/dashboards/SellerDashboard.tsx`'s `role === 'farmer'` branch
- [x] Extend dealer dashboard: low-stock widget + supplier/store summary, added to the same file's `role === 'dealer'` branch
- [x] `src/screens/expert/DashboardScreen.tsx` — real dashboard (not a shell): status banner, live consultation counts/list, now with an Analytics quick action
- [x] `src/screens/admin/DashboardScreen.tsx` — platform stats; extend with §20.5 metrics as their source tables land: pending expert verifications, total/active listings, orders, payments, reports, suspended accounts
- [x] Farmer analytics: `src/screens/farmer/AnalyticsScreen.tsx` — listing views (new `listing_views` table + `20260829080000_listing_views.sql`, wired into `ListingDetailScreen.tsx`), orders, sales, popular products
- [x] Dealer analytics: `src/screens/dealer/AnalyticsScreen.tsx` — sales, inventory movement (from `inventory_transactions`), low-stock, best-sellers
- [x] Expert analytics: `src/screens/expert/AnalyticsScreen.tsx` — consultation count, completed count, average rating
- [x] Admin analytics: `src/screens/admin/AnalyticsScreen.tsx` — user growth, marketplace activity, orders, payments, reports, expert activity. Needed no new `security definer` RPC — every table it reads already grants admins full read under RLS (`... or public.is_admin()`, confirmed directly in the migrations), same pattern as `fetchPlatformStats()`
- [x] New `src/services/modules/analytics/analyticsService.ts` composing existing domain services; new `src/components/features/dashboards/BarChart.tsx` (hand-rolled `View`-based bars) and an optional trailing `value` field on `ActivityFeed`'s `ActivityItem`, shared by all four screens

## Module 17 — Profile & Settings
**Folders:** `src/screens/profile/`
**Depends on:** Module 3, Module 5 (reference-data pickers, language)
**Goal:** users can view/edit their own profile and account settings.

- [x] `src/screens/profile/ViewProfileScreen.tsx`
- [x] `src/screens/profile/EditProfileScreen.tsx` (name, phone, location, avatar upload)
- [x] `src/screens/profile/SettingsScreen.tsx` (notifications, appearance, language, logout) — notification toggle now persists for real (`profiles.notifications_enabled`, Module 4 post-hoc addition, `20260901150000`), not the local-only stub this line originally described; a 3-way light/dark/system appearance selector was added on top of the language toggle, backed by a new persisted `themeStore` (not originally scoped in this module, but the natural home for it)
- [x] `src/screens/profile/ChangePasswordScreen.tsx`
- [x] `EditProfileScreen.tsx` uses `<LocationPicker>` — originally country/province/city cascading `SelectField`s, now three plain free-text inputs after Module 5's post-hoc geography simplification — composing the display `location` string from whatever the user typed
- [x] `SettingsScreen.tsx` language toggle wired to `react-i18next`'s `useTranslation`/`setLanguage()`
- [ ] Role-specific profile extension fields surfaced here where they don't warrant their own screen (e.g. farmer experience blurb) — most role-specific data (farms, stores, expert credentials) stays in its owning module

## Module 18 — Admin Module
**Folders:** `src/screens/admin/`, `src/services/modules/admin/`
**Depends on:** Modules 4, 14 (expert verification), all seller/content-producing modules
**Goal:** the full §21 governance surface — users, experts, products, categories, reports,
reference data, and audit logs.

- [x] `src/services/modules/admin/adminService.ts` — extended with `logAdminAction`, `updateUserRole`, `fetchReports`/`resolveReport`/`dismissReport`, `fetchAuditLogs`
- [x] `src/screens/admin/DashboardScreen.tsx` — platform stats (see Module 16 for metric expansion)
- [x] `src/screens/admin/UserManagementScreen.tsx` — list/suspend users, now also role change (promote/demote) via a `Sheet` picker calling `updateUserRole`; enforcement is still app-level only in `authStore`, not yet checked in RLS on every table — tracked in Module 20
- [x] `src/screens/admin/ListingModerationScreen.tsx` — approve/flag listings; `updateListingStatus` now writes an `audit_logs` row via `logAdminAction`
- [x] `src/screens/admin/ExpertVerificationScreen.tsx` — filter chips by `verification_status`, approve/reject/suspend/reactivate via `expertService.reviewExpertVerification` (updates `experts.verification_status` + the existing `expert_verifications` row created at application time — no new insert path needed)
- [x] `src/screens/admin/CategoryManagementScreen.tsx` — CRUD for `categories` via new `createCategory`/`updateCategory`/`deleteCategory` in `listingsService.ts` (RLS already permitted admin writes; only the service functions were missing)
- [x] `src/screens/admin/ReportsScreen.tsx` — list/filter/resolve/dismiss `reports` across all six `target_type`s, each with a type-specific corrective action (remove listing, suspend user, delete review, suspend expert, redact message) before marking resolved — this is the real backing for "flagged" listings' derivation
- [x] `src/screens/admin/ReferenceDataScreen.tsx` — one config-driven screen manages all six tables (countries/provinces/cities/phone codes/currencies/units) via new generic `createRefDataRow`/`updateRefDataRow`/`deleteRefDataRow` in `referenceDataService.ts`; calls the store's new `invalidateAll()` after every mutation so `LocationPicker`/`PhoneInput` elsewhere don't serve stale cached data mid-session
- [x] `src/screens/admin/AuditLogScreen.tsx` — read-only, reverse-chronological, filterable by `target_entity`
- [x] Role management: promote/demote via `UserManagementScreen.tsx`'s new role-picker `Sheet`, not a separate screen
- [x] Content moderation actions — `ReportsScreen.tsx`'s per-target-type resolution actions (listing removal, user suspension, review deletion, expert suspension, message redaction)
- [x] Every admin action above writes an `audit_logs` row via the shared `adminService.logAdminAction()` helper
- [x] **Found and fixed a real bug while wiring message redaction**: `messages` had no update policy at all — the already-shipped `markConversationRead()` (Module 12) had been silently failing under RLS since it was written (0 rows affected, no error). Fixed in `20260830080000_messages_admin_moderation.sql` alongside adding admin read/redact access: one guard trigger now restricts participants to `read_at` only and admins to `body` only. Docker-validated (isolated harness, since the full migration chain still fails locally on the unrelated pre-existing `pg_net` issue): spoofed column changes rejected for both roles, non-participants blocked entirely, admin read/redact confirmed working.
- [x] `ADMIN_HOME_ROUTES.Orders` (platform-wide order overview) — was never one of this module's named deliverables, but was later resolved: `src/screens/admin/PlatformOrdersScreen.tsx`, backed by `GET /api/v1/admin/orders` (Module 19)

## Module 19 — FastAPI Backend Service
**Folders:** `backend/app/`, `backend/requirements.txt`
**Goal:** a real API for logic that shouldn't run client-side per §26/§27 — privileged
Supabase service-role calls, AI inference, payment verification, third-party integrations.

**Status: complete.** Grew well beyond the original scope of this module — instead of only the
payments/disease/admin slices originally scoped here, every one of the 15 frontend-facing
domains was moved behind FastAPI (checkout/order-status/stock/review/consultation/messaging
business rules that were previously client-side are now server-enforced). See
`docs/architecture/backend-architecture.md` for the resulting shape; `authorization-model.md`
for the per-resource rules; `ai-disease-advisory.md` for the model itself.

- [x] Pin all versions in `backend/requirements.txt`
- [x] `backend/app/core/config.py` — `pydantic-settings` for Supabase URL/anon key/service-role key, `MODEL_PATH`/`MODEL_VERSION`/`MODEL_CLASSES`
- [x] `backend/app/core/supabase_client.py` — three client modes (user-scoped default, service-role, public/anon), not a single service-role-only client as originally scoped — the RLS-preserving design needed a request-scoped mode too
- [x] `backend/app/core/auth.py` — Supabase JWT verification + role/suspension gate, not originally scoped for this module but required once every domain moved behind auth (see backend-architecture.md)
- [x] `backend/app/main.py` — FastAPI app instance, versioned router registration (`/api/v1/...`) for all 15 domains, CORS config — **post-hoc note #2**: CORS was originally wide open (`allow_origins=["*"]`); now reads an `ALLOWED_ORIGINS` environment allowlist. `slowapi` rate limiting was added on top (200/minute-per-IP default, 10/minute override on `/disease/predict`), neither of which was in this module's original scope
- [x] `/health` liveness endpoint (inline in `main.py`, not a separate `api/health.py` — no other route needed splitting out)
- [x] `backend/app/schemas/` — one file per domain (15), Pydantic request/response contracts
- [x] `backend/app/services/` — business logic per domain (15), including payment verification and disease inference
- [x] `backend/app/repositories/` — data-access layer per domain (15), all going through `core/supabase_client.py`'s client modes
- [x] `backend/app/api/v1/endpoints/payments.py` — server-side payment initiation/marking, amount always derived from the order server-side, never client-supplied
- [x] `backend/app/api/v1/endpoints/disease.py` — case creation → model inference → `disease_predictions` row, ownership-checked
- [x] `backend/app/api/v1/endpoints/admin.py` — admin-only actions (user suspension/role changes, report resolution, audit-log reads, platform-wide order overview)
- [x] Local run docs: `uvicorn backend.app.main:app --reload` in `docs/setup/DEVELOPMENT_SETUP.md`
- [x] `backend/tests/` — pytest suite per domain, **112 tests** (up from the 102+ this line originally noted), covering auth, ownership, and business-rule behavior, not just existence checks — plus new CORS/rate-limit regression tests in `test_main.py`

## Module 20 — Security & Audit Logging
**Folders:** cross-cutting — `supabase/migrations/`, `backend/app/`, `src/`
**Depends on:** all functional modules
**Goal:** defense-in-depth per §47/§48, and full auditability per BR-15. This module tracks
the *cross-cutting* checklist; the individual RLS policies and audit-log writes are actually
implemented alongside their owning table/screen in Modules 4/18/19.

- [x] Role-based route guarding on the frontend (Module 3)
- [x] RLS policies on all core tables (Module 4, core domain)
- [x] RLS policies on every table Module 4 introduced (farmer/dealer/payments/reviews/expert/disease-advisory/reports/notifications/audit-logs/reference-data) — shipped alongside their migrations, not deferred. Still `[ ]` in spirit for Modules 7/8/10/11/13/14/15/18: as each of those *frontend* modules lands and starts exercising the DB with real usage patterns, re-review the policies below against what actually gets built — this is a recurring check, not closed off by Module 4 shipping
- [x] Resource-ownership checks for dealer inventory/stores/suppliers specifically called out in §48's example — verified with an actual test case (not just code review): a throwaway local Postgres container with two simulated dealer sessions confirmed dealer A gets 0 rows reading or updating dealer B's `inventory`
- [x] `profiles.role` self-escalation closed with a trigger (`guard_profiles_role`, Module 4) — behaviorally verified: non-admin role changes rejected, admin-driven changes succeed
- [x] **Post-hoc note #2 — closed**: `is_suspended` is now enforced in RLS itself (`public.is_suspended()` gated into 24 tables' write policies, `20260901110000_rls_suspension_enforcement.sql`, Module 4), not just app-side in `authStore`/FastAPI — a suspended user's JWT can no longer write anywhere RLS governs, even outside the app.
- [ ] `audit_logs` writes wired into every admin mutation (Module 18) and every sensitive state change (order status, payment status, inventory adjustment, expert verification) — not re-verified end-to-end in this pass
- [x] **Post-hoc note #2 — closed**: rate limiting added at the FastAPI layer (`slowapi`, Module 19) — 200/minute-per-IP default, 10/minute on `/disease/predict`. Not yet extended to Supabase-direct public write paths (listings/messages/reviews/reports still rely on RLS + backend-mediated writes for protection, not a dedicated rate limiter of their own)
- [ ] Secure file-upload validation (type/size) on all Storage upload paths (listing images, avatars, expert verification documents, disease images) — still open
- [ ] Confirm no sensitive payment credentials are ever persisted in the ZaraiLink DB (BR-14) — review `payments`/`payment_transactions` schema against this before Module 10 ships — still open, though `payments`' schema (amount/method/provider/status only, no credential-shaped columns) already suggests this holds
- [ ] Secrets management review: confirm service-role key, payment provider keys, and AI model credentials never reach the mobile bundle or git history — still open
- [x] **New this pass, not originally scoped**: closed a real over-privilege gap where admin had full write access (not just read) to `dealer_stores`/`suppliers`/`inventory`/`inventory_transactions`, plus a companion gap letting a non-participant admin's order-confirm action reduce a dealer's stock — `20260901090000_admin_write_scope_hardening.sql` (Module 4)
- [x] **New this pass, not originally scoped**: closed a real concurrency bug in the order-confirmation stock decrement (no row lock across a read-then-write sequence, allowing overselling under concurrent confirmations) — `20260901130000_atomic_stock_adjustment.sql` (Module 4)

## Module 21 — Testing & QA
**Folders:** `__tests__/` (frontend), `backend/tests/` (backend).
**Goal:** move past the single default RN render test, covering the workflows in §41–§46.

**Status: essentially complete (post-hoc note #2).** Every item below that was unchecked is now done, per the `e25772f` commit record: 734 frontend tests across 132 suites (~90% statement coverage, `tsc`/`eslint`/`jest` all clean), 112 backend tests (up from 106).

- [x] Unit tests for `authStore`, `cartStore`, `marketplaceStore`, `referenceDataStore`, and the new `themeStore`
- [x] Unit tests for service modules with a mocked `apiFetch`/Supabase client — marketplace, orders, payments, experts, disease, admin, and every other domain
- [x] Component tests for `src/components/ui/*` primitives
- [x] Integration test: sign up → login → land on role dashboard (a real navigator-integration flow, not a mocked one)
- [x] Integration test: marketplace checkout flow (cart → checkout with delivery charge → payment → order history split), the direct BR-09 regression guard
- [~] The specific integration tests originally itemized here (dealer inventory over-selling, consultation lifecycle, admin-suspends-user) were not individually confirmed by file name in this documentation-only pass — the aggregate 734-test/132-suite count and "all screens/stores/services" scope claim from the commit message covers this ground, but this line is marked partial rather than done until each is spot-checked directly
- [x] `backend/tests/` — pytest suite per router/service using FastAPI `TestClient`, 112 tests total
- [x] `__tests__/App.test.tsx` — superseded by the full suite above, not just extended

A real production bug was found and fixed along the way, not originally anticipated by this module: `@hookform/resolvers ^3.10.0` was incompatible with `zod v4`, making every form's client-side validation error crash instead of displaying a message, across roughly 20 screens. Upgraded to `^5.9.1`.

## Module 22 — CI/CD
**Folders:** `.github/workflows/`
**Goal:** catch regressions automatically instead of relying on local runs.

**Status: complete and verified (post-hoc note #2)** — no longer unverified stubs.

- [x] `.github/workflows/frontend-ci.yml` — `npm ci`, lint, typecheck, `npm test`
- [x] `.github/workflows/backend-ci.yml` — installs `backend/requirements.txt`, runs pytest
- [x] `.github/workflows/migration-lint.yml` — new, not originally scoped by name here: applies the full migration history to a throwaway local Postgres via the Supabase CLI and runs `supabase db lint`
- [x] **All three proven against real merged PRs**, not just configured — a dedicated verification pass (`phase-6-ci-verification`, two merged PRs) deliberately broke lint, typecheck, and jest one at a time, confirmed each correctly failed CI, then fixed and merged clean to `main` (`gh run list` shows the full red→green history)
- [ ] Branch protection — not enabled. This repo's GitHub plan returns 403 on the branch-protection API ("Upgrade to Pro or make this repository public"); this is a plan-tier limit, not unfinished work

## Module 23 — Documentation
**Folders:** `docs/architecture/`, `docs/database/`, `docs/setup/`
**Goal:** keep the FYP writeup and onboarding docs current as modules land, instead of
reconstructing them later.

- [ ] `docs/architecture/overview.md` — system diagram (mobile ↔ Supabase ↔ FastAPI) — still not written
- [ ] `docs/architecture/navigation-map.md` — screen/flow map per role — still not written
- [x] `docs/architecture/ai-disease-advisory.md` — model scope note; **reconciled this pass** (uncommitted) — its data-flow description previously said the mobile client inserts `disease_cases` directly via RLS, when the actual path is backend-mediated (`POST /api/v1/disease/cases`); also added a note that only 1 of 5 disease classes has real description copy
- [x] `docs/architecture/authorization-model.md` — per-resource ownership/authorization rules (§48); **reconciled this pass** (uncommitted) — was stale on the payments write model and RLS-push status; also had its own "backend mirror: exactly four cases" claim contradicted by the just-corrected backend-architecture.md, caught and fixed mid-pass
- [x] `docs/architecture/notifications.md` — write-path/trigger design; **reconciled this pass** (uncommitted) — consultation triggers were marked "dormant," now correctly marked live
- [x] `docs/architecture/backend-architecture.md` — FastAPI layering, auth flow, the three Supabase client modes; **reconciled this pass** (uncommitted) — service-role usage count corrected from "four cases" to the actual one (disease inference only); new "Request-level middleware" section documents CORS/rate-limiting
- [x] `docs/database/schema.md` — **now re-verified current** against every migration (was previously the one item explicitly left unchecked here) — reconciled this pass (uncommitted); also fixed an independently-stale `reviews` table row (`order_id not null` claim, contradicted by a widening migration from months earlier that this document had never caught up to)
- [x] `docs/setup/DEVELOPMENT_SETUP.md` — not originally in this module's file list, but reconciled this pass too (uncommitted) — repeated the same wrong service-role-usage count as backend-architecture.md
- [ ] FastAPI endpoint reference — still deferred to FastAPI's own auto-generated OpenAPI/Swagger docs, as originally decided
- [ ] Design-system token reference for Module 1 — still not written

## Module 24 — Production Readiness / Security Hardening
**Depends on:** all functional modules substantially complete
**Goal:** the checklist to run through before this stops being a dev-only build.

- [ ] Re-enable `enable_confirmations` for email auth in the production Supabase project — still open
- [ ] Raise `minimum_password_length` / set a real `password_requirements` policy — still open
- [ ] Review every RLS policy written across Module 4 against actual access patterns — partially addressed by the dealer-scope and suspension-enforcement hardening (Module 20), but not a dedicated full re-review
- [ ] Confirm the FastAPI service-role key never ships to the mobile bundle — still open, not independently re-verified
- [x] **Closed (post-hoc note #2)**: rate limiting / abuse prevention added at the FastAPI layer (`slowapi`) — 200/minute default, 10/minute on `/disease/predict`. Not yet extended to a dedicated limiter on Supabase-direct public write paths specifically (listings/messages/reviews/reports rely on RLS + backend-mediated writes for protection today)
- [ ] Final pass confirming no escrow-shaped payment logic exists anywhere (BR-11 sign-off) — re-confirmed absent as part of this update's own review (§12/§16 of `report.md`), but not a dedicated Module-24 sign-off pass
- [ ] App icons, splash screen, store listing assets, privacy policy for Play Store/App Store submission — still open
- [ ] **New, not originally scoped**: a real Android release-signing keystore — the release build type still signs with the stock debug keystore (`storePassword 'android'`)
- [ ] **New, not originally scoped**: `.gitignore` doesn't yet explicitly cover `*.keystore`/`google-services.json` patterns (latent, not active, since neither file currently exists)

---

*This document is planning only for Modules 1–24's original scope — real application code has since been written against most of it (see the post-hoc notes throughout, and `report.md`/the ZaraiLink Field Manual for the fuller current-state picture). Update checkboxes and add tasks as work continues.*
