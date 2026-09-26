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
| Farmer scans (camera/gallery) → AI API → report | Farmer-only flow; MobileNetV2, 38 classes; photos compressed; model now in Supabase Storage | Keep |
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
| `zl-orchestrator` | Write `docs/status/srds-traceability.md` (every SRDS section → requirement → phase → test); add one feature-register row per Build/Change item in §1 | Matrix and register committed |
| `zl-devops` | CI job summary lists skipped jobs; confirm the model fetch uses the secret | CI shows the model downloaded from Supabase |

**Exit:** clean tree, green CI, traceability matrix, local stack and emulator run.

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
| `zl-db` | `order_status` gains `dispatched`; seller-only `ready → dispatched`; drop the confirm-time stock commit (confirm checks availability only); `order_events` outbox (unique per order line) written in the dispatch transaction; `listings.inventory_product_id` (nullable link, dealer listings); buying rules (experts and admin cannot buy) in the order guards; pgTAP | A3 |
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
| `zl-ai` | AI report assembly (prediction + knowledge); report API; Scan, Analysing, Report (confident, low confidence, healthy), Unavailable screens; AI isolation tests (AI down → marketplace, orders, payments, messaging, inventory and expert accounts unaffected) | `zl-db` |
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
