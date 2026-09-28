# Plan A — ZaraiLink E-Commerce Platform

> Part of the plan of record ([`docs/plan.md`](plan.md)); requirements in [`docs/srds.md`](srds.md). Covers the main
> platform: accounts and approval, marketplace and orders, messaging, AI advisory and expert consultation,
> administration, the modular restructure and the design system. The dealer's private inventory system is Plan B
> ([`docs/plan-inventory.md`](plan-inventory.md)); this plan only produces what Plan B consumes (dealer approval,
> the dispatch event, the dashboard entry point).
>
> Lane names, folder ownership, contracts and decisions are defined in `docs/plan.md` §3–§6.

## 1. Where the repository stands, module by module

Legend: **Keep** (works, moves as is), **Change** (works, must change to meet the SRDS), **Build** (missing),
**Remove** (contradicts the SRDS).

### Accounts, registration and approval (SRDS §3–§13, §50)

| SRDS requirement | Today | Verdict |
|---|---|---|
| Five roles; public sign-up offers Farmer, Buyer, Dealer, Expert; never Admin | `user_role` enum has five roles; `handle_new_user` allow-lists four; admin only through `docs/process/admin-bootstrap-runbook.md`; proven by pgTAP and smoke tests | Keep |
| Farmer and Buyer registration fields (country, province, city, village, address) | Sign-up takes name, email, password, role; location is one free-text field on Edit Profile | Change |
| Dealer registration: business name, address, location, type, registration details, configurable documents | Nothing: a dealer is active at sign-up | Build |
| Expert registration: specialization, years of experience, institution affiliation, documents | `experts` + `expert_verifications` + `expert-documents` bucket; application filled after sign-up; one document | Change |
| PENDING / APPROVED / REJECTED / SUSPENDED enforced server-side | `verification_status` for experts only; `profiles.is_suspended` for all; pending expert can open the workspace | Change |
| Approval email, then log in again | No email; local Mailpit works for auth mail; hosted blocked on G1 | Build (G1) |
| Admin approval queues with document review | `ExpertVerificationScreen`; no dealer queue | Change |
| Admin changes own email and password | Change password and two-factor exist; no email change | Change |

### Marketplace, orders, payments, reviews (SRDS §26–§29, §19–§20 producer side)

| SRDS requirement | Today | Verdict |
|---|---|---|
| Buyers buy from farmers and dealers; farmers buy from dealers; dealers buy from farmers | Any non-owner farmer, buyer or dealer can buy; sellers must be farmer or dealer; database guards enforce prices, one line per listing, one open payment | Keep |
| Order lifecycle with **dispatched**; stock leaves at dispatch | No `dispatched`; stock is committed at confirm (`commit_stock_on_confirm`, local migration, not pushed) | Change |
| Delivery charge is its own line; no escrow; no logistics | Enforced in API and database | Keep |
| Payments (manual COD and bank transfer) | Buyer opens, seller decides, database guards | Keep |
| Reviews only for completed orders and listings the order contained | Enforced | Keep |

### Messaging and notifications (SRDS §30–§31)

| SRDS requirement | Today | Verdict |
|---|---|---|
| Buyer↔Dealer, Buyer↔Farmer, Dealer↔Farmer, Farmer↔Expert | Any two users can chat; expert talk happens in consultation threads | Keep (relationships) |
| Conversations only on a legitimate relationship, authorized server-side | Insert policy only checks the caller is a participant | Change |
| Notifications for platform events | Nine event triggers; realtime; in-app only | Keep, extend |

### AI disease advisory and expert consultation (SRDS §32–§37)

| SRDS requirement | Today | Verdict |
|---|---|---|
| Farmer scans (camera/gallery) → AI API → report | The app offers the flow to farmers; the API accepts any signed-in role; MobileNetV2, 38 classes; photos compressed; model in Supabase Storage | Keep (API roles decided in A6) |
| Report: disease, confidence, symptoms, treatment, precautions, advisory, disclaimer | Disease, confidence, description, recommended actions, disclaimer | Change |
| Full AI report travels with the consultation; expert sees a case summary | Consult prefills text and photo; no link to the case | Change |
| Expert assessment kept apart from the AI assessment | Free-text messages only | Build |
| AI failure never affects the rest | 503 with retry and "Talk to an expert"; not tested as isolation | Change (prove) |

### Administration and audit (SRDS §14, §51)

| SRDS requirement | Today | Verdict |
|---|---|---|
| Moderate farmers, buyers, dealers, experts, applications, products, listings, orders, reviews, reports, consultations, AI activity, content, suspensions | Users, listings, experts, reports, categories, reference data, platform orders, disputes, audit log; no consultations, AI activity or dealer applications | Change |
| Every admin action audit-logged | Test-enforced for every admin write route | Keep, extend |
| Admin has no inventory access | Admin can read inventory, stores and suppliers | Remove (Plan B, B0) |

### Structure, theme and infrastructure (SRDS §38–§47)

| SRDS requirement | Today | Verdict |
|---|---|---|
| Top-level modules admin, farmer, dealer, buyer, expert, ai, inventory, common, theme | Layered: `src/screens/<domain>`, `src/components`, `src/services/modules`, `src/hooks/api`; backend `app/{api,services,repositories,schemas,core,ml}` | Change |
| Centralised theme with dimensions, borders, components | `src/theme` has colors, typography, spacing (+radii, shadows), motion, accents; no dimensions, borders or components files; 74 raw sizes, 24 raw border widths | Change |
| Layered separation, controlled cross-module calls | Screens → hooks → services gated; no module gate | Change |
| Supabase for data and files; GitHub for code only | Model weights in the private Supabase bucket `ml-models` (D13); GitHub release and old history copies removed | Keep |

## 2. Phases

Each phase lists its lanes. Lanes in one phase run in parallel; "needs" names what must exist first (a contract,
or an earlier lane in the same phase). Every lane ends with its own tests green and evidence in its task card;
the phase ends with the integration checkpoint and a `zl-verifier` sign-off.

### A0 — Baseline and readiness

**Goal:** a committed, green, runnable starting point.

| Lane | Tasks | Done when |
|---|---|---|
| maintainer | Test and merge PR #11; add the `MODEL_WEIGHTS_URL` repository secret; free the local Supabase ports (`net stop winnat; net start winnat` as Administrator); decide whether to push the pending migrations to the hosted project | `main` green on GitHub; `npx supabase start` works |
| `zl-orchestrator` | Write `docs/status/srds-traceability.md` (every SRDS section → requirement → phase → test); add one feature-register row per Build/Change item in §1 (and Plan B §1) | Matrix and register committed |
| `zl-devops` | CI job summary lists skipped jobs; confirm the model fetch uses the secret | CI shows the model downloaded from Supabase |

**Exit:** clean tree, green CI, traceability matrix, local stack and emulator run.

**Status (2026-09-27): done, verified with findings (all fixed).** PR #11 merged (5e963f8); CI green on `main` (run
36273648403) with the model downloaded from Supabase and checksum-verified; `npx supabase test db` 486/486 locally;
the app runs signed in on the Pixel_8 emulator against the local stack; traceability matrix and register rows
written. Closes when the maintainer commits these documents and CI is green after the push (the new job summary
first runs then). Open maintainer items that do not block A1: the Dependabot copy of `MODEL_WEIGHTS_URL`, GitHub
Support for PR refs #1–#3.

**Hosted project (2026-09-27, the maintainer's decision):** brought level with the repository: 55 migrations with the
reference data (`npx supabase db push --include-seed`, checked through the Supabase MCP) and the Auth configuration
(`npx supabase config push`; gate G1 decided: Gmail SMTP, `docs/process/briefs/g1-smtp.md`). A test password-reset
email was accepted by the hosted project; its arrival is not yet confirmed. Known effect until A3: a password change
from a session older than 24 hours fails in the app (Supabase now asks for reauthentication and the app's code step is
parked with A3); signing in again works around it.

**Found after A0 (2026-09-27) — expert self-approval. Fixed 2026-09-27** (PR #14, migration `20260928090000_admin_write_scope.sql`, pushed to the hosted project 2026-09-27 (56 migrations, advisors unchanged)): an expert can insert their own `experts` row
already `approved` through PostgREST and then appears as a verified expert (the verification guard fires on UPDATE
only), and an admin without a second factor can change `verification_status` directly, unaudited. Both held on the
hosted project until the push. The fix: the guard on INSERT and UPDATE, `is_admin_aal2()` in the guard and
the policy's admin branch, an admin held to the decision column, experts inserting only `(expert_id, document_url)`
into verification records, and pgTAP for each refused path. Residuals found by its verification are in the feature
register ("Admin write scope: known residuals", A7).

**Found in A0 verification — BR-15 defect. Fixed 2026-09-27** in the same migration (PR #14, hosted too), as designed below (edit and delete match the owner; admin status moderation only, with a second factor, audited; a guard holds a non-owner to the status column): an admin can edit or delete any listing through
`PATCH`/`DELETE /api/v1/marketplace/listings/{id}` with no audit row and no second factor, because
`listings_owner_update` and `listings_owner_delete` allow `is_admin()` (see the feature register). The admin's own
moderation route (`PATCH …/listings/{id}/status`, audited, `require_admin` without a second factor) writes through
the same policy with the admin's token, so simply dropping `is_admin()` would break moderation. Decide in plan mode
(`zl-db` with `zl-commerce`): for example, the API refuses edit and delete by anyone but the owner; the policies let
the admin change only `status` (a guard trigger) and only with a second factor (`is_admin_aal2()`, matching the other
admin writes); the `/status` route moves to `require_admin_aal2`. Proof: pgTAP and a two-user smoke test (owner
allowed; admin edit or delete and another user refused; admin status change audited).

### A1 — Modular restructure (no behaviour change)

**Goal:** the layout in `docs/plan.md` §2, and nothing else changes.

This phase has one serial step, because moving every file at once cannot be split, followed by parallel lanes.

| Step | Lane | Tasks | Needs |
|---|---|---|---|
| A1.1 (serial) | `zl-backend-core` + `zl-app-core` pair | One scripted `git mv` pass (history follows) and one import codemod: `src/` → `frontend/` with the module map below; backend layered folders → module folders; update `tsconfig`, Jest roots and setup files, ESLint, knip, `check_reality.py` scopes, OpenAPI generator output, CI paths, lefthook, `AGENTS.md` "Where things go" | A0 |
| A1.2 (parallel) | every module lane | In its own folder: `index.ts` public API; replace deep imports from other modules with their `index.ts`; backend `router.py/service.py/repository.py/schemas.py`; move its tests; a short `README.md` (what it owns, public API, tables it uses) | A1.1 merged |
| A1.3 | `zl-backend-core` | New strict gate rule `module-boundary` (frontend and backend) at zero; `scripts/test_check_reality.py` cases for it | A1.2 merged |

Module map for A1.1 (current → target):

| Current | Target |
|---|---|
| `screens/auth/*`, `screens/common/{Splash,Suspended,ResetPassword}` | `common/auth/screens` |
| `screens/profile/*` | `common/profile/screens` |
| `screens/marketplace/*` | `common/marketplace/screens` |
| `screens/orders/*` | `common/orders/screens` |
| `screens/payments/*` | `common/payments/screens` |
| `screens/reviews/*` | `common/reviews/screens` |
| `screens/messaging/*`, `screens/notifications/*` | `common/messaging/screens`, `common/notifications/screens` |
| `screens/expert/{ExpertList,ExpertProfile,RequestConsultation,ConsultationList,ConsultationDetail}` | `common/consultations/screens` |
| `screens/expert/{Dashboard,ExpertApplication,Analytics}` | `expert/screens` |
| `screens/farmer/*` | `farmer/screens` |
| `screens/buyer/*` | `buyer/screens` |
| `screens/dealer/{Dashboard,Analytics}` | `dealer/screens` |
| `screens/dealer/{Inventory,InventoryTransaction,StoreList,StoreDetail,SupplierList,SupplierDetail}` | `inventory/screens` (rebuilt in Plan B) |
| `screens/disease/*` | `ai/screens` |
| `screens/admin/*` | `admin/screens` |
| `screens/HomeDashboardScreen.tsx` | `navigation/` (role switch) |
| `components/ui/*` | `common/components` |
| `components/features/<domain>` | the owning module's `components/` |
| `services/modules/<domain>`, `hooks/api/<domain>`, `types/<domain>` | the owning module's `services/`, `hooks/`, `types/` |
| `services/api`, `services/supabase`, `api/generated` | `services/` (generated client under `services/api/generated`) |
| `hooks/api/{queryClient,keys}`, `hooks/realtime` | `hooks/` |
| `store/*` | `state/` |
| `constants/*` | `common/constants` |
| backend `api/v1/endpoints/<d>.py` + `services/<d>_service.py` + `repositories/<d>_repository.py` + `schemas/<d>.py` | `backend/app/<module>/` or `backend/app/common/<feature>/` (`router.py`, `service.py`, `repository.py`, `schemas.py`) |
| backend `core/auth.py`, `core/jwt_verifier.py` | `backend/app/auth/` |
| backend `core/supabase_client.py` | `backend/app/database/` |
| backend `core/{middleware,rate_limit,request_context}.py` | `backend/app/middleware/` |
| backend `core/config.py` | `backend/app/config/` |
| backend `core/{errors,problem_details,pagination,idempotency,openapi,rows,logging_config,observability}.py` | `backend/app/common/` |
| backend `ml/`, `services/{ai_engine,disease_service}.py` | `backend/app/ai/` |

**Exit:** every existing test passes with imports changed only; the real-stack suites pass; OpenAPI unchanged; the
app bundles and opens on the emulator; `module-boundary` at zero.

**Status (2026-09-28): built and verified (four rounds; every finding fixed or recorded as a known limit), awaiting
the maintainer's merge.**
Run as one scripted pass instead of the three
lane steps above (maintainer's decision, 2026-09-27), on branch `a1/restructure` in three commits:
1. The contract preparation: four duplicate schema class names renamed, so that `backend/openapi.json` holds no
   module-path names.
2. The pure move: 494 renames by `scripts/a1/restructure.py move`, from `scripts/a1/module-map.json`, with the
   explicit list in `scripts/a1/moves.json`.
3. The rewrite:
   - imports, config and CI paths;
   - the strict `module-boundary` rule with its tests;
   - checks that fail loudly if a path moves again: zero scanned files, a stale baseline key, a missing generated
     client, zero coverage statements, `scripts/test_ci_paths.py`;
   - the module READMEs and the docs.

Behaviour-preserving edits, the only ones that are not path changes:
- admin and analytics read orders through `common.orders.service` (`fetch_all_orders`, `read_orders_for_user`,
  without the stale-order sweep, as before);
- consultations look up an expert through `expert.service.find_expert`;
- `useInvalidateOrders` moved to `frontend/hooks/invalidation.ts`, and `useOrderPaymentContext` moved from the
  payments hooks to the orders hooks (unchanged code). Together they break the one orders↔payments cycle through a
  barrel.

Evidence, in the maintainer's repository:

| Check | Result |
|---|---|
| `tsc` and lint | clean |
| Reality gates | pass; `module-boundary` and `layer-boundary` at 0; knip, ESLint, ruff and mypy counts unchanged (27, 16, 53, 0) |
| Jest | 858 passed, 16 skipped |
| Backend unit | 197 |
| Gate and script tests | 145 (107, plus 38 for the verifier's findings) |
| pgTAP | 520, unchanged |
| Backend real stack (`tests/integration`) | 387 passed, 3 skipped |
| App real stack | 16 of 16 |
| `backend/openapi.json` | byte-identical (`export_openapi.py --check`) |
| `api:check` | clean |
| `expo export` | bundles 3,322 modules |

On the Pixel_8 emulator against the local stack, each of farmer, buyer, dealer, expert and admin signed in, saw
their home screen and signed out. The moved screens tried were marketplace, disease advisory, consultations,
inventory, dealer and expert analytics, admin orders and the audit log; the session's 31 API calls all returned 2xx.

Folder ownership added: `common/analytics` and frontend `common/reference-data` go to `zl-commerce`, `testUtils/`
to `zl-app-core`.

**Verification (`zl-verifier`, 2026-09-28): four rounds, verified with findings; each fixed or recorded below.**
- The verifier found no behaviour change:
  - all 2,242 frontend import bindings resolve to the same definitions as before the move;
  - the only Python binding changes are the repository-to-service swaps above;
  - test collection counts match `34c6f3a` exactly.
- Round 1 findings and fixes:
  - **F1 (medium).** Ten import forms passed `module-boundary` unseen: `require()`, `import()`, a bare `import '…'`,
    a deep import in `App.tsx`, a namespace import of a barrel in a screen, a module importing its own barrel, a
    runtime import hidden by the `type` of the line before (no semicolons), and on the backend `import app.x`,
    relative imports and `from app import x`. None occurred in the code; the rule now catches each.
  - **F1b.** The scan guard now needs at least one scanned `frontend/` file; `App.tsx` alone does not count.
  - **F2.** The backend real-stack count was mislabelled (584 is unit plus real stack); corrected above.
  - **F3.** Nine old paths left in comments and a setup doc; corrected.
  - **F4.** The §47 traceability row now names every cross-module read and the one cross-module write.
  - **F5.** The `useOrderPaymentContext` move is now listed above.
- Round 2 confirmed those fixes and found more forms (F7, low); none occurred in the code:
  - an `import()` or `require()` whose argument is not one plain quoted string, and an escaped specifier: the gate
    cannot tell where these lead (Metro still can), so it now refuses them;
  - quoted import names (`import { 'a' as b }`), and a regular expression such as `/^\/*/` read as the start of a
    comment that hid the rest of the file;
  - shared code re-exporting a module's exports (through `navigation/`);
  - on the backend, a module's repository reached through its service (`from app.farmer.service import repo`,
    `farmer_service.repo.…`), a module file reached as an attribute, and `importlib` / `__import__`;
  - old flat file names (`disease_service.py`, `ai_engine.py`) in comments and architecture docs; corrected.
- Round 3 confirmed those fixes: the gate's import reader agrees with Babel's on all 232 production files. It found:
  - a regression from the regular-expression fix (a JSX `} /><Text>{'km/h'}` left the reader inside a string until a
    URL further down was read as a comment); a quoted string now ends at its line, and `}` no longer starts a
    regular expression;
  - false alarms on UI copy ("Documents we require (CNIC …)"); a computed `import(`/`require(` now counts only in
    code position, and a model a service imports from a schemas module stays reachable through it;
  - a two-step re-export in shared code (`import { x } from '../farmer'`, then `export { x }`) and
    `builtins.__import__`, now refused; two old paths in `backend-architecture.md`, corrected.
- Round 4 confirmed those fixes and closed the hardening: one form remained outside the known limits, a computed
  `import(FARM)` straight after `if (…)`, now counted. Everything else it found is caught by lint or the ESLint
  ratchet, cannot be bundled, or falls inside the limits below.
- Every form the verifier found has a case in `scripts/test_check_reality.py` that fails on the rule as it stood
  before the fix.
- **Known limits.** The rule reads imports; it does not follow values. These still pass: shared code that imports a
  module's function and hands it on as a value (`export const f = x`, `export default x`), a `/` after `x++` read as
  the start of a regular expression (the misread stays on its line), and on the backend `sys.modules[…]`,
  `getattr(service, "repo")` or a service bound to a second name. In the other direction, import-shaped text inside
  a string fails the gate, and so does UI copy with a lowercase `import (` or `require (` after punctuation or at the
  start of a line ("Step 2: import (CSV) …"); the strict rule has no suppression, so reword such copy. The older
  `layer-boundary` text rule still reads comments in `screens/` and `components/`. The rule is a tripwire for the
  common mistakes, not a proof; review still applies.

### A2 — Design system and app shell

**Goal:** SRDS §43–§44 theme and a shared component set, from the approved Claude Design prototype.

| Lane | Tasks | Needs |
|---|---|---|
| `zl-app-core` (theme) | Add `theme/{dimensions,borders,components,shadows}.ts`; tokens from the prototype; status tokens for orders (incl. dispatched), applications, stock and sync; strict `raw-style` gate (no hex colours, raw sizes or raw font sizes outside `theme/`) burned to zero | Prototype approved |
| `zl-app-core` (components) | Rebuild `common/components`: Button sizes; Input focus/disabled/helper states; one `StatusBadge` (icon + label) replacing four; Chip replacing two; Sheet with title and modal semantics; 48 dp targets; component docs | theme lane's tokens |
| `zl-app-core` (shell) | Role-aware root navigator: Auth, Application Status, Farmer, Buyer, Dealer, Expert, Admin shells; the IMS root slot (empty until B4, hidden) | A1 |
| every role lane | Replace raw styles in its own folder with tokens | theme lane |

**Exit:** component catalogue screenshots in light and dark; `raw-style` and `module-boundary` at zero.

### A3 — Accounts, registration and approval

**Goal:** SRDS §3–§13, §50, §53.1–§53.9. Plan mode first (auth, RLS, migrations).

**Parked head start:** branch `wip/a3-account-status` (commit `0d7edd8`, not merged, its migration not pushed) holds an
early build of this phase's status work: `profiles.account_status` with its guards and helpers, the FastAPI
`account_not_approved` check, an audited admin decision route, email-only sign-in with Supabase's password rule and
reauthentication, the Application Status screen and Approve/Reject in User Management. It was verified with findings
(residuals and the direct-database audit gap are in its commit and documents). A3 starts from it once A2's components
and shell exist, in plan mode, confirming D10 first; its screens are rebuilt on A2's components rather than kept.

| Lane | Tasks | Needs |
|---|---|---|
| `zl-db` | `account_status` for dealers and experts; `dealer_profiles` (business name, address, location, type, registration number); `required_documents` (per role, admin-managed); `application_documents`; private `dealer-documents` bucket; expert `years_experience`, `institution_affiliation`; helpers `is_approved_dealer()`, `is_approved_expert()` used in every dealer and expert policy; status-change audit trigger; farmer and buyer location columns; pgTAP two-user proofs (pending vs approved) | A1 |
| `zl-backend-core` | `require_approved_dealer`, `require_approved_expert`; status re-read on every request; email service seam (SMTP settings, templates, local Mailpit) | `zl-db` helpers |
| `zl-accounts` | "Create your account" with four choices; Farmer and Buyer forms (location fields); Dealer multi-step (account, business, documents, review); Expert multi-step (personal, professional, documents, review); Application Status screen (pending, rejected with reason and resubmit, suspended); "approved, please sign in again" flow; admin Account Security (change email, password, two-factor) | contracts; A2 components |
| `zl-dealer` | Dealer routes open only when approved; application details shown in profile | `zl-accounts` |
| `zl-expert` | Expert application merged into registration; workspace only when approved | `zl-accounts` |
| `zl-admin` | Dealer Applications and Expert Applications queues: list, detail, document viewer (signed URLs), approve, reject with reason, suspend, reactivate; each writes an audit row | `zl-db`, API |
| `zl-comms` | Approval and rejection email templates; in-app notifications for decisions | `zl-backend-core` email seam |
| `zl-devops` | Integration brief update for G1 (hosted SMTP) | — |

**Exit:** two-user proofs: a pending dealer is refused on every dealer route and table and an approved one is
allowed (API and PostgREST); same for experts; a forged admin sign-up still becomes `buyer`; approval email seen in
Mailpit; audit rows for every decision. Hosted email stays Blocked until G1.

### A4 — Marketplace, orders and dispatch

**Goal:** SRDS §26–§29 and the producer side of §19–§21 (D5–D9).

| Lane | Tasks | Needs |
|---|---|---|
| `zl-db` | `order_status` gains `dispatched`; seller-only `ready → dispatched`; drop the confirm-time stock commit (confirm checks availability only); `order_events` outbox (unique per order line) written in the dispatch transaction; `listings.inventory_product_id` (nullable link, dealer listings); buying rules (experts and admin cannot buy) in the order guards; widen the BR-10 structure test to rider, vehicle and warehouse names; pgTAP | A3 |
| `zl-commerce` | Order API and screens with Dispatch; stock-short block (D6) through the availability contract; stock badges (in, low, out, unknown); listing form "link to inventory product" for dealers (hidden until B3); keep BR-09/10/11 tests | contract "Order dispatched event"; availability keeps today's `available_stock` until B3 replaces it behind the same contract |
| `zl-buyer` | Buyer dashboard (recent orders, quick actions), purchases list, checkout entry | `zl-commerce` |
| `zl-farmer` | Farmer seller tools (my products, sales) and farmer buying from dealers | `zl-commerce` |
| `zl-dealer` | Dealer seller tools, dealer buying from farmers, Dispatch from the dealer's sales list | `zl-commerce` |

**Exit:** a buyer order moves to dispatched and writes exactly one event per line; cancelling before dispatch writes
none; PostgREST and API agree on every move; buying matrix proven by two-user tests.

### A5 — Messaging and notifications

**Goal:** SRDS §30–§31 (D12).

| Lane | Tasks | Needs |
|---|---|---|
| `zl-db` | `conversations.context_type` (`listing`, `order`, `consultation`) and `context_id`; insert guard: listing inquiry (anyone ↔ listing owner), order (buyer ↔ seller), consultation (requester ↔ expert); pgTAP for each allowed pair and a refused unrelated pair | A4 |
| `zl-comms` | Start a chat only from a listing, order or consultation; context chip; notifications for approval, dispatch, low stock (Plan B) | `zl-db` |
| `zl-farmer`, `zl-buyer`, `zl-dealer`, `zl-expert` | "Message" entry points in their own screens | `zl-comms` |

**Exit:** each relationship in SRDS §30 proven through API and PostgREST; an unrelated pair refused.

### A6 — AI advisory and expert assessment

**Goal:** SRDS §32–§37, §40 (D11).

| Lane | Tasks | Needs |
|---|---|---|
| `zl-db` | `disease_knowledge` (per model class: symptoms, treatment, precautions, advisory; admin-managed; audited "AI Configuration Changed"); `consultations.disease_case_id`; `consultation_assessments` (agree, correct, additional diagnosis, recommendations, request information); pgTAP | A3 |
| `zl-ai` | AI report assembly (prediction + knowledge); report API; decide with the maintainer whether `/api/v1/disease/*` is farmer-only (today any signed-in role may call it) and enforce it in the API and the policies; a real leaf photo fixture (licence-clear) so the real-photo prediction test runs instead of skipping; Scan, Analysing, Report (confident, low confidence, healthy), Unavailable screens; AI isolation tests (AI down → marketplace, orders, payments, messaging, inventory and expert accounts unaffected) | `zl-db` |
| `zl-expert` | Consultation request carries the report; AI case summary for the expert; Expert Assessment panel kept apart from the AI assessment; farmer sees both | contract "AI report" |
| `zl-farmer` | Scan Disease entry on the dashboard | `zl-ai` |
| `zl-admin` | AI activity (scans, failures, low-confidence share, referrals); knowledge-base management | `zl-db` |
| content | A qualified agronomist reviews every knowledge entry before release | outside dependency |

**Exit:** scan → report → consult → expert sees the full case → expert assessment → farmer sees both, on the
emulator against the real API.

### A7 — Admin moderation and audit

**Goal:** SRDS §14, §51, §53.10.

| Lane | Tasks | Needs |
|---|---|---|
| `zl-admin` | Moderation for consultations, AI activity, reviews and every order administrative action; dashboard queues (applications, reports, disputes) | A3–A6 |
| `zl-db` | Audit events named as in SRDS §51; admin policies reviewed; no admin policy on any inventory table (with Plan B) | — |
| `zl-backend-core` | The audit-coverage test lists every admin write route | — |

**Exit:** every admin write leaves an audit row with the §51 name; no admin route or policy touches inventory.

### A8 — UI/UX rollout and accessibility

**Goal:** the prototype on every screen; WCAG 2.2 AA; low-literacy patterns.

| Lane | Tasks |
|---|---|
| every module lane | Apply the prototype to its own screens (loading, empty, error, offline, success states); 48 dp targets; screen-reader labels |
| `zl-app-core` | Accessibility script (TalkBack pass per role); dark-mode pass |
| `zl-orchestrator` | Usability test with real farmers, buyers and dealers; findings written up |

**Exit:** accessibility script passes on the emulator; usability results recorded.

### A9 — Hardening and release

| Lane | Tasks |
|---|---|
| `zl-devops` | Real-stack Jest in CI; error tracking (G5); backups (G3); release signing and EAS (G13); store readiness |
| `zl-db` | Push the migration history to the hosted project (maintainer approval), advisors clean |
| every lane | Coverage gaps closed in its module; register rows truthful |
| `zl-orchestrator` | Documentation and the FYP report |

## 3. Integration checkpoints

At the end of each phase, in this order: `zl-db` merges and `npx supabase db reset` + `npx supabase test db` +
policy mutation pass; API lanes merge and the backend suite (unit + real stack) passes; `zl-backend-core`
regenerates the OpenAPI document and the client; app lanes merge and Jest (`--ci --runInBand`), lint, typecheck,
the reality gate and the emulator smoke pass; `zl-verifier` repeats the phase's exit checks with fresh context and
tries to break them.
