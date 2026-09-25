# ZaraiLink Plan (SRDS edition)

> **Status (2026-09-26): plan of record, not started.** Built from [`docs/srds.md`](srds.md), which is the
> requirements baseline. It replaces the P0–P14 Standardization Program
> ([`docs/process/standardization-plan.md`](process/standardization-plan.md), kept for history). The rules in
> [`AGENTS.md`](../AGENTS.md) still apply to every phase: a real path must run, no stubs, evidence, two-key
> verification, a truthful feature register, and stop-and-ask before any outside service.
>
> **The app is English only (2026-09-26).**
>
> Section 3 lists decisions that change the build. Each has a recommended default; phases that depend on one do
> not start until you confirm it.

## 1. How to read this plan

| Section | What it gives you |
|---|---|
| 2 | Where the code stands against each SRDS requirement today |
| 3 | Decisions to confirm (recommended defaults) |
| 4 | The phases R0 to R11, in order, with exit criteria |
| 5 | What carries over from the old plan |
| 6 | Outside services and gates |
| 7 | Traceability: every SRDS §53 rule to its phase |
| 8 | Risks |

Rule references such as "§53.14" point to the numbered list in SRDS section 53.

## 2. Baseline: the SRDS against the code today

Legend: **Done** (proven on the real stack), **Partial**, **Missing**, **Conflicts** (today's behaviour contradicts the SRDS).

| SRDS requirement | Today | Status |
|---|---|---|
| Five roles; no public admin (§3, §50) | `user_role` enum has the five roles; `handle_new_user` allow-lists farmer/buyer/dealer/expert, admin only via `docs/process/admin-bootstrap-runbook.md`; pgTAP and smoke tests prove a forged admin sign-up gets `buyer` | Done |
| Four registration choices (§4) | `RegisterScreen` offers the four non-admin roles | Done |
| Role-specific registration fields (§5, §6) | Sign-up collects name, email, password, role; location is free text on Edit Profile (the country/province/city tables were dropped in Module 5) | Partial |
| Dealer business info and documents (§7) | No dealer application, no business fields, no document bucket | Missing |
| Dealer approval, PENDING until approved (§8, §13) | Dealers are active at sign-up and can sell and use inventory immediately | Conflicts |
| Configurable required documents (§7) | None | Missing |
| Expert application and documents (§10) | `experts` + `expert_verifications` + `expert-documents` bucket; application is filled after sign-up, one `document_url` | Partial |
| Expert blocked until approved (§11, §13) | Pending expert signs in and sees a banner; not listed publicly and consultations refused by the database guard, but the expert workspace is open | Partial |
| Approval email and log in again (§9, §11) | No email on approval; auth emails work only locally (Mailpit), hosted needs SMTP (gate G1) | Missing / Blocked |
| Admin approval queues with document review (§12) | `ExpertVerificationScreen` (filter, approve, reject, suspend, reactivate); no dealer queue | Partial |
| Account states PENDING/APPROVED/REJECTED/SUSPENDED enforced server-side (§13) | `verification_status` enum exists for experts; `profiles.is_suspended` for everyone; nothing for dealers | Partial |
| Admin moderation of the whole platform (§14) | Users, listings, experts, reports, categories, reference data, audit log, platform orders, dispute resolution | Partial (no consultation or AI-activity moderation, no dealer queue) |
| Admin has no operational inventory access (§15, §53.12) | RLS lets admin **read** `inventory`, `inventory_transactions`, `dealer_stores`, `suppliers` | Conflicts |
| Inventory entry only for approved dealers (§16) | Inventory screens sit inside the dealer's Home stack, open to every dealer | Conflicts |
| IMS with its own interface (§17, §18) | Stores, suppliers, inventory list, stock movements, low-stock notification, dealer analytics; no products/SKUs, storage locations, reports, reconciliation, settings, or own shell | Partial |
| Stock reduced at **dispatch**, idempotent, auditable (§19–§21) | No `dispatched` status. Stock is committed at **confirm** (`commit_stock_on_confirm`, migration `20260927090000`, local only), once per status change | Conflicts |
| Manual stock in/out/adjust with reasons (§22, §23) | `adjust_stock` with types addition/reduction/adjustment/sale/restock/correction | Partial |
| Movement sources (§24) | No source enum, no order reference on a movement | Missing |
| Reconciliation (§25) | None | Missing |
| Multi-sided buying (§26–§29) | Any non-owner farmer, buyer or dealer can buy; sellers must be farmer or dealer (`is_seller_role`) | Done |
| Messaging relationships (§30) | Conversations between any two users | Done (too open, see next row) |
| Messaging only on a legitimate relationship, server-side (§31) | Insert policy only checks that the caller is a participant: anyone can open a chat with anyone | Conflicts |
| Scan Disease for farmers, AI via API (§32) | Farmer-only upload → FastAPI MobileNetV2 (38 classes) → result; failure falls back to Retry and "Talk to an expert" | Done |
| AI report: symptoms, cure/treatment, precautions, advisory (§33) | `description` and `recommended_actions` only | Partial |
| Full AI report travels with the consultation (§34, §35) | Consult prefills subject, text and photo; the consultation has no link to the disease case | Partial |
| Expert assessment distinct from AI (§36) | Free-text consultation messages only | Missing |
| AI failure isolated (§37) | Model load failure → 503, marketplace unaffected | Done (not tested as an isolation property) |
| Modular directories (§38–§42) | Layered: `src/screens/<domain>`, `src/components/features/<domain>`, `src/services/modules/<domain>`, `src/hooks/api`; backend `app/{api,services,repositories,schemas,core,ml}` | Conflicts |
| Central theme and accents (§43, §44) | `src/theme/` with colors, typography, spacing, role/module/status accents, dark palettes; no `dimensions`, `borders`, `components` files; some screens still hard-code values | Partial |
| Supabase DB and Storage; Git for code only (§45, §46) | As specified; model weights fetched, not in git | Done |
| Layered separation (§47) | Screens → hooks → services is gated (`check_reality.py` layer-boundary); backend endpoints → services → repositories | Done (to be re-expressed per module) |
| Inventory ↔ marketplace through a controlled service (§48) | Order code calls stock functions directly | Missing |
| Audit logging (§51) | Every admin write route leaves an `audit_logs` row (test-enforced); no dealer/expert application events yet; inventory has `inventory_transactions` | Partial |

## 3. Decisions to confirm

| # | Decision | Recommended default | Why |
|---|---|---|---|
| D1 | Where features used by several roles live (marketplace, cart and orders, payments, reviews, messaging, notifications, consultations, auth, profile). SRDS §38 lists only role modules, `ai`, `inventory` and `common`, and §42 keeps business logic out of `common` | Add one more top-level module, **`platform/`**, with one sub-folder per shared domain. Role modules (`farmer/`, `buyer/`, …) hold role-only screens and compose `platform/` | Putting commerce in `common` turns it into a dumping ground; copying it into three role folders breaks §53.33 |
| D2 | Frontend root | Rename `src/` to `frontend/`; keep the Expo project files (`package.json`, `app.config.ts`, `index.js`) at the repository root | Least churn for Expo, EAS, CI and the Supabase CLI; SRDS layout is still met |
| D3 | Backend package | One package, `backend/app/`, containing the SRDS folders (`app/admin/`, `app/ai/`, `app/inventory/`, `app/common/`, `app/auth/`, `app/database/`, `app/storage/`, `app/middleware/`, `app/config/`, `app/main.py`) | Top-level Python packages named `ai`, `common`, `config`, `database` collide with other libraries |
| D4 | Tests | Mirror modules, where each tool requires: `backend/tests/<module>/`, frontend tests beside the code they test inside each module, pgTAP in `supabase/tests/database/<module>_*.test.sql` (the Supabase CLI requires that folder), cross-stack real-path tests in top-level `tests/<module>/` | SRDS §38 intent without breaking the tools |
| D5 | Order lifecycle with dispatch | `pending → confirmed → processing → ready → dispatched → completed` (plus rejected, cancelled, expired, payment_failed, disputed, refunded). Confirm checks availability but deducts nothing; dispatch deducts | SRDS §20 order of words differs, but the seller must accept (confirm) before processing |
| D6 | Stock short at dispatch | Block the dispatch with "Not enough stock: needs N, have M" and a shortcut to Stock In | The dealer must reconcile before goods leave |
| D7 | How sync runs (§21, §48, §53.39) | Dispatch writes an `inventory_sync_events` row (unique per order line) in the same transaction; the inventory integration service applies it at once, idempotently; if the inventory side is down the event stays pending, is retried, and is visible to the dealer. A shortage known before dispatch still blocks it (D6) | Transaction-safe, idempotent, auditable, and an inventory outage cannot stop the marketplace |
| D8 | Marketplace availability for dealer listings | A dealer listing is linked to an IMS product; its availability shows In stock / Low / Out of stock from that product; Add to Cart is disabled at zero | Keeps what buyers see honest after local sales |
| D9 | Farmer→farmer and dealer→dealer buying (§29 "subject to rules") | Allowed (as today); only buying from yourself is refused | Simplest rule that meets §29 |
| D10 | Experts buying | Experts have no marketplace access (as today) | Not in the SRDS participant model |
| D11 | What a PENDING or REJECTED dealer/expert can do | Sign in, see an Application Status screen (submitted details, documents, status, reason if rejected), edit and resubmit when rejected; nothing else | SRDS blocks protected functions; resubmission avoids new accounts for a missing document |
| D12 | Source of the AI report text (symptoms, treatment, precautions, advisory) | A curated **disease knowledge base** keyed to the model's 38 classes, entered by the admin as reference data and reviewed by a qualified expert; no LLM | Correct, reviewable agronomy; an LLM is an outside service needing a brief (G14 below) |
| D13 | Messaging start points (§31) | A conversation can start only from a listing inquiry, an order, or a consultation, recorded on the conversation (`context_type`, `context_id`) and checked by the database | Meets §31; covers every pair in §30 |
| D14 | Storage locations in the IMS | Existing `dealer_stores` become IMS storage locations (a shop, godown or shelf the dealer owns) | Reuses data; dealer-owned storage is not ZaraiLink logistics (§53.37) |
| D15 | Registration location fields | Free-text country (default Pakistan), province, city, village (farmer), address | The reference geography tables were dropped by your earlier decision |

## 4. Phases

Every phase: starts from a task card, runs plan mode first when it touches auth, RLS or migrations, validates
migrations with `npx supabase db reset` and two-user proofs, updates `docs/status/feature-register.md` in the same
change, ends with a fresh-context verifier (implementer never signs off), and leaves changes uncommitted.
Skills follow the table in `CLAUDE.md`.

### R0 — Baseline and freeze
**Goal:** a committed, green starting point before anything moves.
- Maintainer reviews and commits the uncommitted P7 work on `chore/expo-cng` (about 440 paths) and the three local
  guard migrations `20260927080000`, `…090000`, `…100000`. Their confirm-time stock trigger is superseded in R5;
  decide whether to push them to the hosted project now or hold until R5.
- Record the SRDS gap table (section 2) as rows in the feature register; add `docs/status/srds-traceability.md`.
- Run every gate on the committed tree (lint, typecheck, jest, pytest, pgTAP, policy mutation, reality gate, CI).
**Exit:** clean working tree, green CI, register and traceability matrix committed.

### D0 — Design prototype (in parallel with R0 and R1, no code)
**Goal:** the Claude Design prototype for the whole SRDS, including the separate IMS.
- Review it against this plan and the SRDS; record accepted tokens and components for R2 and screen specs for R3–R10.
**Exit:** approved prototype, a screen list mapped to modules, and token values.

### R1 — Module restructure (behaviour unchanged)
**Goal:** the SRDS §38–§42 layout, with D1–D4, and nothing else changed.
- Frontend: `src/` → `frontend/` with `admin/`, `farmer/`, `dealer/`, `buyer/`, `expert/`, `ai/`, `inventory/`,
  `platform/` (D1), `common/`, `theme/`, `navigation/`, `services/`, `state/`, `hooks/`, `utils/`, `assets/`,
  `config/`. Each module has `screens/`, `components/`, `services/`, `hooks/`, `types/` and one public `index.ts`.
  Mapping: disease screens and service → `ai/`; stores, suppliers, inventory and transactions → `inventory/`;
  dealer dashboard → `dealer/`; farms and crops → `farmer/`; expert dashboard, application, analytics → `expert/`;
  expert list, request, consultation list and detail → `platform/consultations/`; `components/ui` → `common/components`;
  Zustand stores → `state/`; `src/hooks/api/<domain>` → the owning module's `hooks/`.
- Backend: package-by-module inside `backend/app/` (D3); each module has `router.py`, `service.py`,
  `repository.py`, `schemas.py`; `core/` splits into `auth/`, `database/`, `middleware/`, `config/`, `common/`;
  `ml/` moves under `ai/`.
- Moves use `git mv` so history follows; one scripted codemod rewrites imports.
- Tooling follows the move: `tsconfig`, Jest roots and `jest.flashlist.js`, ESLint, knip, `check_reality.py` scopes,
  OpenAPI generator output, CI paths, lefthook, `AGENTS.md` "Where things go".
- New strict gate rule **module-boundary**: a module imports only its own files, `common/`, `theme/`, `services/`,
  `state/`, and other modules' `index.ts`; backend modules call each other only through their `service.py`.
  `supabase/config.toml` stays where the CLI needs it (SRDS `supabase/config/` noted as not possible).
**Exit:** zero behaviour change: every existing test passes unchanged except imports, realstack jest passes, the app
bundles and opens on the emulator, OpenAPI unchanged, reality gate green with the new rule at zero.

### R2 — Design system from the prototype
**Goal:** SRDS §43–§44 theme and the shared component set.
- `theme/` gains `dimensions.ts`, `borders.ts`, `components.ts`; tokens from D0; role and module accents stay
  (`roleColors`, `moduleAccents`, `statusColors`) with an added stock-status set.
- `common/components` rebuilt to the prototype (buttons, inputs, cards, badges, sheets, charts, tables, skeletons,
  empty and error states, offline banner, KPI cards).
- New gate rule **raw-style**: no hex colours or raw font sizes outside `theme/` (ratchet, burned to zero).
**Exit:** light and dark snapshots of the component catalogue; gate at zero.

### R3 — Accounts, registration and approval (auth, RLS, migrations: plan mode)
**Goal:** SRDS §4–§13, §50, §53.1–§53.9.
- Registration forms per role (D15). Dealer: account, business name, address, location, type, registration
  number, documents. Expert: specialization, years of experience, institution affiliation, documents.
- Data: `dealer_applications` (or `dealers`) with `verification_status`; `required_documents` reference table per
  role (admin-configurable, §7); document rows per application; private `dealer-documents` bucket; experts gain
  institution and years fields.
- Server-side status: database helpers `is_approved_dealer()` / `is_approved_expert()` used in every dealer, expert
  and inventory policy; FastAPI dependencies `require_approved_dealer` / `require_approved_expert`. A pending or
  rejected account reaches only the Application Status screen (D11).
- Admin queues: Dealer Applications and Expert Applications with document viewer, approve, reject with reason,
  suspend, reactivate; each writes an audit row (§51).
- Approval email (§9): sent on approval by the backend email service; built against local Mailpit; hosted blocked
  on G1. The app then asks the user to sign in again, and the server re-reads status on every request so a stale
  session gains nothing.
- Admin account security: change email (confirmation email, G1 on hosted) and password, two-factor.
- Existing dealers and experts: a migration sets their status (decision at R3 planning: approve existing or reset
  to pending; local data only).
**Exit:** two-user proofs for pending vs approved dealer (listing, orders, inventory API and RLS) and expert
(workspace, consultations); forged admin sign-up still refused; approval email visible in Mailpit; pgTAP, mutation,
smoke and realstack tests.

### R4 — Inventory boundary and IMS data and API (RLS, migrations: plan mode)
**Goal:** §15–§18, §22–§25, §41, §49, §50 inventory rules.
- Remove the admin branch from `inventory`, `inventory_transactions`, `dealer_stores`, `suppliers` SELECT policies
  and from any admin analytics that read them.
- Data model: products/SKUs (`inventory_products`: SKU, name, category, unit, cost, price, reorder threshold,
  optional marketplace listing link), storage locations (D14), stock per product and location, movements with a
  `source` enum (`ZARAILINK_ORDER`, `LOCAL_SALE`, `PURCHASE`, `RESTOCK`, `MANUAL_ADJUSTMENT`, `DAMAGE`, `EXPIRY`,
  `TRANSFER`, `OTHER`), direction, quantity before and after, reason, actor, optional order reference; suppliers;
  purchase and restock records; alert settings.
- `backend/app/inventory/` API: dashboard figures, products, stock, locations, transfers, movements, manual
  adjustments, alerts, purchase/restock, reports (stock summary, valuation, movements by source, low and out of
  stock, reconciliation §25), analytics, settings. All `require_approved_dealer`, own data only.
- Marketplace availability (D8) is read through a narrow inventory integration service with a timeout; if it
  fails the listing shows "availability unknown" and the marketplace keeps working (§53.39).
**Exit:** two-dealer proof (dealer A never reads or writes dealer B's anything), admin gets nothing from inventory
tables or routes, reconciliation adds up on a scripted scenario, inventory API down → marketplace still browses and
orders.

### R5 — Dispatch and inventory synchronisation (migrations: plan mode)
**Goal:** §19–§21, §48, §53.14–§53.15, D5–D7.
- Add `dispatched` to `order_status`; seller-only transition `ready → dispatched`; history row; notification.
- Remove the confirm-time stock commit (`commit_stock_on_confirm`); confirm only checks availability.
- Dispatch writes `inventory_sync_events` (unique on order line) in the same transaction; the integration service
  applies each event once, creating a `ZARAILINK_ORDER` movement with the order id; replays are no-ops; failures
  are retried and shown to the dealer.
- Shortage at dispatch blocks the move (D6).
**Exit:** tests: dispatch deducts once; replaying the event, double-clicking dispatch and concurrent dispatch
deduct once; cancelling before dispatch deducts nothing; inventory side down → dispatch succeeds, event pending,
applied on recovery; every deduction has a movement with the order id. PostgREST and API agree.

### R6 — Inventory Management System app
**Goal:** §16–§18, §22–§25 on screen, §53.13.
- Dealer dashboard tile "Inventory Management — Open Inventory System", shown only to approved dealers.
- A separate navigator (own shell, header, navigation, alert centre, "Back to ZaraiLink" exit): Dashboard (§18
  figures and trends), Products/SKUs, Stock, Storage Locations, Suppliers, Stock Movements, Stock In / Stock Out /
  Adjustment (with reasons and sources), Low-stock Alerts, Purchase/Restock Records, Reports, Analytics,
  Reconciliation, Settings.
- Offline: reads from cache; writes fail clearly (no silent queue) unless a later decision adds one.
**Exit:** the IMS flows run end to end on the emulator against the real stack; airplane-mode script extended to the IMS.

### R7 — AI report and AI-assisted consultation
**Goal:** §32–§37, §40, §53.21–§53.25, §53.38.
- Knowledge base (D12): per class symptoms, treatment, precautions, general advisory; admin-managed with audit
  ("AI Configuration Changed").
- AI report screen shows disease, confidence, symptoms, treatment, precautions, advisory and the disclaimer.
- `consultations.disease_case_id`; consulting from a report attaches it; the expert sees the AI case summary (§35).
- `consultation_assessments`: the expert's professional assessment (agree, correct, additional diagnosis,
  recommendations, request information), shown apart from the AI assessment.
- Admin: AI activity view (scans, failures, low-confidence share, referrals).
- Isolation tests: AI service down → marketplace, orders, payments, messaging, inventory and expert accounts unaffected.
**Exit:** farmer scan → report → consult → expert sees the full case → expert assessment → farmer sees both, on the
emulator with the real API; two-user proofs on who can read a case.

### R8 — Commerce participants and messaging authorization (RLS: plan mode)
**Goal:** §26–§31, §53.17–§53.20, D9, D10, D13.
- Keep and test the buying matrix (buyer, farmer and dealer buy from farmer and dealer sellers; never from
  themselves; experts and admin do not buy).
- Conversations carry a context (listing, order, consultation) checked by the database; farmer ↔ expert
  communication runs in the consultation thread.
**Exit:** two-user proofs for each allowed pair and a refused unrelated pair, through both the API and PostgREST.

### R9 — Admin moderation completeness
**Goal:** §14, §51, §53.10.
- Moderation surfaces for consultations, AI activity, reviews and every order administrative action; every one
  audit-logged with the §51 event names; the admin dashboard shows the queues.
**Exit:** the audit-coverage test lists every admin write; no admin route touches inventory.

### R10 — UI/UX rollout and accessibility
**Goal:** the prototype on every remaining screen; WCAG 2.2 AA; low-literacy patterns; usability test with real
farmers, buyers and dealers.
**Exit:** the accessibility script passes on the emulator; usability results written up.

### R11 — Hardening and release
**Goal:** the old P10–P14 scope that still applies: test completion, CI (pgTAP, advisors and realstack in CI),
error tracking (G5), backups (G3), release signing and EAS (G13), documentation and the FYP report, store readiness.
Push notifications stay out of scope unless you add them (they are not in the SRDS).

## 5. What carries over from the old plan

| Kept as is | Folded into this plan | Superseded |
|---|---|---|
| P0–P7 results: Expo CNG, CI gates and reality ratchets, security fixes, JWT/JWKS auth, error contract and codes, idempotency, pagination, OpenAPI and generated client, React Query data layer, offline banner, ErrorBoundary, photo compression, FlashList, pgTAP suite and policy mutation, database guards on orders, payments and consultations | P8 → R2 and R10; P9 → R7; P11–P14 → R11 | The confirm-time stock commit (R5); the layered `src/` layout (R1); dealer access without approval (R3); admin read access to inventory (R4) |

## 6. Outside services and gates

| Gate | Needed for | Status |
|---|---|---|
| G1 Email (SMTP) | Approval emails, admin email change, sign-up and reset on the hosted project | Brief exists (`docs/process/briefs/g1-smtp.md`); built against local Mailpit until provided |
| G2 SMS | Phone sign-in | Out of scope unless you add it |
| G3 Backups | Hosted database backups | Brief exists |
| G5 Error tracking | App and API crash visibility | Brief exists |
| G13 EAS | Store builds | Brief exists |
| G14 LLM (only if D12 changes) | AI-generated advisory text | Needs a brief; not needed with the knowledge base |

No `supabase db push` to the hosted project without your approval in that moment.

## 7. Traceability (SRDS §53)

| Phase | §53 rules |
|---|---|
| R1 | 26, 27, 28, 33, 34 |
| R2 | 29 |
| R3 | 1–9, 40 |
| R4 | 11, 12, 16, 39 |
| R5 | 14, 15 |
| R6 | 13 |
| R7 | 21–25, 38 |
| R8 | 17–20 |
| R9 | 10 |
| Kept and re-tested every phase | 30–32, 35–37 |

## 8. Risks

- **R1 on an uncommitted tree:** moving every file on top of about 440 uncommitted paths risks losing work. R0 first.
- **Scope:** the IMS (R4–R6) is the largest new area; cut reports and analytics to a first set if the FYP timeline
  needs it, never the boundary or sync rules.
- **RLS changes (R3, R4, R8)** can lock out legitimate users; every change ships with allowed and rejected proofs
  and policy mutation stays at zero survivors.
- **AI content (R7):** disease advice must be reviewed by a qualified expert before release.
- **Email (G1):** approval emails cannot reach real users on the hosted project until SMTP is provided.
