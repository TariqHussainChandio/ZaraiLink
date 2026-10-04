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

**Status (2026-09-28): done.**
- PR #15 was merged with a merge commit (`8ddd846`), so the pure move keeps file history.
- `zl-verifier` verified it in four rounds; every finding is fixed or recorded as a known limit.
- CI is green on `main` (run 36399545019), including the Android build and the reality gate's first run on Linux.

A1 ran as one scripted pass instead of the three lane steps above (maintainer's decision, 2026-09-27), on branch
`a1/restructure` in three commits:
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

**Goal:** SRDS §43–§44 theme and a shared component set, from the ZaraiLink design system (D14): a new design built from
the SRDS, published as a Design System artifact (https://claude.ai/artifact/QGigdYkNz8jUZLQcNMTeWz) and approved by the
maintainer on 2026-09-28. It holds light and dark tokens (every text, icon and control pair
contrast-checked in both themes), the type scale (Atkinson Hyperlegible Next and Mono), 18 components, the role
shells and the status vocabulary.

| Lane | Tasks | Needs |
|---|---|---|
| `zl-app-core` (theme) | Add `theme/{dimensions,borders,components,shadows}.ts`; tokens from the design system's `tokens.json`; status tokens for orders (incl. dispatched), applications, stock and sync; strict `raw-style` gate (no hex colours, raw sizes or raw font sizes outside `theme/`) burned to zero | Design system approved (D14) |
| `zl-app-core` (components) | Rebuild `common/components`: Button sizes; Input focus/disabled/helper states; one `StatusBadge` (icon + label) replacing four; Chip replacing two; Sheet with title and modal semantics; 48 dp targets; component docs | theme lane's tokens |
| `zl-app-core` (shell) | Role-aware root navigator: Auth, Application Status, Farmer, Buyer, Dealer, Expert, Admin shells; the IMS root slot (empty until B4, hidden) | A1 |
| every role lane | Replace raw styles in its own folder with tokens | theme lane |

**Exit:** component catalogue screenshots in light and dark; `raw-style` and `module-boundary` at zero.

**Status (2026-10-04): done.**
- PR #22 was merged with a merge commit (`64fa667`).
- `zl-verifier` verified it in its fourth round; every finding of the four rounds and of the narrower checks of the
  follow-up fixes is fixed or recorded as a known limit below.
- CI is green on the PR (run 37163173336), every job including the Android build and `ci-required`. The run before it
  failed the dependency scan on new advisories against transitive npm packages that `main` already shipped; the PR
  moved `brace-expansion`, `fast-uri` and `joi` to their patched versions (lockfile only) and recorded `braces` (jest)
  and `node-forge` (`@expo/cli`), which have no fixed release, in `osv-scanner.toml` until 2026-12-15.

A2 was built on branch `a2/design-system` in one sequential pass (the maintainer's choice).
`zl-verifier` rounds 1 (2026-09-28), 2 and 3 (2026-10-03): verified with findings, all fixed below; round 4
(2026-10-03): verified, with seven Low follow-ups; a re-check of those (2026-10-04) found them holding, with four Low
and one Info item more, fixed below except the inventory lists' raw status words (B4). Two checks of those fixes found
them holding, but the rule's new ternary reading still failed valid code; it was rewritten as a small grammar, and a
third check of that found no false positive and one slow case (chained operators), fixed below.

- **Theme** (`frontend/theme/`): `colors`, `typography`, `spacing`, `dimensions`, `borders`, `shadows`, `components`,
  `motion`, `themes`, `ThemeContext` and `RoleScope` (each shell sets its accent once; components read it with
  `useRoleAccent()`). Values are the design system's light and dark tokens; `contrast.test.ts` checks 184 text and
  icon pairs in both themes. The status vocabulary (tone, icon, word for orders, payments, applications,
  consultations, listings, reports and stock) is `frontend/common/constants/status.ts`. Atkinson Hyperlegible Next and
  Mono are embedded by the `expo-font` config plugin as Android font families (`app.config.ts`), so a style's
  `fontWeight` picks the file; the release APK carries all six font files.
- **Components** (`frontend/common/components/`): Button, TextField, Chip and ChipRow, StatusBadge (replaces the four
  status badges), Card, ListRow, Sheet, Banner, EmptyState, Skeleton, Spinner, Avatar, RoleBadge, TopAppBar and
  IconButton, TabBar, PriceBreakdown (BR-09: the delivery charge is always its own line), OrderTimeline and
  `dashboards/StatTile`, each with tests. A development-only design catalogue (Account, palette icon) shows every one.
- **Shells** (`frontend/navigation/`): Farmer (Home · Market · Orders · Advisory · Account), Buyer (Home · Market ·
  Orders · Experts · Account), Dealer (Home · Market · Orders · Messages · Account), Expert (Requests · Cases · Messages
  · Account) and Admin (Overview · Approvals · Moderation · Audit · Account). Farmers and buyers open Messages from
  Home's app bar, as a full-screen stack over the tabs; the chat composer there clears the gesture area itself
  (`useComposerInsets`). The Advisory and Experts tabs lead to the verified experts ("Find an expert"). Each stack draws
  the design system's app bar; a screen's app-bar actions are passed per route (`stackOptionsWithActions`), never
  React Navigation's `headerRight`. `shells.test.tsx` renders each role's navigator and checks its tabs, its accent
  and that each app-bar action appears exactly once, which fails if an action is also handed to `headerRight`; an
  action moved to the native header altogether is caught by the strict `header-right` gate rule, not by the test. A
  chat opened from another tab sits on top of the conversation list (`initial: false`). `stackHeader.test.tsx` checks
  the app bar's Back and title: a stack's first screen (what every tab root is) has the large title and no Back, a
  screen that sets `headerBackVisible: false` has no Back, an inner screen has Back and the standard title, and a stack
  opened full screen over the tabs gets a Back that closes it (native-stack passes the parent's Back to its first
  screen).
- **Migration**: `scripts/a2/migrate_theme.py` rewrote every module to the new theme (`--check` reports 0 old uses);
  hand-built chips, banners, quick actions and cart and role badges were replaced with the shared components.
- **Gate**: the strict `raw-style` rule (colour literals: hex, rgb/hsl, named colours and a hex alpha appended to a
  token; font families, weights and numeric type sizes; numeric spacing, radius, border, size, flex-basis and
  translate values other than 0, signed, decimal and logical properties included; numeric size-like props, as numbers
  or strings; each of these as a ternary branch or a `??`, `||` or `&&` fallback on the same line too) and
  the strict `header-right` rule (`headerRight`, `headerLeft` and a component `headerTitle`, all mounted in the hidden
  native header) are at zero, with no baseline entry and failing-first tests in `scripts/test_check_reality.py`.
  `module-boundary` stays at zero; the knip count fell from 27 to 22. The CI change filter counts
  `tsconfig.node.json` as a frontend change (`scripts/test_ci_paths.py`).
- **Types**: `app.config.ts` runs in Node, so `tsconfig.node.json` checks it with Node's types (`@types/node` pinned
  to the Node 22 line that `engines` and CI use) and the app's program excludes it (`npm run typecheck` runs both); app
  code cannot type-check Node-only APIs such as `Buffer`.
- **Evidence** (after the round-4 re-check's fixes, 2026-10-04): `npm run typecheck` (both programs) 0 errors; ESLint 0
  errors, 0 warnings (the ESLint allowance in `scripts/reality-baseline.json` lowered from 16 to 0); Jest 159 suites, 1,135 tests; the
  app's real-stack Jest 16/16 against local Supabase and FastAPI, and the backend suite 466 passed (1 skipped: no
  sample leaf photo) at round 1, the backend unchanged since; gate tests 202 (`scripts/test_check_reality.py` and `scripts/test_ci_paths.py`); `expo-doctor` 21/21 on `expo` 57.0.26;
  round 4 assembled a release APK that carries all six font files. A dev build
  rebuilt on 57.0.26 runs on the emulator: the timeline's spoken states and the price lines are in Android's
  accessibility tree (`uiautomator`), the farmer's full-screen Messages closes with Back, and a dealer's chat opened
  from a listing returns to the Messages list. On the Pixel 8 emulator (Android 16), a new dev build signed in as a local farmer, buyer,
  dealer, expert and admin, each with its tab set and accent; Settings switched light and dark; 130% font scale held;
  the catalogue was captured page by page in both themes.
- **Defects the device run found and fixed:** header actions mounted twice (native-stack hands `headerRight` to its
  hidden native header), and the second notification bell crashed on the shared realtime channel; the realtime hooks
  now give each mount its own channel, with a regression test on the real supabase-js client. Also: a tab selected
  after launch drew a square highlight; the role badge used the info colour; a stat figure broke across lines and four
  tiles in a row broke words; status-bar icons followed the phone's theme instead of the app's; tab labels were cut at
  130%.
- **Verifier round 1** (VERIFIED WITH FINDINGS), fixed: the order timeline drew disputed and refunded orders as not
  started (F1; now completed, then the dispute, then the refund); the farmer and buyer chat composer sat in the
  Android gesture area (F2; proven on the emulator: the composer ends at y 2307, the gesture area starts at 2337); a
  `/// <reference types="node" />` let Node's globals type-check in app code (F3; the tsconfig split above);
  StatusBadge crashed on a status it does not know (F4; now a neutral badge with the status's own word); no test
  guarded the shells (F5; `shells.test.tsx` fails if an action appears twice, and the `header-right` rule); controls took the brand
  green in every shell (F7; FABs, chat, filters, selected options and unread rows now take the role accent);
  `raw-style` missed several forms (F8; extended, and the QR code, keyboard offsets and a font literal fixed); text
  without a type style fell back to Roboto (F9; form errors are danger Banners, auth links quiet Buttons, line items and
  profile rows typed); touchables without a button role and the tab's "new" dot at 2:1 (F10; roles added, the dot
  ringed in the notifications ink, which the contrast test now checks). The inventory system's dealer strip moved below
  the status bar.
- **Verifier round 2** (VERIFIED WITH FINDINGS), fixed: the order screen crashed on a status the build does not know,
  where F4 had only fixed the badge (V1; every status is read through `statusMeta` in `common/constants/status.ts`, the
  timeline draws an unknown status as the current step after the steps reached, and the screen has a test with
  `dispatched`); the F1 tests passed with F1's fix reverted (V2; each step is now spoken as "done", "current step" or
  "to come", the tests assert it, and reverting F1 fails two of them); a dealer who opened a chat from a listing,
  order or notification before the Messages tab could never reach the conversation list (V3; `initial: false` at the
  four call sites); the F5 wording overstated the test (V4; corrected above); `headerLeft` and a component
  `headerTitle` escaped the `header-right` rule (V5); the app bar ignored `headerBackVisible: false` (V6); the select
  field, the payment method choice and the cart steppers had no roles or selected state for TalkBack (V7); the CI
  filter missed `tsconfig.node.json` (V8); `raw-style` missed named colours, logical properties and more (V9);
  `@types/node` was newer than the project's Node (V10); a missing chat partner's name showed as "Unknown" rather than
  the "Conversation" fallback (V11); the expert specialisation line and a listing icon used the wrong tokens, and a
  refunded order's past dispute was drawn as a warning (V12).
- **Verifier round 3** (VERIFIED WITH FINDINGS), fixed: the timeline's spoken states never reached TalkBack, because
  Android flattened the layout-only views that carried them (R3-1; each step and price line is `accessible`, the list
  keeps a native view, Jest asserts both, and the device's accessibility tree now holds them); CI's Android job runs
  `expo-doctor` first and would have skipped the APK builds on the new upstream patch (R3-2; `expo` taken to 57.0.26
  with `npx expo install --fix`, the native project and dev build rebuilt); the ESLint allowance still allowed 16
  nested components (R3-3; lowered to 0); raw status values showed in dashboard rows, order and listing labels and
  notifications (R3-4; read through `statusMeta`); the cart's Remove was a 20 dp target (R3-5; 48 dp); a nameless
  conversation showed a blank row (R3-6; "Unknown"); test gaps (R3-7: an unknown status's timeline, a history entry
  leaving an unknown status, the full-screen Back, a case only the size-prop pattern catches); and forms the rules still
  passed (R3-8: `headerSearchBarOptions`, `fontWeight: '700'`, `size={'24'}`, `color={'black'}`, outline and shadow
  radii). `statusMeta` reads own keys only. The full-screen Back proved to come from native-stack itself, so the
  header's own overlay-closing code was removed.
- **Verifier round 4** (VERIFIED: nothing above Low), its seven Low follow-ups fixed: My Listings and listing
  moderation showed the raw listing status (L1; `StatusBadge`, so an active listing reads "Listed"); a status
  notification read "Payment payment failed" (L2; now what changed, then the status word: "Payment update: Paid", one
  test case per kind); changes the tests did not catch (L3; the order card's and a listing's spoken status, the Total's
  own accessible stop, the large title on a stack's first screen, and `outlineOffset` and `textShadowRadius` each get a
  test, and reverting each fix fails one); a name left empty (`profiles.full_name` defaults to `''`) showed blank where a
  missing name read "Unknown" (L4; every fallback uses `||`); the payment result screen looked its copy up by status and
  would crash on one it does not know (L5; it falls back to the status word, with a test); `raw-style` missed numeric
  and named font weights and a literal in a ternary, a colour object or a template string (L6; each has a case, and
  dropping any branch of the rule fails one); and the shells bullet said "a tab root" where the test renders a stack's
  first screen (L7). The re-check (fresh context, mutations on every fix) found them all holding, and fixed: font
  sizes, weights and families in a ternary still passed the rule; its new ternary branches could run past a `}` into a
  later JSX prop and fail valid code (the branch now stops at a brace, and three such lines are allowed in the tests);
  the admin analytics tiles named payment and report statuses with the raw value ("Successful" for "Paid"); an empty
  name still showed blank in the admin user list and its role sheet, a listing's seller and your own profile; the L5
  test passed with the fallback title broken; and a notification type equal to an inherited key (`constructor`) was
  read as a known type. Two checks of those fixes found the ternary reading still failed valid code: first a time
  (`'09:00'`) or a function's parameters, then an index (`space[dense ? 1 : 2]`, correct token use), a typed
  declaration (`const end: number = more ? 1 : 0`) and a size prop's `Platform.OS === 'ios' ? headerHeight : 0`. Each
  fix had stopped a free run of characters at one more place, so the reading was rewritten as a small grammar
  (`_BRANCH` in `scripts/check_reality.py`): a condition is one operand (a name, a member or index access, a number or
  a string), perhaps compared with another, then `?`, `??`, `||` or `&&`, nested ternaries included. Style keys and
  size props share it, and neither counts 0 as a raw size. A third check found no false positive in 113 realistic
  lines, but chained operators backtracked exponentially (22 `??` on one line took 7.6 s): spaces could belong to the
  end of one step or the start of the next, and `a!==b` read two ways. Spaces now come only before a piece and `!`
  only starts an operand, so each line has one parse; 1,600 chained operators take about 10 ms, and a test with 400
  of them fails on a 30 s timeout if the doubling returns. A fourth check found the old and new forms flag the same
  lines across all 46,679 lines of `frontend/` and 248 probes, and nothing above Low; its two untested parts (a double
  `!`, and `transparent` in a colour object) now have tests. The tests reject 29 ternary and fallback forms and allow
  25 valid lines that earlier versions failed or that pin a boundary; dropping any part of the grammar fails one (two
  loosenings that would only flag more raw values pass: reading across lines, and any text as the right side of a
  comparison). On the emulator, as the local admin, the payment tiles read "Paid
  27", "Payment failed 7" and "Awaiting payment 15" (the local database's counts), and users with an empty name read
  "Unknown user".
- **Deviation from the task table:** the Application Status shell needs A3's `account_status`, and the IMS root slot
  is B4's; built now, each would be an unreachable or empty screen (AGENTS rule 2), so they come with their phases.
  The status tokens for `dispatched` come with that status in A4 (D5), and those for sync with B3; until then a status
  the app does not know reads as a neutral word with its own name, as a badge, in an order's history and as the
  timeline's current step. The design catalogue opens from Account (development builds only)
  instead of a `zarailink://dev/catalogue` deep link; its code still ships, unreachable, in the release bundle, since
  Metro does not drop unused modules. Adopting list skeletons screen by screen is A8's work.
- **Known limits:** `raw-style` reads literals, not arithmetic: 33 half-step nudges (`space[1] / 2`) remain for A8's
  screen pass. With no profile loaded (offline at a cold start) an authenticated user's role is unknown and the
  shared navigator shows the buyer tabs (before A2, a generic tab set); A3 resolves role and account status. One
  sign-out during the device run (a single app-initiated `/logout`, no backend 401) was not reproduced in later
  tries, and the verifier saw one native crash of the dev build (SIGSEGV in Fabric's mounting, 1 of 5 launches), also
  not reproduced. Keyboard avoidance on Android is unverified: the emulator draws no soft keyboard, and the chat
  screens' `KeyboardAvoidingView` sets a behaviour on iOS only, so with edge-to-edge on target SDK 36 the keyboard may
  cover a composer on a real phone (A8 checks it on a device). 22 hand-built touchables still have no accessibility
  role, for A8's accessibility pass: 20 in module screens, plus the sheet's backdrop (which TalkBack never reaches, the
  sheet being modal) and the activity feed's rows. The inventory store and supplier lists still show their raw
  `active` and `inactive` values, which have no vocabulary entry yet; Plan B (B4) rebuilds those screens. `raw-style`
  reads a ternary on one line, so one that the formatter spreads over several lines is caught only when the break
  falls just before the literal. It does not read a branch with a call, arithmetic or `typeof` in its condition or
  branch (`useColorScheme() === 'dark' ? 'white' : …`, `index % 2 === 0 ? 8 : …`, `big ? scale(4) : 14`,
  `(dense && 8) || space[2]`), a TypeScript non-null `!` in the condition (`theme!.dark ? 'red' : …`), or a ternary
  inside a template string: the rule stays silent there rather than fail valid code. Each match is linear, but a
  single line holding about a thousand rule keys (`color:a ?? color:a ?? …`) takes seconds, since each key starts
  its own match; no source line comes close, and generated files are not scanned. It still flags a few valid lines it reads as styles, all from before round 4: a style key's
  name with a number inside copy or a comment (`'Season end: 31 March'`), a type literal (`color: 'accent' |
  'neutral'`), a non-style object with a `start` or `end` key (`selection={{ start: 1 }}`), a list prop such as
  `windowSize={5}`, and a literal written before a token (`2 * space[4]`). None is in the code today; such a line is
  reworded or moved to a constant. The backend's schemathesis fuzz test
  could not run on this machine (Windows Application Control blocks hypothesis's native library, and now the
  `uvicorn.exe` launcher, so the API runs as `python -m uvicorn`); CI runs it.

### A3 — Accounts, registration and approval

**Goal:** SRDS §3–§13, §50, §53.1–§53.9. Plan mode first (auth, RLS, migrations).

**Decided 2026-10-04 (maintainer):** D10 as recommended; two sequential PRs, A3a then A3b, each verified and merged on
its own; `account_status` is `pending | approved | rejected`, with suspension staying `profiles.is_suspended`; the
approval email goes through a backend SMTP seam (local Mailpit; hosted Blocked until G1).

**A3a status (2026-10-04): done.**
- PR #25 was merged with a merge commit (`59d57fc`); CI green on the PR (run 37202258186), every job including the
  Android build and `ci-required`.
- `zl-verifier` round 1: NOT VERIFIED (the admin side could not decide on a device), every finding fixed; round 2:
  VERIFIED WITH FINDINGS (Low only), fixed or recorded below.
- Hosted project: the migration was pushed on 2026-10-04 with the maintainer's approval (`npx supabase db push`;
  58 migrations, local and remote in step). The reauthentication template is not pushed: `npx supabase config push`
  needs the `SUPABASE_AUTH_SMTP_*` secrets set in the maintainer's shell, or it would blank the hosted SMTP settings;
  until then an old hosted session gets Supabase's default code email.
- **Database** (`20261005080000_account_status.sql`, ported by hand from the parked branch and rebuilt on today's
  policies; its listings section would have restored the admin branch without a second factor):
  - `profiles.account_status`, `account_status_reason` and `account_status_changed_at`;
  - dealers and experts sign up pending; a role change resets the status; no user session writes the status, an
    admin's included;
  - `decide_account_status()` is the one way to decide (second factor, a reason of 10 or more characters to reject,
    the audit row in the same transaction with the SRDS §51 names); `resubmit_application()`;
  - `is_seller_role()` now needs an approved, unsuspended seller;
  - about 50 write policies now check the account. Before, a buyer could open a store, anyone could list or file an
    expert application, and a pending dealer could receive orders. A pending user keeps only their own profile
    (avatar included), notifications and the expert application, and a pgTAP ratchet fails any new write policy
    that checks suspension but forgets the account.
- **API:** default-deny for an unapproved dealer or expert (403 `account_not_approved`); the any-status routes
  (profile, account deletion, the expert application, `POST /profile/application/resubmit`); `PATCH
  /admin/users/{id}/account-status` for dealers; the expert verification route on the same database function (now
  one transaction, approve or reject only); 403 `sign_in_again` for a session signed in before the approval (the
  token's `amr` sign-in time, which a refresh keeps).
- **App:** the Application Status screen (pending, rejected with the reason and Resubmit, the expert's own
  application) and the "approved, sign in again" screen, mounted before any role shell; the decision arrives live
  through the account's notification; email-only sign-in and sign-up with Supabase's password rule; Change Password
  confirms with an emailed code (new `supabase/templates/reauthentication.html`); dealer Approve and Reject (with a
  reason) in User Management; the expert decision needs a reason to reject, and suspension is the account's only.
- **Interim until A3b:** a dealer has no business details or documents yet, so the admin approves on identity; the
  expert applies with today's application screen. `GET /api/v1/expert/admin/{id}` has no app consumer left (only the
  smoke suite calls it); A3b's application detail replaces it.
- **Verifier round 1** (NOT VERIFIED), fixed:
  - H1: the app never asked an admin for the second factor, so every in-app admin write (approve, reject, suspend)
    answered `mfa_required`; an admin with an authenticator now gives the code at sign-in (`SecondFactorScreen`,
    the auth store's `secondFactor` status, read from the session's assurance level).
  - H2: the Pending dealers queue filtered one page of 100 in the app and lost later applicants; `GET
    /admin/users` now takes `role` and `account_status`.
  - H3: the user row squeezed the name away beside four actions; the actions wrap under the name.
  - M1: the Change Password code was only checked by Supabase for a session over a day old; the screen now asks for
    it only when Supabase answers `reauthentication_needed`.
  - L1: an aal2 admin could write an expert record's decision without an audit row (the policy and its update grant
    are dropped); L2: an expert made a farmer and back stayed `approved` on their record and vanished from
    Approvals (a definer trigger resets it to pending); L3: legacy `suspended` experts kept a verification nothing
    could lift (the backfill approves it, suspension being `is_suspended`); L5: the expert route decided dealers
    (409 now); the unused `notify_expert_verification_changed()` is dropped.
  - Recorded, not changed: L4, `sign_in_again` is FastAPI's; an old session refreshed after the approval can still
    write through PostgREST until it signs in (the approval is real; only the "log in again" step is skipped). L6,
    a pending user may still change their avatar, as part of their own profile.
  - Device (round 1): the admin signed in, gave the TOTP code, saw only the pending dealer under Pending dealers
    with a readable row, approved in the app (approved, one audit row) and rejected another with a reason (rejected,
    reason stored, one audit row); a fresh session changed its password with no code; a session aged to 25 hours
    got the code step, a wrong code was refused and the emailed code worked.
- **Verifier round 2** (VERIFIED WITH FINDINGS, Low only): every round-1 fix held, re-proved on the device, the API
  and the database, with mutants killed for each. Fixed: a stale comment, the filter chips touching the screen edge,
  a register typo. Recorded as known limits:
  - the admin user list and the Pending dealers queue show one page of 100 (paging predates A3a; the 101st pending
    dealer by name would be missed until A3b's application queue, which pages by submission);
  - if reading the session's assurance level fails, the admin console opens at aal1 and its writes answer
    `mfa_required` (FastAPI and the database still demand the second factor, so nothing is exposed);
  - `amr` is whole seconds, so a sign-in in the same second as the approval counts as after it (a sub-second
    window, next to L4).
- **Evidence (before round 1):** pgTAP 607 (11 files, the new one with two-user proofs: a pending dealer against an approved one on
  every write surface) on a database rebuilt from migrations; advisors all accepted; backend unit 212, real-stack
  smoke 281 (new `test_smoke_account_status.py`, the authorization matrix with pending actors); Jest 161 suites,
  1,164 tests; app real-stack 18/18; gate tests 236; knip 22 → 21. On the Pixel 8 emulator: a dealer registered by
  email (code from Mailpit) saw only "Under review"; rejected with a reason, the screen changed live and Resubmit
  returned it to review; the pending dealer's token was refused by PostgREST (42501) and FastAPI
  (`account_not_approved`); approved, the screen changed live to "sign in again", and after signing in the dealer
  dashboard opened and a store was created; an expert applied while pending, was approved and reached the expert
  workspace after signing in again; Change Password took the emailed code and the old password stopped working. The
  admin's decisions on the device run were made through the API with a second-factor session.

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
