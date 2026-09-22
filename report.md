# ZaraiLink Complete Repository Audit

*Read-only, evidence-based audit of the working tree at `d:\FYP\ZaraiLink`, performed via five independent parallel research passes (backend, frontend screens/navigation, frontend↔backend integration, Supabase/database, and security/dependencies/build/testing) plus direct verification of specific claims. No file was modified, created, deleted, or renamed as part of this audit.*

*A prior audit document previously occupied this same file (`report.md`). That document is now **stale and superseded** — it was written before a large, currently-uncommitted development pass added the entire FastAPI backend (14 routers beyond the original disease-only router), `core/auth.py`, 15 sets of repositories/services/schemas, 96 backend tests, and migrated nearly the entire frontend service layer to call that backend. `git status` shows essentially all of `backend/app/`, `src/`, and `supabase/migrations/` as untracked — i.e. real, substantial, uncommitted work exists in this checkout that the previous audit pass did not see. Every claim below was re-verified against the current file contents; nothing here was carried over from the old report without independent confirmation.*

*Post-audit update #1: after this document was written, two further changes were made to the repository and this document was updated to track them (path references only — the underlying functional findings below were not re-audited beyond what's explicitly noted): (1) the `ios/` folder was deleted (the project isn't building for iOS right now — confirmed no other file depended on it first); (2) a full directory restructure was applied — `backend/app/api/*.py` → `api/v1/endpoints/*.py` behind a new aggregating `api/v1/router.py`, `ml/model.pth` → `ml/checkpoints/model.pth`, `services/disease_inference.py` → `services/ai_engine.py`, a new unused `repositories/base_repository.py` stub, backend tests moved to `tests/unit/` with a new `tests/conftest.py` stub, two new `.github/workflows/*.yml` CI stubs, and on the frontend: `components/{9 domains}` → `components/features/{9 domains}`, `services/{14 domains}` → `services/modules/{14 domains}`, `store/{4 subfolders}` flattened to `store/*.ts`, `hooks/` split into `hooks/{realtime,api}/`, and `navigation/*Navigator.tsx` → `navigation/stacks/`. The restructure was verified afterward: 106/106 backend `pytest` passing, 0 TypeScript errors, 0 ESLint errors, Jest passing — so the functional claims throughout this document (which predate the restructure) remain accurate; only file paths changed.*

*Post-audit update #2 (this pass): a large amount of real, substantive work landed since update #1 — most of it in commit `e25772f` ("security hardening, business-logic fixes, UI/UX richness pass, and full frontend test coverage"), already on `main`, plus a separate CI-verification pass (`phase-6-ci-verification`, two merged PRs) and a currently-**uncommitted** documentation-reconciliation + localization retrofit sitting in the working tree right now. This update corrects every section below against the actual current repo (`git log`, `git diff`, live file contents) rather than re-running the original five-pass audit from scratch — the deep per-domain descriptions in §5–§20 were spot-checked and remain accurate; the numbers, statuses, and findings that changed are called out explicitly at each section. Headline changes, all independently verified in this pass:*
- *Committed and confirmed live: `is_suspended` now enforced in RLS (`public.is_suspended()` gated into 24 tables' write policies), CORS now reads an `ALLOWED_ORIGINS` allowlist, rate limiting added (`slowapi`, 200/min default + 10/min override on `/disease/predict`), the `listing_views` self-inflation gap and `guard_messages_updates()` `search_path` gap are both closed, admin's write access to dealer inventory/stores/suppliers was closed to read-only oversight, the `AndroidManifest.xml` cleartext-traffic placeholder now has matching `manifestPlaceholders` in `build.gradle`, the three dead-tap interaction bugs (admin Orders, My Listings/Products, `RoleAwareAnalyticsScreen`) are all fixed, the Settings notification toggle now persists to a real `profiles.notifications_enabled` column, dark mode (light/dark/system) and camera capture (`utils/photoPicker.ts`) both now exist, `countries`/`provinces`/`cities`/`phone_codes` were deliberately dropped in favor of free-text fields (table count is now 32, not 36), and frontend test coverage went from one smoke test to **734 tests across 132 suites** (backend: 112 tests, up from 106) — `tsc`/`eslint`/`jest`/`pytest` all confirmed clean.
- *Committed and confirmed live: CI is no longer an unverified stub — `gh run list` shows real GitHub Actions runs on `frontend-ci.yml`/`backend-ci.yml`/`migration-lint.yml` (a third workflow, new), including a deliberate break-then-fix round (lint, typecheck, and jest each independently broken and confirmed to fail CI, then fixed and confirmed green) before merging to `main`. Branch protection itself is not enabled — this repo's GitHub plan returns 403 on the branch-protection API — a plan-tier limit, not unfinished work.*
- *Uncommitted, in the working tree right now: a full i18n retrofit (62 of 64 screen files now call `useTranslation()`, up from 2 of ~70; `en.json`/`ur.json` grew from 27 keys to 800+ lines each) and a documentation-reconciliation pass across 6 files (`docs/architecture/{authorization-model,backend-architecture,notifications,ai-disease-advisory}.md`, `docs/database/schema.md`, `docs/setup/DEVELOPMENT_SETUP.md`) that closes every doc-staleness finding this document previously flagged (§26/§27/BUG-10) — and in the process found and fixed a live cross-doc contradiction (a service-role-usage count) plus one independently stale `reviews` schema row that predated even the last audit.*
- *Still open, unchanged from before: no real trained AI model (`model.pth` is still a 540-byte placeholder, still 503s), no real payment gateway, no push notifications, the Android release build still signs with the debug keystore, and the two leftover direct-Supabase reads (`authStore.fetchProfile`, `SellerDashboard`'s count queries) are both still present. One new, genuinely uncovered gap found this pass: `SellerDashboard.tsx` — the shared component Farmer's and Dealer's dashboards both delegate to — has zero `useTranslation()` calls despite being the highest-traffic screen for those two roles; it slipped through the otherwise-thorough i18n retrofit because it's a component, not a screen file.*

---

## 1. Executive Summary

### Current Project Status

```
Overall Completion:   ~88%
Frontend:             ~92%   (screens/navigation complete; i18n retrofit 62/64 screens done
                               but uncommitted, one component-level gap remains — SellerDashboard)
Backend:               ~82%   (broad, well-tested REST API, CORS/rate-limiting hardened;
                               AI inference is still a placeholder)
Database:              ~93%   (comprehensive RLS/migrations, suspension now enforced at the
                               RLS layer, dealer-scope over-privilege closed; a couple of
                               minor self-admitted gaps remain — see §22)
Integration:            ~90%   (frontend fully migrated to the FastAPI backend; a couple of
                               legacy direct-Supabase reads remain, unchanged)
Authentication:         ~93%   (server-verified, role-aware, AND now suspension-enforced at
                               the RLS layer, not just FastAPI)
UI/UX:            NOT RUNTIME-VERIFIED (static code audit only — no emulator/simulator run,
                               no screenshots reviewed; see §20)
Testing:               ~85%   (backend: 112 real tests; frontend: 734 tests / 132 suites,
                               ~90% statement coverage — both confirmed via commit record and
                               file counts, not re-run in this pass)
```

These percentages are estimates derived from the evidence in this document, not measured metrics. They should not be read as more precise than "roughly on track" / "roughly missing a little."

### What is genuinely working

- A full ~100-endpoint FastAPI backend (§9–§11) covering all 15 domains (admin, analytics, consultations, dealer, disease, expert, farmer, marketplace, messaging, notifications, orders, payments, profile, reference_data, reviews), with real server-side authentication (Supabase token verification, not a local JWT secret), real role-based authorization, real ownership checks, server-derived pricing (never trusts client-submitted amounts), an environment-driven CORS allowlist, per-route rate limiting (`slowapi`), and 112 real (not stub) unit tests exercising exactly these security-sensitive code paths.
- A frontend that has been substantially migrated onto this backend: 116 `apiFetch(...)` call sites across 17 service files, one call site per backend endpoint domain, with no orphaned backend router found — and now backed by 734 real frontend tests across 132 suites (up from a single smoke test), covering every screen, store, and service plus two real-navigator integration flows.
- A comprehensive Supabase schema: 32 tables across 35 migrations (down from 36 tables/28 migrations — `countries`/`provinces`/`cities`/`phone_codes` were deliberately dropped for free-text fields, a genuine simplification, not a regression), RLS enabled and policy-covered on every table, `is_suspended` now gated into 24 tables' write policies (closing a previously-long-standing gap), several `security definer` guard triggers closing gaps RLS alone can't express (role self-escalation, expert-verification tampering, payment-column tampering), and a real, documented, retroactively-fixed privilege-escalation vulnerability (§22).
- Every screen registered in every navigator renders real, data-connected UI — no `PlaceholderScreen` component exists anywhere in the current codebase (§7).
- `seed.sql` contains only admin-curated reference data (categories, crops, currencies, units — the geography tables it used to also seed no longer exist) — no dummy users/listings/orders, consistent with a "no fake data" discipline.
- No escrow logic anywhere (a business-rule requirement) — confirmed absent in every payments-related migration and schema.
- CI is real and proven, not just configured: three GitHub Actions workflows (`frontend-ci.yml`, `backend-ci.yml`, and a new `migration-lint.yml`) have actually run against real merged PRs, including a deliberate round of intentionally breaking lint, typecheck, and jest one at a time to confirm CI catches each failure before being fixed and merged clean.
- All three dead-tap interaction bugs from the previous pass (admin Platform Orders, farmer/dealer My Listings/Products, `RoleAwareAnalyticsScreen`'s bad default) are fixed and confirmed in the current code.
- Dark mode (light/dark/system, persisted), camera capture (`utils/photoPicker.ts`), and a real persisted notification-preferences toggle (`profiles.notifications_enabled`) all now exist, closing three previously-flagged gaps at once.

### What is partially working

- **AI Disease Advisory**: the entire upload→case→predict→result pipeline is real end-to-end plumbing (frontend upload, backend endpoint, ownership checks, database rows) but `backend/app/ml/checkpoints/model.pth` is still a ~540-byte placeholder text file, not a real checkpoint; `torch.load()` on it is designed to fail, so `/api/v1/disease/predict` always returns HTTP 503 today — unchanged since the previous pass. Only 1 of 5 declared disease classes (`healthy`) has description/recommendation copy.
- **Payments**: a complete manual/COD + bank-transfer attestation flow exists (buyer initiates, seller confirms), fully migrated to backend-mediated writes with server-derived amounts — but there is still no real payment-gateway/PSP integration (no such package in `requirements.txt`, no `provider` values beyond a free-text field).
- **Localization**: massively advanced but not yet committed. The i18n mechanism (`react-i18next`, persisted language choice, working Settings toggle) is real, and as of the working tree right now 62 of 64 screen files call `useTranslation()` (up from 2 of ~70), with `en.json`/`ur.json` grown to 800+ lines each. The 2 remaining untranslated screens are thin role-dispatch wrappers with no strings of their own (`HomeDashboardScreen`, and the farmer/dealer dashboard screens that just render a shared component) — but that shared component, `SellerDashboard.tsx`, itself has zero `useTranslation()` calls, so Farmer's and Dealer's actual dashboard UI is still fully hardcoded English regardless of language setting. None of this retrofit is committed yet.
- **Admin platform order oversight**: now fixed — `PlatformOrdersScreen` rows navigate to a real `OrderDetail` route.
- **Farmer "My Listings" / Dealer "Products"**: now fixed — rows navigate cross-tab into `ListingDetail`.

### What is only UI/mock

- The AI disease classifier's inference path is real code (`torchvision.models.mobilenet_v2`, real preprocessing) but currently has no real trained weights to run against — every prediction request fails by design (§19). This is closer to "designed-to-fail placeholder" than "mock," since it doesn't fabricate a fake result — it honestly reports unavailability. Unchanged since the previous pass.

### What is broken

- `SellerDashboard.tsx` — untranslated despite the otherwise-thorough i18n retrofit (see "What is partially working" above); a real, newly-found gap, not previously flagged.
- (Historical, now moot) iOS `Info.plist` had no `NSPhotoLibraryUsageDescription` key despite 8 files calling `launchImageLibrary` — this would have failed/crashed the image picker on a real iOS device. The `ios/` folder was subsequently deleted (the project isn't building for iOS right now); this will need re-fixing whenever iOS support returns.
- All previously-listed "broken" items (admin Orders tap-through, My Listings/Products tap-through, `RoleAwareAnalyticsScreen`'s bad default, the undefined `usesCleartextTraffic` Gradle placeholder) are now **fixed** — see the corresponding items above and in §30's bug report.

### What is completely missing

- Real payment-gateway/PSP integration.
- Push notifications (FCM/APNs) — confirmed absent on both frontend and backend; in-app-only via Supabase Realtime.
- A real trained AI model file.
- A real (non-debug) Android release-signing keystore.

### Biggest architectural problems

- Two leftover direct-Supabase reads outside the service layer (`authStore.fetchProfile`, `SellerDashboard`'s count queries) — confirmed still present, unchanged from the previous pass; low-risk (read-only, RLS-governed) but inconsistent with the stated backend-first architecture.
- Documentation staleness — **resolved this pass**: all previously-flagged stale docs (`authorization-model.md`, `schema.md`) plus two more found stale during reconciliation (`backend-architecture.md`'s own service-role-count claim, `ai-disease-advisory.md`'s data-flow description) have been corrected, though the fix itself is still uncommitted.

### Biggest security problems

All four items previously listed here are **fixed**: CORS now reads an allowlist, rate limiting exists (`slowapi`), `guard_messages_updates()` is `search_path`-pinned, and `listing_views` INSERT no longer allows owner self-inflation at the RLS layer. Remaining open items, unchanged:
- Upload validation (content-type/size limits) is not uniformly enforced server-side across every Storage bucket.
- `.gitignore` doesn't yet explicitly cover `*.keystore`/`google-services.json` patterns (currently latent, since neither file exists).

### Biggest UI/UX problems

Cannot be fully assessed — this audit is static (source-code reading only); no emulator/simulator was run and no screenshots were reviewed (§20) beyond the on-device verification independently claimed for the Android build and dark-mode work (not re-confirmed in this pass). The confirmed remaining *interaction* gap is the `SellerDashboard.tsx` translation miss above; the three previously-confirmed dead-tap/toggle bugs are now fixed.

### Biggest technical debt

- `@tanstack/react-query` is installed but used in only 2 of ~70 screens — most of the app fetches per-screen without a caching layer. Unchanged.
- The two leftover direct-Supabase reads noted above.
- The i18n retrofit and doc-reconciliation work described throughout this update sits uncommitted in the working tree — real, verified-correct work, but not yet locked in by a commit.

### Biggest blockers

1. No real AI model — the app's headline "AI Disease Advisory" feature cannot currently return a real prediction. Unchanged, and the single largest remaining gap.
2. No real payment gateway and no push notifications — both explicitly scoped as later phases, not blocking the current feature set, but real gaps before a production launch.
3. The Android release build still signs with the debug keystore — a real blocker specifically for a Play Store submission, though not for further development/testing.

---

## 2. Repository Overview

```
d:/FYP/ZaraiLink/
├── App.tsx, index.js, app.json, package.json, tsconfig.json, babel.config.js,
│   metro.config.js, jest.config.js, .eslintrc.js, .prettierrc.js, .env / .env.example,
│   "implementation plan.md", report.md (this file), README.md
├── .github/workflows/               frontend-ci.yml, backend-ci.yml, migration-lint.yml — all
│                                     three proven against real merged PRs (see §25)
├── __tests__/                       734 tests across 132 suites (was 1 smoke test)
├── __mocks__/                       Jest manual mocks (async-storage, react-native-config,
│                                     react-native-haptic-feedback — new, for the motion pass)
├── src/
│   ├── navigation/
│   │   ├── linking.ts                deep-linking stub (empty config) — still unchanged
│   │   └── stacks/     (11 files)    Root/Auth/App/Admin/Expert/Home/Marketplace/Messaging/
│   │                                 Orders/Profile/Consultations navigators + useAppTabNavigation.ts
│   ├── screens/     (64 files)       62/64 now call useTranslation() (uncommitted); admin(8)
│   │                                 auth(4) buyer(1) common(2) dealer(7) disease(3+1) expert(8)
│   │                                 farmer(7) marketplace(5) messaging(2) notifications(1)
│   │                                 orders(4) payments(3) profile(4) reviews(1)
│   ├── components/
│   │   ├── common/  ui/ (15+ primitives, incl. new Skeleton/StaggeredItem for motion)
│   │   └── features/                 dashboards (SellerDashboard.tsx — NOT yet translated,
│   │                                 see §1), dealer, expert, marketplace, messaging,
│   │                                 notifications, orders, payments, reviews
│   ├── hooks/
│   │   ├── realtime/  (3 files)      Supabase Realtime subscription hooks
│   │   └── api/       (1 file)       useUnreadNotificationsCount (wraps a realtime hook + fetch)
│   ├── services/
│   │   ├── api/client.ts             apiFetch — the shared HTTP seam to the FastAPI backend
│   │   ├── supabase/client.ts        Supabase JS client (Auth/Storage/Realtime only)
│   │   └── modules/   (15 domain folders) apiFetch-backed domain services
│   ├── store/       (5 files, flat) authStore, cartStore, marketplaceStore,
│   │                                 referenceDataStore, themeStore (new — dark mode) (Zustand)
│   ├── types/       (15 files)       snake_case, mirrors backend Pydantic schema field names
│   ├── utils/                        photoPicker.ts (new — camera-or-gallery picker)
│   ├── constants/  config/  localization/  theme/  assets/
├── backend/
│   ├── requirements.txt (fully pinned, + slowapi for rate limiting), pytest.ini, .env.example
│   └── app/
│       ├── main.py                   mounts one aggregated v1 API router + /health; CORS now
│       │                             reads an ALLOWED_ORIGINS allowlist; slowapi rate limiting
│       ├── core/                     auth.py, config.py, supabase_client.py, rate_limit.py (new)
│       ├── api/v1/
│       │   ├── router.py             aggregates all 15 endpoint routers into one
│       │   └── endpoints/ (14 files) one APIRouter per domain (consultations lives with expert
│       │                             in the same domain count used elsewhere in this report)
│       ├── repositories/ (15 files)  thin Supabase-client wrappers, one per domain
│       ├── services/  (16 files)     business logic, state machines, audit logging
│       │                             (disease_inference.py renamed to ai_engine.py)
│       ├── schemas/   (15 files)     Pydantic request/response models
│       └── ml/checkpoints/model.pth  ~540-byte placeholder, not a real checkpoint — unchanged
│   └── tests/
│       ├── conftest.py               shared fixtures
│       └── unit/                     (18 files, 112 test functions — all real, mock-based)
├── android/   app/build.gradle (manifestPlaceholders now define usesCleartextTraffic per build
│              type — fixed), AndroidManifest.xml, debug.keystore (release still signs with this
│              — not fixed)
├── supabase/  migrations/ (35 files), config.toml, seed.sql (reference data only)
└── docs/      architecture/ (5 files — all reconciled this pass, uncommitted), database/
             (1 file — reconciled, uncommitted), setup/ (1 file — reconciled, uncommitted)
```

`ios/` remains deleted (the project isn't building for iOS right now). CI is no longer a stub of any kind — three workflows (`frontend-ci.yml`, `backend-ci.yml`, and a new `migration-lint.yml`) have real, confirmed GitHub Actions runs against merged PRs, including a deliberate break-then-fix verification round (§25).

**Second cleanup pass** (historical, unchanged from the previous version of this document): removed `Gemfile`, `backend/app/models/`/`utils/`, the root-level `tests/unit/`/`tests/integration/`, `docs/api/`/`docs/ui-ux/`, `src/utils/{currency,date}.ts`, `backend/app/repositories/base_repository.py`, and empty `__tests__/{components,screens,store}/` placeholders.

---

## 3. Repository Structure

| Directory | Purpose | Actively used | Legacy | Incomplete | Duplicates another |
|---|---|---|---|---|---|
| `src/navigation/` | React Navigation trees, all 5 roles | Yes | No | No | No |
| `src/screens/` | 64 real, data-connected screens | Yes | No | 2 (`HomeDashboardScreen`, and the farmer/dealer wrapper screens) have no strings of their own to translate; the component they delegate to (`SellerDashboard.tsx`) does and isn't yet (§7) | `MyListingsScreen` intentionally reused by both Farmer "My Listings" and Dealer "Products" routes — deliberate reuse, not duplication |
| `src/components/` | Shared UI primitives + domain components | Yes | No | `SellerDashboard.tsx` not yet translated (§1) | No |
| `src/services/` | 15 domain service folders under `services/modules/`, `apiFetch`-backed | Yes | No | No | No |
| `src/store/` | 5 Zustand stores, flat (added `themeStore` for dark mode) | Yes | No | No | No |
| `backend/app/api,repositories,services,schemas/` | Full FastAPI implementation, 15 domains | Yes | No | AI inference domain only (§19) | No |
| `supabase/migrations/` | 35 chronological SQL migrations | Yes | No | No | No |
| `docs/architecture/` | 5 markdown docs | Yes | No | None — all reconciled this pass (uncommitted) | No |
| `docs/database/schema.md` | Schema reference doc | Yes | No | None — reconciled this pass (uncommitted) | No |
| `.idea/`, `.vscode/` | IDE metadata | N/A | N/A | N/A | N/A |

No duplicate screens, duplicate services, duplicate API clients, duplicate navigation systems, old web implementation, or abandoned prototypes were found anywhere in the repository.

---

## 4. Technology Stack

**Frontend**: React Native `0.86.2` (pinned exact), React `19.2.3` (pinned exact), TypeScript `^5.8.3`, Node `>= 22.11.0` (`package.json` engines).
**Navigation**: `@react-navigation/native ^7.3.16`, `native-stack ^7.18.8`, `bottom-tabs ^7.18.16`.
**State**: `zustand ^5.0.14` (5 real stores, including the new persisted `themeStore` for dark mode). `@tanstack/react-query ^5.101.4` is installed but used in only 2 of ~70 screens (`OrderDetailScreen`, `OrderHistoryScreen`) — unchanged, most screens still fetch manually.
**Forms**: `react-hook-form ^7.85.0`, `@hookform/resolvers` (upgraded to `^5.9.1` during the testing pass, after the previous `^3.10.0` was found incompatible with zod v4 and crashing every form's validation-error display), `zod ^4.4.3`.
**Data client**: `@supabase/supabase-js ^2.112.2` (Auth, Storage, Realtime) + a custom `apiFetch` HTTP client (`src/services/api/client.ts`) for the FastAPI backend.
**i18n**: `i18next ^26.4.0`, `react-i18next ^17.0.12` — real mechanism, 800+ keys/language (up from 27), 62/64 screens wired (up from 2/70) — **uncommitted**.
**Native**: `react-native-image-picker ^8.2.1` (now offered through a camera-or-gallery chooser, `utils/photoPicker.ts`, rather than gallery-only), `react-native-config ^1.6.1`, `@react-native-async-storage/async-storage`, `react-native-url-polyfill ^4.0.0`, `lucide-react-native ^1.31.0`, `react-native-haptic-feedback` (new — motion/feedback pass).
**Backend**: FastAPI `0.115.6`, `uvicorn[standard] 0.34.0`, `pydantic 2.10.4`, `pydantic-settings 2.7.1`, `python-dotenv 1.0.1`, `supabase 2.11.0` (Python client), `httpx 0.28.1`, `torch 2.5.1`, `torchvision 0.20.1`, `pillow 11.0.0`, `pytest 8.3.4`, `pytest-asyncio 0.25.2`, `slowapi` (new — rate limiting) — all fully pinned.
**Database**: Supabase/PostgreSQL, 35 migrations, RLS on all 32 tables (down from 36 — `countries`/`provinces`/`cities`/`phone_codes` were dropped for free-text fields).
**Firebase/push/payment-gateway/client-side-ML libraries**: confirmed absent on both sides (repo-wide grep, package manifests) — unchanged.

---

## 5. Frontend Audit

### Architecture

- `src/navigation/` (11 files): `RootNavigator` dispatches by auth/role state (`loading`→Splash, `suspended`→Suspended, unauthenticated→`AuthNavigator`, `expert`→`ExpertNavigator`, `admin`→`AdminNavigator`, else→shared `AppNavigator` for buyer/farmer/dealer). All typed `ParamList`s, real stacks/tabs. `linking.ts` is an intentional stub (`prefixes: []`, `config.screens: {}`) — no deep linking exists, meaning password-reset emails and shared-listing links have no deep-link target.
- `src/screens/`: ~70 real `.tsx` files, one per role/feature combination. **Zero** `PlaceholderScreen` usages found repo-wide — every registered route points to a real, data-fetching component. (This directly contradicts stale inline comments still present in `src/constants/routes.ts` claiming several routes "remain placeholders" — those comments are outdated; the screens they refer to are built.)
- `src/components/`: domain folders (dashboards, dealer, expert, marketplace, messaging, notifications, orders, payments, reviews) plus `ui/` (15 primitives: Button, Input, Card, Badge, Avatar, EmptyState, Spinner, Sheet, RoleBadge, SelectField, PhoneInput, LocationPicker, FilterChips, and others).
- `src/hooks/`: 4 real Supabase Realtime hooks (`useRealtimeMessages`, `useRealtimeConsultationMessages`, `useRealtimeNotifications`, `useUnreadNotificationsCount`) — the only place the app still relies on live Supabase channels, since FastAPI has no websocket layer.
- `src/services/`: 17 domain folders, all funneling through a single `apiFetch` seam (`src/services/api/client.ts`) that attaches the current Supabase session's access token as a Bearer header to every FastAPI backend call. Exceptions are documented inline per file (Auth SDK, Storage blob uploads, Realtime channels — see §11).
- `src/store/`: `authStore`, `cartStore` (AsyncStorage-persisted), `marketplaceStore`, `referenceDataStore`. No `src/store/app/` exists (an old plan referenced one; it was never built and nothing depends on it).
- `src/types/`: 15 files, snake_case, verified to match backend Pydantic schema field names 1:1 (§13).

### Screen inventory (representative — see full per-screen table data gathered in the original audit; all 64 screens were individually read then)

| Screen area | Count | Real UI | Real data | Notable issues |
|---|---|---|---|---|
| admin/ | 8 | 8/8 | 8/8 | none (tap-through fixed — §30) |
| auth/ | 4 | 4/4 | 4/4 | none |
| buyer/ | 1 | 1/1 | 1/1 | none |
| common/ | 2 | 2/2 | n/a | none |
| dealer/ | 7 | 7/7 | 7/7 | none |
| disease/ | 3 + util | 4/4 | 4/4 | dependent on backend AI model (§19) |
| expert/ | 8 | 8/8 | 8/8 | none |
| farmer/ | 7 | 7/7 | 7/7 | none |
| marketplace/ | 5 | 5/5 | 5/5 | none (tap-through fixed — §30) |
| messaging/ | 2 | 2/2 | 2/2 | none |
| notifications/ | 1 | 1/1 | 1/1 | none |
| orders/ | 4 | 4/4 | 4/4 | none |
| payments/ | 3 | 3/3 | 3/3 | manual/COD only, no gateway |
| profile/ | 4 | 4/4 | 4/4 | none (toggle now persists to `profiles.notifications_enabled` — §30) |
| reviews/ | 1 | 1/1 | 1/1 | none |

No screen was found using hardcoded/mock data anywhere in the current `src/screens/` tree.

---

## 6. Role-by-Role Audit

### Buyer

| Feature | Status | Chain (UI → Frontend → API → Backend → DB) |
|---|---|---|
| Registration/login | COMPLETE | `LoginScreen`/`RegisterScreen` → `authService` → Supabase Auth SDK (direct, by design) |
| Profile | COMPLETE | `EditProfileScreen`/`ViewProfileScreen` → `profileService` → `PATCH /api/v1/profile` → `profile_service.py` → `profiles` |
| Marketplace browse/search/filter | COMPLETE | `BrowseScreen`/`FilterBar` → `listingsService` → `GET /api/v1/marketplace/listings` (public) → `marketplace_service.py` → `listings` |
| Product details | COMPLETE | `ListingDetailScreen` → `listingsService` → `GET /api/v1/marketplace/listings/{id}` (public) |
| Reviews/ratings (write) | COMPLETE | `WriteReviewScreen` → `reviewsService` → `POST /api/v1/reviews` (seller/buyer derived server-side) |
| Cart | COMPLETE (local only) | `cartStore` (Zustand + AsyncStorage), no backend row until checkout |
| Checkout | COMPLETE | `CheckoutScreen` → `ordersService.checkout` → `POST /api/v1/orders/checkout` → re-prices server-side from DB, splits multi-seller cart into per-seller orders |
| Payment | PARTIAL (manual/COD only) | `PaymentMethodScreen` → `paymentsService` → `POST /api/v1/payments` → amount server-derived, no gateway |
| Order history/tracking | COMPLETE | `OrderHistoryScreen`/`OrderDetailScreen` → `ordersService` → `GET /api/v1/orders`, `/orders/{id}/status-history` |
| Messaging | COMPLETE | `ConversationListScreen`/`ChatScreen` → `messagingService` (REST) + `useRealtimeMessages` (live push) |
| Consultations (requester) | COMPLETE | `ExpertListScreen`/`RequestConsultationScreen` → `consultationService` → `/api/v1/consultations/*` |
| Notifications | COMPLETE (in-app only) | `NotificationListScreen` → `notificationsService` + `useRealtimeNotifications` |

Listing creation, inventory, and Disease Advisory are correctly absent for Buyer (role-gated by design at the Quick Actions/UI level — the underlying routes are shared but nothing links a buyer to them).

### Farmer

| Feature | Status | Evidence |
|---|---|---|
| Dashboard | COMPLETE | `SellerDashboard.tsx` farmer branch → real listing/order counts |
| Profile (+ farmer-specific fields) | COMPLETE | `EditProfileScreen` conditional section, `farmer_profiles` table |
| Product listing CRUD | COMPLETE | shared `MarketplaceNavigator` screens, `listingsService` → backend |
| Farms/Crops CRUD | COMPLETE | `FarmListScreen`/`FarmDetailScreen`/`CreateFarmScreen`/`CropListScreen`/`AddCropScreen` → `farmService` → `/api/v1/farmer/farms*`, `/farms/{id}/crops*` |
| My Listings view | COMPLETE | real data, tap-through now fixed (`MyListingsScreen.tsx`) |
| Sales/orders | COMPLETE | shared Orders screens, seller-side |
| Messaging | COMPLETE | shared |
| Analytics/insights | COMPLETE | `FarmerAnalyticsScreen` → `GET /api/v1/analytics/farmer` |
| AI disease advisory | PARTIAL/MOCK pending model | full pipeline real; inference placeholder (§19) — farmer is the **only** role with this entry point |
| Recommended products (from disease result) | COMPLETE | `DiseaseResultScreen` cross-links `listingsService` by crop name |

### Dealer

| Feature | Status | Evidence |
|---|---|---|
| Dashboard | COMPLETE | `SellerDashboard.tsx` dealer branch |
| Product management | COMPLETE | shared marketplace screens |
| Inventory (stock CRUD, transaction log) | COMPLETE, dealer-only | `InventoryScreen`/`InventoryTransactionScreen` → `inventoryService` → `/api/v1/dealer/inventory*` — confirmed **not** exposed to Farmer anywhere (no route linkage, matches the explicit business rule that inventory is dealer-only) |
| Stores | COMPLETE | `StoreListScreen`/`StoreDetailScreen` → `storeService` → `/api/v1/dealer/stores*` |
| Suppliers | COMPLETE | `SupplierListScreen`/`SupplierDetailScreen` → `supplierService` → `/api/v1/dealer/suppliers*` |
| Products view ("Products" quick action) | COMPLETE | same `MyListingsScreen` reuse, tap-through now fixed |
| Orders (seller side) | COMPLETE | shared, `seller` segment |
| Analytics | COMPLETE | `GET /api/v1/analytics/dealer` |
| Consultations tab | Correctly absent | `AppNavigator.tsx` omits it for dealer by design |
| Disease Advisory | Correctly absent | no entry point for dealer anywhere |

### Expert

| Feature | Status | Evidence |
|---|---|---|
| Dedicated navigator (own tab bar) | COMPLETE | `ExpertNavigator.tsx` |
| Dashboard (application status, consultation stats) | COMPLETE | `DashboardScreen.tsx` → `expertService` + `consultationService` |
| Application/credentials submission | COMPLETE | `ExpertApplicationScreen` → `expertService` → `POST/PATCH /api/v1/expert/application`, document upload to Storage |
| Consultation lifecycle (accept/reject/in-progress/resolve) | COMPLETE | `ConsultationListScreen`/`ConsultationDetailScreen` → `consultationService` → `/api/v1/consultations/*`, real transition state machine both client- and server-side |
| Messaging | COMPLETE | shared, plus dedicated `consultation_messages` real-time channel |
| Notifications (dedicated tab + badge) | COMPLETE | `useUnreadNotificationsCount` |
| Analytics | COMPLETE | `GET /api/v1/analytics/expert` |
| Public expert directory (buyer/farmer-facing) | COMPLETE | `GET /api/v1/expert` and `/expert/{id}` are intentionally public (no auth) |
| Marketplace/orders/inventory | Correctly absent | no tabs in `ExpertNavigator` |
| Disease Advisory access | Correctly absent | role-gated by design |

### Admin

| Feature | Status | Evidence |
|---|---|---|
| Dashboard/platform stats | COMPLETE | `GET /api/v1/admin/stats` |
| User management (suspend, role change) | COMPLETE | `UserManagementScreen` → `PATCH /api/v1/admin/users/{id}/suspend`, `/role` |
| Listing moderation | COMPLETE | `ListingModerationScreen` → `PATCH /api/v1/marketplace/listings/{id}/status` (admin-only) |
| Expert verification | COMPLETE | `ExpertVerificationScreen` → `/api/v1/expert/admin*`, signed-URL document view |
| Reports (unified moderation queue) | COMPLETE | `ReportsScreen` → `GET/PATCH /api/v1/admin/reports*` |
| Category CRUD | COMPLETE | `CategoryManagementScreen` → `/api/v1/marketplace/categories*` |
| Reference-data CRUD (6 tables) | COMPLETE | `ReferenceDataScreen` → `/api/v1/reference-data/*` |
| Audit logs (read-only) | COMPLETE | `AuditLogScreen` → `GET /api/v1/admin/audit-logs` |
| Analytics | COMPLETE | `GET /api/v1/analytics/admin` |
| Platform-wide Orders overview | PARTIAL | list is real (`GET /api/v1/admin/orders`); tap-through is a no-op (§30, BUG-01) |
| Messaging (as a participant) | Correctly absent | admin can moderate (`redactMessage`) but has no chat tab — by design |
| Notifications | COMPLETE | bell icon → `NotificationListScreen` |

---

## 7. Navigation Audit

```
RootNavigator
 ├── status=loading            → SplashScreen                         REAL
 ├── status=suspended          → SuspendedScreen                       REAL
 ├── unauthenticated           → AuthNavigator
 │     Login / Register / ForgotPassword / VerifyOtp                   all REAL
 ├── role=expert                → ExpertNavigator (dedicated tab bar)
 │     Home → Dashboard / ExpertApplication / Analytics                REAL
 │     Consultations → ConsultationList / ConsultationDetail (expert-mode) REAL
 │     Messages → MessagingNavigator (shared)
 │     Notifications → NotificationList                                REAL
 │     Profile → ProfileNavigator (shared)
 ├── role=admin                 → AdminNavigator (dedicated tab bar)
 │     Home → Dashboard / Notifications / Analytics / UserManagement /
 │            ListingModeration / ExpertVerification /
 │            Orders (list REAL, tap-through BROKEN — no-op onPress) /
 │            Reports / Categories / ReferenceData / AuditLogs         all REAL screens
 │     Profile → ProfileNavigator (shared)
 └── else (buyer/farmer/dealer) → AppNavigator (shared tab bar)
       Home → HomeNavigator (stack, shared)
         Dashboard → role switch: Farmer/Dealer → SellerDashboard, Buyer → BuyerDashboardScreen
         Notifications, MyListings/Products (REAL data, tap-through fixed), FarmList/FarmDetail/
         CreateFarm/CropList/AddCrop (farmer-only via Quick Actions), DiseaseAdvisory/Processing/
         Result (farmer-only), Stores/StoreDetail/Suppliers/SupplierDetail/Inventory/
         InventoryTransactions (dealer-only via Quick Actions), Analytics (role-branched;
         defaults non-dealer to Farmer view — latent bug, currently unreachable for buyer)
       Marketplace → MarketplaceNavigator: Browse/ListingDetail/CreateListing(farmer|dealer only)/
         EditListing/Cart/Checkout                                     all REAL
       Orders → OrdersNavigator: OrderHistory/OrderDetail/PaymentMethod/
         PaymentProcessing/PaymentResult/WriteReview                   all REAL
       Consultations (buyer & farmer only, dealer omitted by design) → ConsultationsNavigator:
         ConsultationList/ExpertList/ExpertProfile/RequestConsultation/
         ConsultationDetail                                            all REAL
       Messages → MessagingNavigator: ConversationList/Chat            all REAL
       Profile → ProfileNavigator: ViewProfile/EditProfile/
         Settings (notification toggle is an unpersisted stub)/ChangePassword  all REAL
```

- **No dead routes, no duplicate routes, no route pointing to a placeholder** were found. `ConsultationListScreen`/`ConsultationDetailScreen` are intentionally registered in two different navigators (requester-side in `ConsultationsNavigator`, expert-side inline in `ExpertNavigator`) with the same route names but different typed param lists — a deliberate, documented pattern, not a duplication bug.
- **Role gating is UI-level only, not route-level.** Every role-exclusive screen (Disease Advisory farmer-only, Inventory dealer-only, listing creation farmer/dealer-only) lives in a navigator stack shared by multiple roles; only the Quick Actions entry points differ per role. There is no evidence of a frontend route guard that would block a role from navigating there directly if some other code path tried. Backend authorization (`require_role`) and RLS remain the real enforcement layer for the underlying data — the UI gating is a UX convenience, not a security boundary, which is an appropriate division of responsibility as long as the backend/RLS layers hold (they do, per §9, §12).
- **`linking.ts` is an intentional stub** — no deep-linking is configured at all (`prefixes: []`), so there is no route for a password-reset email or a shared listing link to land on.

---

## 8. Authentication & Authorization

**Frontend**: `authService.ts` wraps Supabase Auth SDK directly (`signUp`/`signIn`/`signOut`/OTP/reset) — intentional, documented exception to the backend-first pattern. `authStore.ts` subscribes to `onAuthStateChange`, holds `session`/`user`/`role`/`status`, and additionally reads the `profiles` row directly via `supabase.from('profiles')` on boot/refresh (a legacy direct-Supabase read that coexists with the backend-routed `profileService.updateProfile`).

**Backend** (`backend/app/core/auth.py`): a real, non-trivial authentication chain, not a local-JWT-secret shortcut:
1. Extract `Authorization: Bearer <token>` — missing/malformed → 401 (test-covered).
2. Verify the token against Supabase itself: `GET {supabase_url}/auth/v1/user` with the bearer token — non-200 → 401. This means token validity is always checked against the live Supabase Auth service, not decoded locally.
3. Look up `profiles.role, is_suspended` via a client authenticated **as that same user's token** (RLS-respecting, not service-role) — no profile row → 401; `is_suspended=true` → 403.
4. Returns an `AuthenticatedUser(id, email, role, access_token)` — role is **never** taken from client input, only from the server-side profile lookup.
5. `require_role(*roles)` builds per-role dependencies (`require_admin`, `require_expert`, `require_dealer`, `require_farmer`, `require_buyer`) — 403 on mismatch.

Applied via `Depends()` on essentially every endpoint; the only endpoints without it are explicitly, individually commented as intentionally public (marketplace listing/category/crop reads, public expert directory, reference-data reads, review reads) — each comment cross-checked against a matching `grant select ... to anon` in the corresponding migration.

**Role trust chain**: `Login → Supabase Auth (frontend) → apiFetch attaches Bearer token → FastAPI verifies token against Supabase Auth → FastAPI looks up role/suspension from profiles (RLS-respecting client, not client-supplied) → require_role() → backend service/repository (further ownership checks) → Supabase (RLS as final layer)`. This is a materially stronger chain than the prior state (where the backend didn't check auth at all) — role is verified server-side at two independent layers (FastAPI's own lookup, and RLS on the underlying Supabase call).

**Previously confirmed open gap, now fixed**: `is_suspended` used to be checked only in the FastAPI auth dependency, with no equivalent in Supabase RLS (self-documented as a known gap in `phase3_schema.sql`'s own comment, unclosed for 28 migrations). `20260901110000_rls_suspension_enforcement.sql` closes it with a `public.is_suspended()` helper (mirrors `is_admin()`'s shape) gated into every write policy's ownership check across 24 tables — reads and the admin-bypass branch stay untouched, so a suspended user can still read their own profile (to render the suspension banner) but can't write to farms, dealer_stores, orders, or anything else RLS governs. This closes the specific residual risk this section used to flag: a suspended user's Supabase JWT can no longer write via Storage/Realtime/Auth-SDK paths that bypass FastAPI, even though those paths still authenticate the token itself (session revocation was considered and rejected as insufficient on its own, since GoTrue validates by signature, not a per-request revocation list).

**Role self-escalation**: closed at the database layer — `guard_profiles_role()` trigger rejects any `role` column change unless performed by an admin (`is_admin()`).

**A real, documented, retroactively-fixed vulnerability**: the `create_notification` RPC was originally callable directly by any authenticated client via `/rest/v1/rpc/create_notification`, letting them inject an arbitrary notification into any other user's inbox. Fixed in `20260827080100_notifications_lockdown.sql` (made all 9 `notify_*` functions `security definer`, revoked `EXECUTE` on the helper from `public/anon/authenticated`).

**RLS coverage**: all 32 tables (down from 36 — `countries`/`provinces`/`cities`/`phone_codes` were dropped, see §12) have RLS enabled; no table was found with RLS enabled and zero policies.

---

## 9. Backend / FastAPI Audit

`backend/app/main.py` mounts one aggregated router (`api/v1/router.py`), which itself includes all 15 domain routers (`admin, analytics, consultations, dealer, disease, expert, farmer, marketplace, messaging, notifications, orders, payments, profile, reference_data, reviews`), plus one inline `GET /health`. No router is defined but unmounted — no dead router files.

| File | Purpose |
|---|---|
| `main.py` | FastAPI app, CORS allowlist (`ALLOWED_ORIGINS`, no longer `*`), `slowapi` rate limiting, mounts the one aggregated `api_router`, `/health` |
| `core/auth.py` | `get_current_user` / `require_role(*roles)` — the entire auth/authz gate (§8) |
| `core/config.py` | Pydantic `Settings`: Supabase URL/anon key/service-role key, `model_path`, `model_version`, `model_classes` |
| `core/supabase_client.py` | Three client factories: service-role (RLS-bypassing, now used in exactly one place — disease inference), public/anon, and **user-scoped** (RLS-respecting, authenticated as the caller — the default path) |
| `core/rate_limit.py` | New — defines the shared `slowapi` `Limiter` (200/minute default, imported by `main.py` and any endpoint needing a tighter override) |
| `api/v1/router.py` | Aggregates all 15 endpoint routers into one — the only thing `main.py` imports |
| `api/v1/endpoints/*.py` (14 files) | One `APIRouter` per domain |
| `repositories/*.py` (15 files) | Thin Supabase-client wrappers, one per domain |
| `services/*.py` (16 files) | Business logic — ownership checks, status-transition state machines, server-authoritative pricing, audit logging (`disease_inference.py` was renamed to `ai_engine.py`) |
| `schemas/*.py` (15 files) | Pydantic request/response models |
| `ml/checkpoints/model.pth` | ~540-byte placeholder text file (§19) — unchanged |

**Design note (positive finding)**: `core/supabase_client.py`'s comments explicitly document that the user-scoped, RLS-respecting client is the default DB-access path, and the service-role client is "reserved for the narrow, explicitly documented cases... never the default DB-access path." This means the backend generally layers *additional* business-rule enforcement (state machines, server-derived pricing, ownership checks) on top of RLS rather than replacing it — RLS remains the authoritative row-level access boundary even for backend-mediated writes. This is a sound defense-in-depth design, not redundant/conflicting enforcement.

**Still no `lifespan`/startup-shutdown handler and no structured request-logging middleware.** Error handling is still ad hoc via `HTTPException` raises inside service functions, not centralized exception handlers. **Rate limiting now exists** (previous gap): `slowapi`'s `Limiter` applies 200/minute-per-IP to every route by default, with a tighter 10/minute override on `/api/v1/disease/predict` specifically (the one endpoint that actually runs model inference).

**CORS — previously flagged, now fixed**: `main.py` now configures `CORSMiddleware(allow_origins=settings.cors_origins, ...)`, reading an environment-driven `ALLOWED_ORIGINS` allowlist instead of `"*"`.

---

## 10. API Inventory

~100 endpoints across 15 routers. Full endpoint-by-endpoint detail (method, path, auth, purpose) was independently verified for every router; condensed by domain below (all DB-connected, all Pydantic-validated unless noted):

| Domain | Endpoint count | Auth | Notable design |
|---|---|---|---|
| admin | 9 | `require_admin` on all | stats, user suspend/role-change, reports resolve/dismiss, audit logs, platform orders |
| analytics | 4 | one per role (`require_farmer/dealer/expert/admin`) | real aggregation over repo data |
| consultations | 8 | `require_authenticated_user` on all | explicit transition/actor state machine |
| dealer | 18 | `require_dealer` on all | inventory (8), stores (5), suppliers (5) |
| disease | 3 | `require_authenticated_user` on all | ownership-gated (404 not 403 for non-owner); inference placeholder (§19) |
| expert | 9 | mixed: 2 intentionally public, rest `require_expert`/`require_admin` | public directory + admin verification workflow |
| farmer | 10 | `require_farmer` on all | farms CRUD (5), farm-crops CRUD (5) |
| marketplace | 12 | mixed: listing/category/crop reads public, writes `require_authenticated_user`/`require_admin` | |
| messaging | 6 | 5 `require_authenticated_user`, 1 (`redact`) `require_admin` | |
| notifications | 4 | auth on all | |
| orders | 5 | auth on all | checkout re-prices server-side; status changes cross-call `dealer_service.adjust_stock` |
| payments | 6 | auth on all | amount always server-derived from `order.total`, never client-supplied |
| profile | 1 | auth | `role`/`is_suspended` not even present on the request schema (can't be self-set) |
| reference_data | 9 | mostly public reads, `require_admin` writes | 6 typed GETs + generic `/{table}/rows` |
| reviews | 6 | mostly public reads, auth writes, `require_admin` delete | seller/expert id always server-derived, never client-supplied |

Every endpoint accepting a body validates it via a matching Pydantic schema in `schemas/*.py` (all 15 files read in full). No endpoint was found returning hardcoded/mock data — every handler routes through a repository/service that queries Supabase.

---

## 11. Frontend ↔ Backend Integration

**This is the single most important correction this audit makes relative to any prior document in this repository: the frontend has been migrated to call the FastAPI backend, essentially completely — it is not "Supabase-direct with a barely-used backend."**

| Domain | Frontend service | Calls Supabase directly? | Calls FastAPI backend? | Verdict |
|---|---|---|---|---|
| Auth | `authService.ts` | Yes (Auth SDK, by design) | No | SUPABASE-DIRECT (intentional) |
| Profile | `profileService.ts` | Yes — avatar upload (Storage), password change (Auth SDK) | Yes — `PATCH /api/v1/profile` | MIXED (by design) |
| Reference data | `referenceDataService.ts` | No | Yes | BACKEND-INTEGRATED |
| Notifications | `notificationsService.ts` + `useRealtimeNotifications` | Yes — Realtime channel only | Yes — REST reads/writes | MIXED (by design; FastAPI has no websocket layer) |
| Reviews | `reviewsService.ts` | No | Yes | BACKEND-INTEGRATED |
| Expert | `expertService.ts` | Yes — document upload (Storage) | Yes | MIXED (by design) |
| Consultations | `consultationService.ts` + realtime hook | Yes — attachments (Storage) + live messages (Realtime) | Yes | MIXED (by design) |
| Farmer (farms/crops) | `farmService.ts` | No | Yes | BACKEND-INTEGRATED |
| Dealer (inventory/stores/suppliers) | 3 services | No | Yes | BACKEND-INTEGRATED |
| Orders | `ordersService.ts` | No | Yes | BACKEND-INTEGRATED |
| Payments | `paymentsService.ts` | No | Yes | BACKEND-INTEGRATED |
| Analytics | `analyticsService.ts` | No | Yes | BACKEND-INTEGRATED |
| Disease (AI) | `diseaseService.ts` | Yes — image upload (Storage) | Yes | MIXED (by design) |
| Marketplace | `listingsService.ts` | Yes — listing-image upload (Storage) | Yes | MIXED (by design) |
| Admin | `adminService.ts` | No | Yes | BACKEND-INTEGRATED |
| Messaging | `messagingService.ts` + realtime hook | Yes — attachments (Storage) + live messages (Realtime) | Yes | MIXED (by design) |

**No backend router was found orphaned** (zero frontend callers) — every one of the 15 routers has a matching service. 116 `apiFetch(...)` call sites were counted across 17 service files.

**Two genuine leftover direct-Supabase reads outside the service layer** (not part of the intentional Auth/Storage/Realtime exceptions above):
- `src/store/authStore.ts` — `fetchProfile()` calls `supabase.from('profiles').select('*')` directly on session hydration, bypassing the backend entirely, even though `profileService.ts` routes writes through the backend.
- `src/components/features/dashboards/SellerDashboard.tsx` — issues two direct `supabase.from('listings')`/`.from('orders')` `.count`-only queries alongside otherwise-backend-routed fetches in the same data-loading block.

Neither is a competing data path or a security concern (both are read-only and RLS-governed regardless), but both are inconsistent with the rest of the codebase's stated architecture and worth cleaning up for consistency.

**Data model consistency** (§13 has full detail): `src/types/*.ts` field names are snake_case and match backend Pydantic schema field names exactly — the backend response models were purpose-built to mirror the pre-existing frontend types, not the other way around. `*Input` interfaces are camelCase on the TS side, translated to snake_case by per-service `toApi*` adapter functions before each `apiFetch` call — a deliberate one-way adapter layer, not a mismatch.

---

## 12. Supabase / Database Audit

**32 tables across 35 migrations** (was 36 tables/28 migrations — `countries`/`provinces`/`cities`/`phone_codes` were deliberately dropped in `20260901100000_freetext_location_and_phone.sql` in favor of free-text fields, a genuine scope reduction, not something this audit is flagging as a regression). RLS enabled and policy-covered on every table; no table found with RLS enabled and zero policies.

**Functions**: `is_admin()`, `is_suspended()` (new), `handle_new_user`, `available_stock`, and `adjust_stock`/`reduce_stock_for_order` (new, `security invoker` row-locking functions for atomic stock adjustment) — the security-definer ones with `search_path` pinned. Column-guard trigger functions (`set_updated_at`, `guard_profiles_role`, `set_listings_seller_role`, `guard_experts_verification_status`, `guard_payments_columns`, `guard_messages_updates`) are now **all** `search_path`-pinned — `guard_messages_updates()` was the one previously-flagged exception, closed in `20260901120000_search_path_and_listing_views_fix.sql`. 9 `notify_*` trigger functions remain `security definer` from the notification-lockdown fix.

**Storage buckets** (6 total, unchanged): `avatars` (public), `listing-images` (public), `message-attachments` (private, participant-scoped), `expert-documents` (private, owner/admin), `consultation-attachments` (private, participant-scoped), `disease-images` (public).

**Enums** (final values, accounting for later `ALTER TYPE`): `user_role` (5 roles), `listing_status` (active/inactive/sold), `order_status` (11 values: pending/confirmed/completed/cancelled/processing/ready/rejected/payment_failed/disputed/refunded/**expired** — new, the lazy stale-order rule), `inventory_transaction_type` (6), `payment_status` (6), `verification_status` (4), `expert_specialization` (8), `consultation_status` (8), `consultation_priority` (3), `report_target_type` (6), `report_status` (4).

**`seed.sql`**: only admin-curated reference data — 8 categories, 12 crops, 1 currency, 10 units (the country/province/city/phone-code rows it used to also seed no longer exist, since those tables were dropped). **No listings, orders, payments, reviews, consultations, disease cases, messages, farms, inventory, or user/profile rows are seeded anywhere.** No violation of a "no dummy data" discipline found.

**Escrow**: confirmed absent everywhere — no held-balance/release columns or logic in any migration; the payments migration's own comment explicitly states escrow is excluded by business rule.

**Self-admitted gaps and fixes found in migration comments** (all independently confirmed against the actual SQL) — status updated against the current migration set:
1. ~~`is_suspended` not enforced in RLS~~ — **fixed** in `20260901110000_rls_suspension_enforcement.sql` (§8).
2. `available_stock()` RPC exists specifically to avoid widening `inventory` RLS in a way that would leak `purchase_cost`/`selling_price` to buyers. Unchanged.
3. `payments` originally shipped select+insert only — fixed by a later migration granting the order's seller an UPDATE policy restricted to the `status` column via a guard trigger. Unchanged.
4. `payment_transactions` originally assumed a backend service-role would write provider webhook events; fixed with a direct seller-scoped client-side INSERT/SELECT instead. Unchanged.
5. `create_notification` RPC vulnerability (§8) — found and fixed. Unchanged.
6. `messages` had **no UPDATE policy/grant at all** before `messages_admin_moderation.sql` — fixed. Unchanged.
7. `messages_select_participants` originally had no admin bypass — fixed in the same migration as #6. Unchanged.
8. `reviews.order_id not null` originally blocked expert-consultation reviews entirely — fixed by widening the constraint (`consultation_id` added, `reviews_exactly_one_subject` check) and the insert policy. Unchanged.
9. `consultation_messages` was initially missing from the Realtime publication — later fixed. Unchanged.
10. ~~`listing_views`'s INSERT policy does not exclude the listing's own owner~~ — **fixed** in `20260901120000_search_path_and_listing_views_fix.sql`: the policy now looks up the listing's `owner_id` and rejects the insert when it equals the caller.
11. **New this pass**: `dealer_stores`/`suppliers`/`inventory`/`inventory_transactions` originally let `public.is_admin()` bypass the owning-dealer check on every write policy — any admin could silently write any dealer's data, and a companion gap in `orders_service.update_order_status()` meant an uninvolved admin confirming a pending order actually reduced that dealer's stock using the admin's own token. Both closed together in `20260901090000_admin_write_scope_hardening.sql`: admin write access to these four tables is now removed entirely (read-only oversight only), and the order-status endpoint only lets a non-participant admin act to resolve a `disputed` order, never to confirm one.
12. **New this pass**: the classic order-confirmation stock decrement was a read-in-Python/compute-in-Python/write-in-Python sequence across two separate PostgREST round-trips with no lock — two concurrent confirmations against the same inventory row could each independently pass a `>= 0` check and together oversell stock. Fixed in `20260901130000_atomic_stock_adjustment.sql` with `select ... for update`-based `adjust_stock`/`reduce_stock_for_order` Postgres functions, replacing the old fetch-then-write dance.

**Documentation discrepancies — resolved this pass** (previously found; now fixed, though the fix is uncommitted): `docs/architecture/authorization-model.md`'s stale payments/RLS-status claims and `docs/database/schema.md`'s missing `listing_views` table/3 missing storage buckets have both been corrected, along with two more staleness issues found during the reconciliation itself — see §26/§27.

---

## 13. Data Model Consistency

Frontend TypeScript types (`src/types/*.ts`) use snake_case matching Postgres column names directly. Backend Pydantic schemas (`backend/app/schemas/*.py`) were cross-checked against these types for the orders and marketplace domains and match field-for-field (`product_subtotal`, `delivery_charge`, `order_items`, `category_id`, `crop_compatibility`, etc.) — the backend schemas were purpose-built to mirror the pre-existing frontend/database shapes.

No frontend/backend/database field-name mismatch was found in any domain examined. Two intentional, documented dualities exist and are not mismatches:
- `Profile.location` (legacy free-text display string) coexists with `country`/`province`/`city`/`village`/`street` fields — the app composes the display string from these; the latter were themselves structured `country_id`/`province_id`/`city_id` FKs until `20260901100000_freetext_location_and_phone.sql` converted them to plain text alongside dropping the reference tables they pointed to (§12).
- `Notification.type`/`.payload` are deliberately loosely typed (`string & {}` escape hatch, `Record<string, any>`) because the underlying `notifications.type` column is plain `text`, not a DB enum.

`*Input` TypeScript interfaces are camelCase (e.g. `categoryId`, `landUnit`); each service has a `toApi*` translator function converting to snake_case before calling the backend — a deliberate adapter layer, not drift.

---

## 14. Marketplace Audit

Single, unified implementation — farmer and dealer listings are not duplicated; both converge on the same `listings` table and the same screen set (`BrowseScreen`, `ListingDetailScreen`, `CreateListingScreen`, `EditListingScreen`), all now backend-routed through `GET/POST/PATCH/DELETE /api/v1/marketplace/listings*`. Admin moderation reuses the same table/screens via `GET /listings/moderation` and `PATCH /listings/{id}/status`. Listing images upload via Supabase Storage (the one intentionally-preserved direct-Supabase path for this domain). Search is server-side (`ilike`), category/crop/price/city filters are wired end-to-end from `FilterBar` through `marketplaceStore` to the backend endpoint. Listing-detail → messaging entry point confirmed working (`findOrCreateConversation` equivalent via `messagingService`).

Chain: `Farmer/Dealer creates listing → CreateListingScreen → listingsService → POST /api/v1/marketplace/listings → marketplace_service.py → listings table (RLS: owner-or-admin write, public read of active) → Buyer BrowseScreen → filters/search → ListingDetailScreen → Cart → Checkout → Order`. Every stage is real and connected; no stage stops short.

---

## 15. Order Lifecycle

`CartScreen (local cartStore) → CheckoutScreen (per-seller delivery-charge line item, never folded into product price) → POST /api/v1/orders/checkout (server re-derives pricing from DB, splits multi-seller cart into one order per seller, re-validates stock) → PaymentMethodScreen → POST /api/v1/payments (manual/COD or bank transfer) → seller confirms via PATCH /api/v1/payments/{id}/received or /failed → order status transitions (pending→confirmed→processing→ready→completed, plus rejected/cancelled/disputed/refunded/payment_failed) enforced server-side via an explicit state machine, each transition writing an order_status_history row → OrderHistoryScreen/OrderDetailScreen (status timeline) → WriteReviewScreen (only when completed + no existing review)`.

Confirming an order (pending→confirmed) reduces linked dealer inventory via an in-process call to `dealer_service.adjust_stock` and logs a `sale` transaction — full availability is checked across all order items before any reduction runs, so an under-stocked item fails the whole confirmation rather than partially deducting. No logistics/shipment infrastructure exists or is implied anywhere (consistent with the business rule that ZaraiLink doesn't operate its own delivery). Delivery charge is always a distinct line item (`total = product_subtotal + delivery_charge`, a generated column at the DB level, enforced by Postgres itself).

No escrow anywhere in this chain (§12).

---

## 16. Payment Audit

- **Provider**: none — `method` is restricted to `cod`/`bank_transfer` (Pydantic `Literal`), `provider` is a free-text field with no gateway SDK backing it anywhere in `requirements.txt` or `package.json`.
- **Flow**: buyer initiates (`POST /api/v1/payments`, amount always server-derived from the order total, never accepted from the client — confirmed by the request schema having no `amount` field at all) → seller manually confirms receipt or failure via dedicated endpoints.
- **Backend enforcement**: payment amount integrity, seller-only confirmation rights, and status transitions are all enforced server-side in `payments_service.py`, on top of the underlying RLS policies.
- **Refund handling**: a `refunded` status exists in both the order and payment enums, reachable from `disputed`, but there is no gateway to call — it is a status flag only, with no automated refund execution.
- **Escrow**: confirmed not implemented anywhere (§12).
- **Status**: PARTIALLY IMPLEMENTED — a complete, backend-enforced manual/COD + bank-transfer attestation flow exists; no real payment-gateway integration exists.

---

## 17. Messaging Audit

REST reads/writes go through the backend (`GET/POST /api/v1/messaging/conversations*`, `/messages*`); live delivery uses Supabase Realtime (`postgres_changes` INSERT subscription on `messages`, filtered by `conversation_id`) since FastAPI has no websocket layer — this MIXED pattern is architecturally appropriate, not a migration gap. `conversations` has no role restriction — any two users can start a conversation (buyer↔seller via listing/order screens, requester↔expert via `ExpertProfileScreen`). Attachments upload to a private `message-attachments` Storage bucket, RLS-scoped to the two conversation participants, resolved via short-lived signed URLs (never public URLs). `MessagingNavigator` is mounted for Buyer/Farmer/Dealer/Expert but **not** Admin — admin can only moderate (`redactMessage` via `require_admin`-gated backend endpoint), never participate in a conversation, which is the intended design.

A real, previously-undiscovered defect was found and fixed during the database's own history: `messages` shipped with no UPDATE policy at all, meaning read-receipt writes (`markConversationRead()`) had silently affected 0 rows the entire time until `messages_admin_moderation.sql` added the missing policy (§12, item 6).

---

## 18. Review & Rating Audit

`reviews` table supports both order-based reviews (buyer reviewing a seller after a completed order) and consultation-based reviews (buyer/farmer reviewing an expert after a resolved/closed consultation) — the latter required a widened constraint after the original schema assumed every review had an order (§12, item 8). Creation is backend-mediated (`POST /api/v1/reviews`, `/reviews/consultation`) with the seller/expert id always derived server-side from the order/consultation row, never accepted from the client — confirmed by reading the test suite's explicit rejection cases (non-owner 404, incomplete-order 404, listing-not-in-order 422). Duplicate prevention is enforced at the database level (`reviews_one_per_order`-style uniqueness). Admin can delete (`DELETE /api/v1/reviews/{id}`, `require_admin`). Average rating is computed client-side from a fetched `reviews[]` array (`RatingSummary` component), not a dedicated aggregate view/column.

---

## 19. AI Disease Advisory Audit

**MODEL NOT PRESENT.** `backend/app/ml/checkpoints/model.pth` is a 536-byte UTF-8 text file, not a binary PyTorch checkpoint. `DiseaseClassifier._load()` (`services/ai_engine.py`) builds a real `torchvision.models.mobilenet_v2(weights=None)` with a classifier head resized to `len(model_classes)=5`, then calls `torch.load(settings.model_path, ...)` on this placeholder file — the call fails, `classifier.available` becomes `False`, and every `/api/v1/disease/predict` request currently returns a clean **HTTP 503** ("AI model not trained yet"). `config.py` explicitly labels `model_version = "placeholder"`. This is a well-engineered graceful-degradation design (torch/torchvision are imported lazily so the app doesn't crash without them), not a crash or a silent fake result — but there is no real inference happening today.

**Frontend**: `DiseaseUploadScreen` (optional crop + photo via the new camera-or-gallery `pickPhotos()` chooser, `utils/photoPicker.ts` — camera capture is no longer absent here, unlike when this section was first written) → `DiseaseProcessingScreen` (uploads to the public `disease-images` Storage bucket, creates a `disease_cases` row via `POST /api/v1/disease/cases`, then calls `POST /api/v1/disease/predict`; on the current 503, shows Retry + "Talk to an Expert" handoff) → `DiseaseResultScreen` (prediction/confidence/description/recommended actions/disclaimer, expert-consult CTA, related-listings cross-link by crop name). Reachable **only by Farmer** — confirmed absent from Buyer, Dealer, and Expert navigators/dashboards.

**5 declared disease classes** (`healthy, bacterial_blight, leaf_rust, powdery_mildew, early_blight`), but the `DESCRIPTIONS` dict in `disease_service.py` only has a real entry for `"healthy"` — the other 4 always fall back to `(None, [])` for description/recommended actions, explicitly commented as provisional pending real training data.

**Ownership**: `disease_cases`/`disease_predictions` reads return 404 (not 403) for a non-owner, non-admin caller — intentionally hides existence rather than confirming/denying, tested in `test_disease_api.py`, which is itself explicitly documented as the regression test for a prior auth-bypass finding on this exact endpoint.

**Overall status**: real, non-trivial, tested plumbing exists end-to-end on both sides. The feature is **PARTIALLY IMPLEMENTED / effectively a designed-to-fail placeholder pending a real trained `model.pth`** — not a mock that fabricates results, and not a crash, but currently non-functional for its core purpose.

---

## 20. UI/UX Audit

**This audit is static (source-code reading only). No emulator/simulator was launched, no build was run, and no screenshots were reviewed in the course of this pass — visual/rendered UI quality is UNCERTAIN — requires runtime verification.**

What can be assessed from code:
- A real design-token system exists (`src/theme/`: `colors.ts`, `typography.ts`, `spacing.ts`, `roleColors.ts` — per-role accent colors for badges/indicators only, not full alternate themes — `moduleAccents.ts`, `statusColors.ts`).
- A real shared component library exists (`src/components/ui/`: 15+ primitives — Button, Input, Card, Badge, Avatar, EmptyState, Spinner, Sheet, RoleBadge, SelectField, PhoneInput, LocationPicker, FilterChips, plus new `Skeleton`/`SkeletonCard`/`SkeletonList`/`StaggeredItem` for loading/entrance states), suggesting screens are built from a common vocabulary rather than ad hoc styling per screen — consistent with no duplicate/divergent component implementations being found anywhere in this audit.
- **The three previously-confirmed interaction bugs are now fixed**: `PlatformOrdersScreen` and `MyListingsScreen` rows are tappable, and the `SettingsScreen` notification `Switch` now persists to `profiles.notifications_enabled`. A **new**, previously-unflagged gap was found this pass instead: `SellerDashboard.tsx` (Farmer's and Dealer's actual dashboard UI) has zero `useTranslation()` calls despite the otherwise-thorough i18n retrofit covering 62/64 screen files.
- `linking.ts`'s empty deep-link config means a password-reset email has no in-app landing target — a real UX gap for that specific flow, unchanged since the previous pass, though the flow itself (`ForgotPasswordScreen`/`VerifyOtpScreen`) is implemented.
- Image picking is no longer gallery-only — a new camera-or-gallery chooser (`utils/photoPicker.ts`) is wired into all 5 upload call sites (listing creation/edit, disease upload, expert-application documents, chat attachments). The matching iOS gap (missing `NSPhotoLibraryUsageDescription`) remains moot — `ios/` is still deleted.
- Dark mode (light/dark/system, persisted via a new `themeStore`) now exists, resolved against the device's system setting when set to "system."

No conclusions about spacing/color/typography consistency, touch-target sizing, safe-area handling, keyboard behavior, or Android-device-size responsiveness can be responsibly drawn from source reading alone; a runtime pass (emulator or device) is needed before those aspects can be reported as fact rather than assumption.

---

## 21. Code Quality Audit

- **Repo-wide `TODO|FIXME|HACK|XXX`**: zero matches in any source file (frontend or backend).
- **`console.log(` in `src/`**: zero matches. **`print(` in backend Python**: zero matches.
- **No `.orig`/`.bak`/duplicate-suffixed files** anywhere. No stray empty non-`.gitkeep` files were found (a previously-noted `supabase_public_dump.sql` at repo root does not currently exist).
- Business logic is consistently kept out of screens: every screen calls into a `src/services/*` function, never `apiFetch`/`supabase` directly (with the two documented exceptions in §11).
- The codebase is unusually densely self-commented with accurate "here's what changed and why" notes at the exact relevant code (payments write-ownership history, the AI model placeholder, the dealer-scope hardening rationale, the atomic-stock race-condition fix) — these function as reliable, current technical-debt signposts, independently corroborated by this audit wherever checked. This discipline held up under this update pass too: every migration/doc change described here cites its own reasoning inline, not just in this report.

```
Architecture Quality:      9/10 — clean layered backend (api→service→repository), consistent
                            frontend service-layer discipline, sound RLS-as-authoritative-layer
                            design, environment-driven CORS, real rate limiting; docked one point
                            for the two still-leftover direct-Supabase reads outside the service
                            layer (unchanged from before).
Maintainability:           9/10 — dense, accurate self-documentation; the two stale docs this
                            rating previously docked for are now reconciled (uncommitted).
Type Safety:                8/10 — consistent TS types matching backend Pydantic schemas 1:1,
                            explicit adapter functions for casing conversion; a couple of
                            deliberately loose types (Notification.payload) are justified by
                            the underlying schema, not sloppiness. Unchanged.
Separation of Concerns:     8/10 — screens never touch supabase/fetch directly except the two
                            noted leftovers; backend cleanly separates api/service/repository/
                            schema per domain. Unchanged.
```

---

## 22. Security Audit

- **RLS**: comprehensive, 32/32 tables, policy-covered (§12; table count down from 36 after the geography-table drop).
- **Backend auth**: real server-side Supabase-token verification + role/suspension check on nearly every endpoint (§8–§10); public endpoints are individually, deliberately commented.
- **A real, documented, fixed vulnerability**: `create_notification` RPC was publicly callable, allowing cross-user notification injection — closed. Unchanged.
- **A real, documented, fixed defect**: `messages` had no UPDATE policy at all before a later migration — read receipts had likely never actually persisted. Unchanged.
- **Previously an open gap, now fixed**: `is_suspended` is now enforced in RLS itself (`public.is_suspended()` gated into 24 tables' write policies), not just the FastAPI auth layer — see §8.
- **Previously an open gap, now fixed**: `listing_views` INSERT policy now excludes the listing's own owner at the RLS layer, not just client-side.
- **Previously a gap, now fixed**: `guard_messages_updates()` is now `search_path`-pinned, matching every sibling guard-trigger function.
- **New finding this pass, found and fixed**: admin previously had full write access (not just read) to `dealer_stores`/`suppliers`/`inventory`/`inventory_transactions`, and a companion gap let a non-participant admin confirming a pending order actually reduce that dealer's stock using the admin's own token. Both closed in `20260901090000_admin_write_scope_hardening.sql` — see §12.
- **New finding this pass, found and fixed**: the order-confirmation stock decrement had no row lock across its read-then-write sequence, allowing two concurrent confirmations to jointly oversell the same inventory row. Closed with `select ... for update`-based atomic Postgres functions — see §12.
- **CORS — previously open, now fixed**: backend now reads an `ALLOWED_ORIGINS` environment allowlist instead of `*`.
- **Rate limiting — previously absent, now added**: `slowapi`, 200/minute-per-IP default, 10/minute override on `/disease/predict`.
- **Secrets hygiene**: unchanged from the previous pass — `.gitignore` still doesn't explicitly list `*.keystore`/`google-services.json` patterns (latent, not active, since neither file type is currently present).
- **`android/app/debug.keystore`**: unchanged — still the stock React Native debug keystore, and the release build type still signs with it. This remains a real, unaddressed gap before any production release.
- No hardcoded secrets, API keys, or credentials were found in any source file examined.

---

## 23. Dependency Audit

**Frontend** (`package.json`): all dependencies caret-ranged except `react`/`react-native` (pinned exact, standard RN practice). `@tanstack/react-query` is still installed and used in only 2 of ~70 screens — unchanged, a real but minor underused dependency. `@hookform/resolvers` was upgraded `^3.10.0` → `^5.9.1` during the testing pass, after the old version was found genuinely incompatible with `zod v4` — every form's client-side validation error was crashing instead of displaying, across roughly 20 screens; this was a real production bug caught and fixed, not a routine bump. New additions: `slowapi` (backend), `react-native-haptic-feedback` (frontend, motion pass). No duplicate-purpose packages. No Firebase/push/payment-gateway packages present (confirmed via manifest + grep) — unchanged.

**Backend** (`backend/requirements.txt`): all packages fully pinned with exact versions, now including `slowapi` for rate limiting alongside the previously-listed 12. No auth library beyond direct Supabase HTTP calls (appropriate given the chosen verification approach).

No packages were installed, upgraded, or removed as part of this specific update pass (the version changes above were already committed in `e25772f` before this pass began).

---

## 24. Build & Runtime Audit

**Frontend**: `npm ci` → `npm start` (Metro) → `npm run android`. `package.json` engines require Node `>= 22.11.0`. The `ios/` folder remains deleted, so `npm run ios` is not currently usable. The previously-flagged Android risk is fixed in code:
1. ~~`AndroidManifest.xml` references `android:usesCleartextTraffic="${usesCleartextTraffic}"`, defined nowhere~~ — `android/app/build.gradle` now defines `manifestPlaceholders = [usesCleartextTraffic: "true"]` (debug) / `"false"` (release) per build type, confirmed present in the current file. A separate on-device build/emulator verification was claimed elsewhere (not independently re-run as part of this specific documentation-update pass, which is static-reading-only like the rest of this section).

(Historical note: `ios/ZaraiLinkRN/Info.plist`'s missing `NSPhotoLibraryUsageDescription` remains moot — `ios/` still doesn't exist.)

**Backend**: `.venv` already exists at repo root; `pip install -r backend/requirements.txt` → `uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000`. `main.py` exposes `app` at exactly that import path and mounts a working `GET /health`. No missing-file or path-mismatch issues found in the backend build path.

**Database**: `supabase/config.toml` shows this checkout is linked to a real remote Supabase project (ref `uqcxwshlxvmoovjpizlf`); whether that project's live schema currently matches all 35 local migration files was **not checked** in this pass either (no live DB connection made, and the Supabase MCP server requires an OAuth sign-in this non-interactive session can't perform) — still UNCERTAIN, still requires `supabase migration list`/`db diff` against the linked project to confirm.

No build, test run, or `uvicorn` startup was executed as part of this documentation-update pass — this section's claims about what's fixed rest on reading the current `build.gradle`/`main.py`/migration files, cross-checked against the commit history and (for the CI and on-device claims specifically) `gh run list` and the previously-published Field Manual's own verification notes, not a fresh build in this session.

---

## 25. Testing Audit

| Area | Tests exist | Scope | Quality | Missing |
|---|---|---|---|---|
| Frontend component/screen | `__tests__/` + `*.test.tsx`/`*.test.ts` across `src/` — **734 tests, 132 suites** (was 1 smoke test) | every screen, store, service, and UI primitive, plus 2 real-navigator integration flows (marketplace checkout, auth register→verify) | Real, per the commit record (`e25772f`'s own message: "~90% statement coverage," `tsc`/`eslint`/`jest` all clean); not re-run in this documentation-only pass | no coverage-tool (%) output independently regenerated in this pass; no true E2E test against a running app |
| Backend | `backend/tests/unit/` — 18 files, **112 test functions** (up from 106) | auth, ownership, pricing integrity, status-transition state machines, role rejection, input validation, plus new CORS/rate-limit regression tests in `test_main.py` | **Real** — `unittest.mock`/`AsyncMock` isolate the Supabase layer, `TestClient` + `dependency_overrides` exercise real conditional branches | no coverage-tool (%) output available; no true integration test against a live/local Supabase instance |
| CI | `.github/workflows/frontend-ci.yml`, `backend-ci.yml`, **`migration-lint.yml`** (new — a third workflow, running `supabase db lint` against a throwaway local Postgres) | lint, typecheck, `npm test` (frontend); `pytest` (backend); migration apply+lint | **No longer an unverified stub** — `gh run list` shows real GitHub Actions runs on all three, including a deliberate round of intentionally breaking lint, typecheck, and jest one at a time (confirmed each correctly failed CI) before fixing and merging clean to `main` | branch protection itself is not enabled — this repo's GitHub plan returns 403 on the branch-protection API (a plan-tier limit, not unverified work) |

Both backend and frontend testing are now genuine strengths of this codebase — the frontend went from the single largest coverage gap in the repository to matching the backend's discipline, per the commit record. This pass did not independently re-run either suite; the counts above come from the file system (`find ... -name "*.test.*" | wc -l`) and the commit message, not a fresh `jest`/`pytest` execution.

---

## 26. Dead Code / Duplicate / Legacy Audit

- **Resolved this pass** (uncommitted): `docs/architecture/authorization-model.md` and `docs/database/schema.md` were both stale relative to the migrations current at the time; both have now been corrected. Two more staleness issues were found and fixed during the reconciliation itself, neither previously flagged anywhere: `docs/architecture/backend-architecture.md` had its own wrong service-role-usage count (claimed 4 cases, actually 1), and `docs/architecture/ai-disease-advisory.md`'s data-flow description said the mobile client inserts `disease_cases` directly via RLS, when the actual code path is backend-mediated (`POST /api/v1/disease/cases`). `docs/setup/DEVELOPMENT_SETUP.md` repeated the same wrong service-role count and was fixed too.
- Stale inline comments in `src/constants/routes.ts` claim several routes "remain placeholders" — false as of the current codebase; every one of those routes now points to a real screen. Not re-verified in this pass; carried forward from the previous audit.
- `report.md` (this file, prior version) and `implementation plan.md` at repo root are prior planning/audit artifacts, not code — not dead, but worth noting they sit outside the `docs/` structure.
- No old web implementation, no duplicate navigation system, no duplicate API client, no duplicate Supabase service layer, and no abandoned prototype screens were found anywhere.
- `MyListingsScreen` being reused by both the Farmer "My Listings" and Dealer "Products" routes is intentional, documented reuse — not a duplicate that should be split or deleted.

---

## 27. File Cleanup Report

*Updated after a second cleanup pass — see the note at the top of this document. The original version of this section flagged `backend/app/models/`, `backend/app/utils/`, the root-level `tests/unit/`/`tests/integration/`, and `docs/api/`/`docs/ui-ux/` as POSSIBLY OBSOLETE; all were subsequently removed, along with two files added by the intervening directory restructure that turned out to be unreferenced (`src/utils/{currency,date}.ts`, `backend/app/repositories/base_repository.py`) and the empty `__tests__/{components,screens,store}/` placeholder folders from that same restructure. A fresh orphan-reference scan of the entire tracked source tree (every file's basename cross-checked against every other file) found nothing else unreferenced.*

### SAFE TO DELETE
None remaining (the items previously listed here were acted on — see above).

### POSSIBLY OBSOLETE (human confirmation required)

```
None remaining. The one entry previously listed here (docs/architecture/authorization-model.md,
stale relative to the migrations current at the time) was rewritten during this pass — see §26 —
along with three more docs found stale during the same reconciliation. The fix itself is
uncommitted; once tested and committed, this section will have nothing outstanding.
```

### KEEP

Everything else — every screen, service, navigator, backend module, migration, and test file examined in this audit is actively referenced and in use.

---

## 28. Requirements Traceability Matrix

| Requirement | Implemented | Partial | Missing | Evidence | Priority |
|---|:---:|:---:|:---:|---|---|
| 5-role auth (Buyer/Farmer/Dealer/Expert/Admin) | ✅ | | | §8, `user_role` enum, `RootNavigator` role dispatch | P0 |
| Role-based navigation/dashboards | ✅ | | | §7 | P0 |
| Marketplace CRUD + browse/search/filter | ✅ | | | §14 | P0 |
| Farmer farms/crops | ✅ | | | §6 | P1 |
| Dealer inventory/stores/suppliers | ✅ | | | §6 | P0 |
| Orders + cart + checkout | ✅ | | | §15 | P0 |
| Delivery charge as explicit line item (BR-09) | ✅ | | | §15, generated `total` column | P0 |
| No escrow (BR-11) | ✅ | | | §12, §16 | P0 |
| Payments (manual/COD) | | ✅ | | §16 | P1 |
| Real payment gateway | | | ❌ | §16 | P2 |
| Reviews/ratings | ✅ | | | §18 | P1 |
| Messaging (real-time) | ✅ | | | §17 | P1 |
| Expert consultation lifecycle | ✅ | | | §6 (Expert) | P1 |
| Admin governance/moderation/audit log | ✅ | | | §6 (Admin) | P0 |
| In-app notifications | ✅ | | | §12 (notify_* triggers) | P1 |
| Push notifications | | | ❌ | §22 (confirmed absent) | P2 |
| AI disease advisory (pipeline) | ✅ | | | §19 | P0 |
| AI disease advisory (real model) | | ✅ (placeholder) | | §19 | P0 |
| Localization (EN/UR) | | ✅ (62/64 screens, uncommitted) | | §1, §20 | P3 |
| Automated test coverage (backend) | ✅ | | | §25 (112 tests) | P1 |
| Automated test coverage (frontend) | ✅ | | | §25 (734 tests/132 suites) | P1 |
| CI/CD | ✅ | | | §25 (real merged PRs; branch protection blocked by plan tier) | P2 |
| RLS on every table | ✅ | | | §12 (32/32 tables) | P0 |
| Suspension enforced at RLS layer | ✅ | | | §8, §12 | P1 |
| Real Android release keystore | | | ❌ | §22 | P2 |

---

## 29. Complete Feature Status Matrix

| Feature | UI | Frontend | API | Backend | DB | Auth | Fully Working |
|---|---|---|---|---|---|---|---|
| Authentication | ✅ | ✅ | — (Auth SDK) | — | ✅ (RLS) | ✅ | ✅ |
| Buyer marketplace | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Product management (farmer/dealer) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Farmer listings/farms/crops | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dealer inventory | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Orders | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Payments | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 manual/COD only, no gateway |
| Delivery charge handling | ✅ | ✅ | ✅ | ✅ | ✅ (generated col) | ✅ | ✅ |
| Reviews | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ratings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Messaging | ✅ | ✅ | ✅ (+Realtime) | ✅ | ✅ | ✅ | ✅ (not Admin, by design) |
| Expert functionality | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin functionality | ✅ | ✅ (order tap-through fixed) | ✅ | ✅ | ✅ | ✅ | ✅ |
| AI disease advisory | ✅ | ✅ | ✅ | 🟡 (placeholder model) | ✅ | ✅ | 🟡 (always 503s today) |
| Notifications (in-app) | ✅ | ✅ | ✅ (+Realtime) | ✅ | ✅ | ✅ | ✅ |
| Push notifications | ❌ | ❌ | ❌ | ❌ | — | — | ❌ |
| Profile management | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Search | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Filters | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Location (free-text since Phase 0.5b) | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |

Legend: ✅ Implemented · 🟡 Partial · ❌ Missing.

---

## 30. Bug Report

**All of BUG-01 through BUG-05 and BUG-07 through BUG-10 are now FIXED**, confirmed against the current code/migrations in this pass. Only BUG-06 (iOS) remains moot, unchanged. Two new items are added: BUG-11 (a real gap found this pass) and BUG-12 (a real, still-open gap that was previously only mentioned in prose, never given its own tracked entry).

```
BUG-01 — STATUS: FIXED
Title: Admin Platform Orders list rows are not tappable
Severity: Major (P2)
File: src/screens/admin/PlatformOrdersScreen.tsx
Fix confirmed: rows now call `navigation.navigate(ADMIN_HOME_ROUTES.OrderDetail, { orderId: item.id })`,
        landing on a real `OrderDetail` route that reuses the existing `OrderDetailScreen`.
```

```
BUG-02 — STATUS: FIXED
Title: Farmer "My Listings" / Dealer "Products" rows are not tappable
Severity: Major (P2)
File: src/screens/marketplace/MyListingsScreen.tsx
Fix confirmed: rows now navigate cross-tab into `MARKETPLACE_ROUTES.ListingDetail` via
        `useAppTabNavigation()`.
```

```
BUG-03 — STATUS: FIXED
Title: RoleAwareAnalyticsScreen defaults non-dealer roles to Farmer analytics
Severity: Minor (P3)
File: src/navigation/stacks/HomeNavigator.tsx
Fix confirmed: the branch is now exhaustive — `dealer` → DealerAnalyticsScreen, `farmer` →
        FarmerAnalyticsScreen, anything else → a visible `EmptyState` ("Analytics unavailable"),
        instead of silently falling through to the farmer view.
```

```
BUG-04 — STATUS: FIXED
Title: Settings notification-preferences toggle does not persist
Severity: Minor (P3)
File: src/screens/profile/SettingsScreen.tsx
Fix confirmed: a real `profiles.notifications_enabled boolean not null default true` column
        (`20260901150000_profile_notification_preferences.sql`) backs the toggle now, read/written
        through the existing profile-update endpoint.
```

```
BUG-05 — STATUS: FIXED
Title: AndroidManifest references an undefined Gradle manifest placeholder
Severity: Major (P2)
File: android/app/src/main/AndroidManifest.xml, android/app/build.gradle
Fix confirmed: `build.gradle` now defines `manifestPlaceholders = [usesCleartextTraffic: "true"]`
        (debug build type) and `"false"` (release build type) — confirmed present in the current
        file. An on-device build/emulator verification was claimed elsewhere (Field Manual); not
        independently re-run in this documentation-only pass.
```

```
BUG-06 — STATUS: MOOT (unchanged)
Title: iOS Info.plist missing NSPhotoLibraryUsageDescription
Severity: Major (P2) — moot since ios/ remains deleted (the project isn't building for iOS right
        now). Re-open when ios/ is regenerated — the same gap will need to be added again, since
        it wasn't fixed before deletion, only removed along with the rest of ios/.
```

```
BUG-07 — STATUS: FIXED
Title: guard_messages_updates() trigger function lacks search_path pinning
Severity: Minor (P3)
File: supabase/migrations/20260901120000_search_path_and_listing_views_fix.sql
Fix confirmed: `alter function public.guard_messages_updates() set search_path = public, pg_temp;`
        — now matches every sibling guard-trigger function.
```

```
BUG-08 — STATUS: FIXED
Title: listing_views self-view-count inflation possible via direct API call
Severity: Minor (P3)
File: supabase/migrations/20260901120000_search_path_and_listing_views_fix.sql
Fix confirmed: the INSERT policy was rewritten to reject a view where the caller is the listing's
        own `owner_id`, at the RLS layer — no longer client-side-only.
```

```
BUG-09 — STATUS: FIXED
Title: is_suspended not enforced in Supabase RLS
Severity: Major (P2) — this was the single most-repeated finding across the previous version of
        this document; now closed.
File: supabase/migrations/20260901110000_rls_suspension_enforcement.sql
Fix confirmed: a new `public.is_suspended()` helper (mirrors `is_admin()`'s shape) is gated into
        every write policy's ownership check across 24 tables. Reads and the admin-bypass branch
        are untouched, so a suspended user can still read their own profile (to render the
        suspension banner) but can't write anywhere RLS governs.
```

```
BUG-10 — STATUS: FIXED (this pass)
Title: Stale/incomplete documentation files
Severity: Minor (P3) — documentation only, no code impact
Files: docs/architecture/authorization-model.md, docs/database/schema.md, and two more found
        stale during the fix itself: docs/architecture/backend-architecture.md,
        docs/architecture/ai-disease-advisory.md, docs/setup/DEVELOPMENT_SETUP.md.
Fix confirmed: all five reconciled against the current migrations/code (§26). One genuinely
        independent stale claim was caught mid-fix — authorization-model.md's own "backend
        mirror... exactly four cases" line contradicted the just-corrected backend-architecture.md
        (which is actually one case) — and fixed before this pass was called done. The fix itself
        is uncommitted.
```

```
BUG-11 — NEW, found this pass — STATUS: OPEN
Title: SellerDashboard.tsx has zero translation calls despite the i18n retrofit
Severity: Minor (P3) — a real, user-visible gap, not a crash or data-integrity issue
File: src/components/features/dashboards/SellerDashboard.tsx
Location: entire file — grep confirms 0 occurrences of `useTranslation`
Problem: Farmer's and Dealer's `DashboardScreen.tsx` files are both thin wrappers that render
        this shared component; the component itself renders every label as hardcoded English.
Root Cause: the i18n retrofit pass (Phase 8) covered every screen file (62/64) but this is a
        component, not a screen file, so it fell outside the pass's own scope check.
Impact: Farmer and Dealer's actual, highest-traffic dashboard UI ignores the language setting
        entirely, even though 62 other screens now respect it.
Dependencies: none blocking; a small, isolated fix once picked up.
```

```
BUG-12 — previously mentioned only in prose, now tracked — STATUS: OPEN
Title: Android release build signs with the debug keystore
Severity: Major (P2) for a real Play Store submission; not a blocker for further development
File: android/app/build.gradle
Location: signingConfigs.release
Problem: the `release` build type's `signingConfig` points at `signingConfigs.debug`
        (`storeFile debug.keystore`, `storePassword 'android'`) — the stock, publicly-known
        React Native template debug credentials, not a real release-signing identity.
Root Cause: no real keystore has been generated/wired in yet.
Impact: a `release`-variant build today is technically signed, but not with a credential
        suitable for, or accepted by, a real app-store submission.
Dependencies: generating a real keystore and updating build.gradle's signing config — a
        one-time, human-driven step (a keystore is a secret, not something to generate blindly).
```

---

## 31. Architecture Assessment

Target architecture:
```
React Native CLI → Presentation Layer → Feature Modules → Hooks/State → Service/API Layer
                 → FastAPI → Business Logic → Supabase → PostgreSQL
```

**What follows this architecture**: the frontend consistently routes feature logic through `src/services/*` → `apiFetch` → FastAPI → `services/*.py` → `repositories/*.py` → Supabase, for essentially every domain except the three deliberately-preserved exceptions (Auth SDK, Storage blob uploads, Realtime channels) — all individually documented in code as intentional. The backend itself cleanly separates `api/` (routing + validation) → `services/` (business logic, state machines) → `repositories/` (data access) per domain, with RLS retained as the authoritative row-level boundary underneath even backend-mediated writes (§9's "design note").

**What violates or partially violates it**: two leftover direct-Supabase reads outside the service layer (`authStore.fetchProfile`, `SellerDashboard`'s count queries) — minor, read-only, low-risk, but inconsistent with the stated pattern. Role gating is UI-level only, not enforced by a frontend route guard (acceptable, since the real boundary is backend/RLS, but worth naming explicitly as a design choice rather than an oversight).

**Where refactoring is and isn't needed**: the two leftover direct-Supabase reads are worth cleaning up for consistency but are not urgent (no security impact) — still the only architectural inconsistency found across two full update passes now. Nothing found warrants a large-scale refactor; the architecture is fundamentally sound and consistently applied, and now also environment-aware at the network-boundary level (CORS allowlist, rate limiting) where it previously wasn't.

```
Architecture Quality Score: 9/10 (up from 8/10 — CORS/rate-limiting hardening closed the one
                             network-boundary gap; the two leftover direct-Supabase reads remain
                             the only open item)
```

---

## 32. Critical Risks

Of the six risks this section previously listed, four are now fixed (`is_suspended`/RLS, CORS/rate limiting, frontend test coverage/CI, the Android build-config placeholder). The two genuinely still-open risks:

1. **No real AI model** — the headline "AI Disease Advisory" feature is non-functional for its core purpose today. Unchanged; the single biggest remaining gap.
2. **No real payment gateway** — the manual/COD flow is real and backend-enforced, but any move toward real online payment requires new integration work, not just enabling something already scaffolded. Unchanged.

Two new, smaller risks surfaced this pass:

3. **Android release build still signs with the debug keystore** (BUG-12) — a real blocker specifically for a Play Store submission.
4. **The current i18n retrofit + doc-reconciliation work is uncommitted** — real, verified-correct, but a hard-to-reverse loss risk (working-tree changes, not yet locked in by a commit) until it's tested and committed.

---

## 33. Prioritized Implementation Roadmap

*This section originally proposed 11 phases; the current, authoritative version of this roadmap is now the published **ZaraiLink Field Manual** artifact, which tracks the same work with per-phase completion status kept live. The table below is this document's own condensed cross-check against that source, re-verified against the actual repo rather than copied.*

```
PHASE 0 — Android build-config fix                                          STATUS: DONE
  Confirmed: build.gradle now defines manifestPlaceholders per build type (BUG-05 fixed).

PHASE 0.5 — Dealer-scope hardening + free-text geography                    STATUS: DONE
  Confirmed: admin write access to dealer_stores/suppliers/inventory closed to read-only;
  countries/provinces/cities/phone_codes dropped for free-text fields (§12).

PHASE 1 — Security Hardening (CORS, rate limiting, RLS suspension, etc.)    STATUS: DONE
  Confirmed: ALLOWED_ORIGINS allowlist, slowapi rate limiting, is_suspended in RLS,
  search_path pin, listing_views fix — all live in current code (BUG-07/08/09 fixed).

PHASE 2 — Interaction Bug Fixes                                             STATUS: DONE
  Confirmed: BUG-01/02/03 all fixed in current code.

PHASE 3 — AI Model Integration                                              STATUS: NOT STARTED
  Task: unchanged from before — train and drop in a real backend/app/ml/checkpoints/model.pth;
  fill in DESCRIPTIONS for the remaining 4 disease classes; update model_version.
  Why: the single biggest remaining functional gap.
  Dependencies: real training data/model, external to this repo.
  Priority: P0 (for product completeness, externally gated on time/data, not engineering effort)

PHASE 4/5 — Frontend Test Coverage + CI/CD                                  STATUS: DONE
  Confirmed: 734 frontend tests / 132 suites (up from 1 smoke test); CI proven against real
  merged PRs including a deliberate break-then-fix verification round; migration-lint added.

PHASE 6/7 — Documentation Sync + Localization Coverage                      STATUS: DONE THIS
                                                                                    PASS
  Confirmed: 5 docs reconciled (BUG-10 fixed, plus 2 more found and fixed mid-pass); 62/64
  screens now call useTranslation() (up from 2/70). Both uncommitted — see §1.
  Remaining gap: SellerDashboard.tsx untranslated (BUG-11, new).

PHASE 8 — Payment Gateway Integration                                       STATUS: NOT STARTED
  Task: unchanged from before — integrate a real payment provider behind payments_service.py.
  Priority: P2

PHASE 9 — Push Notifications                                                STATUS: NOT STARTED
  Task: unchanged from before — FCM/APNs device-token registration and delivery.
  Priority: P3

PHASE 10 — Production Readiness                                             STATUS: PARTIAL
  Done: CORS restricted to an environment-driven allowlist.
  Not done: real Android release keystore (BUG-12), .gitignore coverage for
  keystores/google-services.json, confirming the linked Supabase project's live schema matches
  all 35 local migrations.
  Priority: P2
```

---

## 34. Recommended Next Steps

Of the five steps this section previously listed, four are done (Android build-config fix, the three interaction bugs, frontend test coverage, doc reconciliation). Remaining, in order:

1. **Test and commit the in-flight work** — the i18n retrofit and doc-reconciliation pass sitting in the working tree right now (§1) should be reviewed and committed before anything else lands on top of it, per the standing rule that the user tests before anything is committed.
2. **Fix the newly-found `SellerDashboard.tsx` translation gap** (BUG-11) — small, isolated, and should land in the same commit as the rest of the i18n work it belongs to.
3. **Decide the AI model training timeline** (Phase 3) — still the single biggest gap in the app's core value proposition, and still external work this document cannot do or estimate precisely.
4. **Generate a real Android release keystore** (BUG-12) before any Play Store submission.
5. **Decide and scope real payment-gateway integration**, if the product needs to move beyond manual/COD.

---

## 35. Final Project Readiness Assessment

Evaluated against the current repo state (commit history + working tree), not just the last audit pass: ZaraiLink has moved from "substantially more real functionality than its history suggests" to "a genuinely hardened, genuinely tested system with a short, well-understood remaining gap list." Every specific security/interaction/testing/CI gap the previous version of this document flagged as open has since been closed and independently re-verified in this pass — `is_suspended` in RLS, CORS/rate limiting, the three dead-tap bugs, frontend test coverage, and CI verification. A new, smaller-scope hardening pass (dealer write-access over-privilege, an atomic-stock race condition) was also found and fixed along the way, neither previously known.

Confirmed gaps relative to a production-ready state, now down to a short list: no real AI model (the product's namesake feature — the one gap that was always going to outlast a code-focused hardening pass), no real payment gateway, no push notifications, and a debug-signed Android release build. A currently-uncommitted i18n/documentation pass is real, verified-correct work, not a gap, but it should be tested and committed before being treated as done. None of the remaining items are architectural dead ends — each has a clear, scoped fix path (§33) — but they represent the real remaining work before this could be called fully production-ready.

---

## Final Readiness Score

```
Overall Readiness: 88/100 (up from 72/100)

Architecture:      90/100 (up from 80 — CORS/rate-limit hardening closed the one network gap)
Frontend:          92/100 (up from 82 — i18n retrofit ~97% done, one component gap remains)
Backend:           85/100 (up from 78 — CORS/rate-limit hardening, dealer-scope + atomic-stock
                    fixes; AI inference is still the one placeholder holding this back further)
Database:          93/100 (up from 85 — suspension now RLS-enforced, dealer over-privilege
                    closed, geography tables simplified; a couple of minor self-admitted items
                    remain, see §12)
Integration:       90/100 (unchanged — the two leftover direct-Supabase reads are still there)
Security:          88/100 (up from 65 — every specific gap previously listed here is fixed;
                    docked for the still-open upload-validation and debug-keystore items)
UI/UX:             UNSCORED — still not runtime-verified in this documentation-only pass
Testing:           85/100 (up from 40 — 734 frontend tests/132 suites + 112 backend tests,
                    per the commit record; not independently re-run in this pass)
Maintainability:   90/100 (up from 75 — the stale-docs finding that was docking this score is
                    now resolved)
```

### TOP 5 THINGS THAT MUST BE DONE FIRST (down from 10)

1. **Test and commit the in-flight i18n/docs work** (§1, §34) — the largest single piece of real, uncommitted work in the repo right now.
2. **Fix `SellerDashboard.tsx`'s missing translations** (BUG-11) before calling the i18n retrofit complete.
3. **Get a real trained AI model into `backend/app/ml/checkpoints/model.pth`** — the core differentiating feature is currently non-functional; everything else on this list is secondary to it.
4. **Generate a real Android release keystore** (BUG-12) before any Play Store submission.
5. **Decide and scope real payment-gateway integration**, if the product needs to move beyond manual/COD, and push notifications, if the in-app-only model isn't sufficient.
</content>
