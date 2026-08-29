# ZaraiLink Complete Repository Audit

*Read-only, evidence-based audit of the working tree at `d:\FYP\ZaraiLink`, performed via five independent parallel research passes (backend, frontend screens/navigation, frontend↔backend integration, Supabase/database, and security/dependencies/build/testing) plus direct verification of specific claims. No file was modified, created, deleted, or renamed as part of this audit.*

*A prior audit document previously occupied this same file (`report.md`). That document is now **stale and superseded** — it was written before a large, currently-uncommitted development pass added the entire FastAPI backend (14 routers beyond the original disease-only router), `core/auth.py`, 15 sets of repositories/services/schemas, 96 backend tests, and migrated nearly the entire frontend service layer to call that backend. `git status` shows essentially all of `backend/app/`, `src/`, and `supabase/migrations/` as untracked — i.e. real, substantial, uncommitted work exists in this checkout that the previous audit pass did not see. Every claim below was re-verified against the current file contents; nothing here was carried over from the old report without independent confirmation.*

*Post-audit update: after this document was written, two further changes were made to the repository and this document was updated to track them (path references only — the underlying functional findings below were not re-audited beyond what's explicitly noted): (1) the `ios/` folder was deleted (the project isn't building for iOS right now — confirmed no other file depended on it first); (2) a full directory restructure was applied — `backend/app/api/*.py` → `api/v1/endpoints/*.py` behind a new aggregating `api/v1/router.py`, `ml/model.pth` → `ml/checkpoints/model.pth`, `services/disease_inference.py` → `services/ai_engine.py`, a new unused `repositories/base_repository.py` stub, backend tests moved to `tests/unit/` with a new `tests/conftest.py` stub, two new `.github/workflows/*.yml` CI stubs, and on the frontend: `components/{9 domains}` → `components/features/{9 domains}`, `services/{14 domains}` → `services/modules/{14 domains}`, `store/{4 subfolders}` flattened to `store/*.ts`, `hooks/` split into `hooks/{realtime,api}/`, and `navigation/*Navigator.tsx` → `navigation/stacks/`. The restructure was verified afterward: 106/106 backend `pytest` passing, 0 TypeScript errors, 0 ESLint errors, Jest passing — so the functional claims throughout this document (which predate the restructure) remain accurate; only file paths changed.*

---

## 1. Executive Summary

### Current Project Status

```
Overall Completion:   ~78%
Frontend:             ~88%   (screens/navigation essentially complete; localization and a
                               handful of UI bugs are the gaps)
Backend:               ~80%   (broad, well-tested REST API; AI inference is a placeholder)
Database:              ~90%   (comprehensive RLS/migrations; a few self-admitted gaps remain)
Integration:            ~90%   (frontend fully migrated to the FastAPI backend; a couple of
                               legacy direct-Supabase reads remain)
Authentication:         ~85%   (server-verified, role-aware; suspension not enforced at the
                               RLS layer itself)
UI/UX:            NOT RUNTIME-VERIFIED (static code audit only — no emulator/simulator run,
                               no screenshots reviewed; see §20)
Testing:               ~40%   (backend: strong, 106 real tests, confirmed passing; frontend: effectively none)
```

These percentages are estimates derived from the evidence in this document, not measured metrics. They should not be read as more precise than "roughly on track" / "roughly missing half."

### What is genuinely working

- A full ~100-endpoint FastAPI backend (§9–§11) covering all 15 domains (admin, analytics, consultations, dealer, disease, expert, farmer, marketplace, messaging, notifications, orders, payments, profile, reference_data, reviews), with real server-side authentication (Supabase token verification, not a local JWT secret), real role-based authorization, real ownership checks, server-derived pricing (never trusts client-submitted amounts), and 106 real (not stub) unit tests exercising exactly these security-sensitive code paths (confirmed by an actual `pytest` run during the later directory-restructure pass — see the note at the top of this file).
- A frontend that has been substantially migrated onto this backend: 116 `apiFetch(...)` call sites across 17 service files, one call site per backend endpoint domain, with no orphaned backend router found.
- A comprehensive Supabase schema: 36 tables across 28 migrations, RLS enabled and policy-covered on every table, several `security definer` guard triggers closing gaps RLS alone can't express (role self-escalation, expert-verification tampering, payment-column tampering), and a real, documented, retroactively-fixed privilege-escalation vulnerability (§22).
- Every screen registered in every navigator renders real, data-connected UI — no `PlaceholderScreen` component exists anywhere in the current codebase (§7).
- `seed.sql` contains only admin-curated reference data (categories, crops, countries/provinces/cities, currencies, units) — no dummy users/listings/orders, consistent with a "no fake data" discipline.
- No escrow logic anywhere (a business-rule requirement) — confirmed absent in every payments-related migration and schema.

### What is partially working

- **AI Disease Advisory**: the entire upload→case→predict→result pipeline is real end-to-end plumbing (frontend upload, backend endpoint, ownership checks, database rows) but `backend/app/ml/checkpoints/model.pth` is a 536-byte placeholder text file, not a real checkpoint; `torch.load()` on it is designed to fail, so `/api/v1/disease/predict` always returns HTTP 503 today. Only 1 of 5 declared disease classes (`healthy`) has description/recommendation copy.
- **Payments**: a complete manual/COD + bank-transfer attestation flow exists (buyer initiates, seller confirms), fully migrated to backend-mediated writes with server-derived amounts — but there is no real payment-gateway/PSP integration (no such package in `requirements.txt`, no `provider` values beyond a free-text field).
- **Localization**: the i18n mechanism (`react-i18next`, persisted language choice, working Settings toggle) is real, but only 2 of ~70 screens (`SettingsScreen`, `EditProfileScreen`) call `useTranslation()`; both `en.json`/`ur.json` have only 27 keys each.
- **CI/CD**: `.github/workflows/frontend-ci.yml` and `backend-ci.yml` now exist (added during a subsequent directory-restructure pass, after the original version of this audit found none) — minimal stubs (lint/typecheck/test steps) that have not yet been exercised by a real PR/CI run, with no Supabase migration-lint step and no branch-protection wiring yet.
- **Admin platform order oversight**: `PlatformOrdersScreen` lists every order but each card's tap handler is a no-op (`onPress={() => {}}`), so admin cannot drill into an individual order's detail.
- **Farmer "My Listings" / Dealer "Products"**: the shared `MyListingsScreen` fetches and displays the seller's own listings correctly but rows have no `onPress`, so tapping through to edit/detail doesn't work from this screen.

### What is only UI/mock

- The AI disease classifier's inference path is real code (`torchvision.models.mobilenet_v2`, real preprocessing) but currently has no real trained weights to run against — every prediction request fails by design (§19). This is closer to "designed-to-fail placeholder" than "mock," since it doesn't fabricate a fake result — it honestly reports unavailability.
- The Settings screen's notification-preferences `Switch` is a local-only `useState` stub with no backing table or persistence (§7, §20).

### What is broken

- `PlatformOrdersScreen` (admin) — order rows are not tappable, a genuine dead interaction, not a placeholder.
- `MyListingsScreen` (farmer/dealer) — listing rows are not tappable, same class of bug.
- `RoleAwareAnalyticsScreen` — defaults any non-dealer role to `FarmerAnalyticsScreen`; currently unreachable for buyer (no entry point), but a latent bug if that ever changes.
- `AndroidManifest.xml`'s `android:usesCleartextTraffic="${usesCleartextTraffic}"` references a Gradle manifest placeholder that is defined nowhere in any `.gradle` file — a real risk that an Android build fails or the attribute resolves incorrectly (not executed as part of this audit; flagged as needing a real build to confirm).
- (Historical, now moot) iOS `Info.plist` had no `NSPhotoLibraryUsageDescription` key despite 8 files calling `launchImageLibrary` — this would have failed/crashed the image picker on a real iOS device. The `ios/` folder was subsequently deleted (the project isn't building for iOS right now); this will need re-fixing whenever iOS support returns.

### What is completely missing

- Real payment-gateway/PSP integration.
- Push notifications (FCM/APNs) — confirmed absent on both frontend and backend; in-app-only via Supabase Realtime.
- Automated frontend test coverage beyond one default React Native template smoke test in `__tests__/`.
- A real trained AI model file.
- Camera-capture (as opposed to gallery-pick) anywhere an image is uploaded — only `launchImageLibrary` is called, never `launchCamera`.

### Biggest architectural problems

- CORS on the FastAPI backend is fully open (`allow_origins=["*"]`, all methods/headers) with no environment-based restriction.
- `is_suspended` is checked server-side in the FastAPI auth dependency (an improvement over a purely client-side check) but is still **not** enforced inside Supabase RLS itself — a suspended user's still-valid Supabase JWT retains direct-Supabase access (Storage, Realtime, and PostgREST) outside the FastAPI-mediated app paths.
- Two documentation files (`docs/architecture/authorization-model.md`, `docs/database/schema.md`) are stale relative to the current migrations (§26) — not a code defect, but a risk that future contributors trust incorrect docs.

### Biggest security problems

- No rate limiting anywhere in the FastAPI backend.
- `guard_messages_updates()` trigger function lacks the `search_path` pinning every sibling guard-trigger function has (a hardening inconsistency, not an active exploit given current grants).
- `listing_views` INSERT policy doesn't exclude the listing's own owner at the RLS layer — view-count self-inflation is prevented client-side only, per the migration's own comment.
- Wide-open CORS (repeated from above — it is both an architecture and a security concern).

### Biggest UI/UX problems

Cannot be fully assessed — this audit is static (source-code reading only); no emulator/simulator was run and no screenshots were reviewed (§20). The three confirmed *interaction* bugs (non-tappable admin order rows, non-tappable "My Listings"/"Products" rows, unpersisted notification-preference toggle) are real regardless of visual polish.

### Biggest technical debt

- Two stale documentation files that contradict the current schema/migrations.
- `@tanstack/react-query` is installed but used in only 2 of ~70 screens — most of the app fetches per-screen without a caching layer.
- 3 of 6 Supabase Storage buckets are undocumented in `docs/database/schema.md`; `listing_views` table is entirely undocumented there.

### Biggest blockers

1. No real AI model — the app's headline "AI Disease Advisory" feature cannot currently return a real prediction.
2. No automated frontend tests, and the CI workflows that do now exist are unverified stubs — regressions in the ~70-screen frontend would still likely not be caught automatically.
3. The `usesCleartextTraffic` Gradle placeholder is a real risk to getting an Android release build running — not confirmed by an actual build in this audit. (The matching iOS photo-library-permission risk is currently moot — `ios/` was deleted after this finding was first written, since the project isn't building for iOS right now.)

---

## 2. Repository Overview

```
d:/FYP/ZaraiLink/
├── App.tsx, index.js, app.json, package.json, tsconfig.json, babel.config.js,
│   metro.config.js, jest.config.js, .eslintrc.js, .prettierrc.js, .env / .env.example,
│   "implementation plan.md", report.md (this file), README.md
├── .github/workflows/               frontend-ci.yml, backend-ci.yml (new — minimal, unverified
│                                     stubs added during the directory-restructure pass)
├── __tests__/App.test.tsx           (only test file in the repo's frontend test root)
├── __mocks__/                       Jest manual mocks (async-storage, react-native-config)
├── src/
│   ├── navigation/
│   │   ├── linking.ts                deep-linking stub (empty config)
│   │   └── stacks/     (11 files)    Root/Auth/App/Admin/Expert/Home/Marketplace/Messaging/
│   │                                 Orders/Profile/Consultations navigators + useAppTabNavigation.ts
│   ├── screens/     (~70 files)      admin(8) auth(4) buyer(1) common(2) dealer(7) disease(3+1)
│   │                                 expert(8) farmer(7) marketplace(5) messaging(2)
│   │                                 notifications(1) orders(4) payments(3) profile(4) reviews(1)
│   ├── components/
│   │   ├── common/  ui/ (15 primitives)
│   │   └── features/                 dashboards, dealer, expert, marketplace, messaging,
│   │                                 notifications, orders, payments, reviews
│   ├── hooks/
│   │   ├── realtime/  (3 files)      Supabase Realtime subscription hooks
│   │   └── api/       (1 file)       useUnreadNotificationsCount (wraps a realtime hook + fetch)
│   ├── services/
│   │   ├── api/client.ts             apiFetch — the shared HTTP seam to the FastAPI backend
│   │   ├── supabase/client.ts        Supabase JS client (Auth/Storage/Realtime only)
│   │   └── modules/   (15 domain folders) apiFetch-backed domain services
│   ├── store/       (4 files, flat) authStore, cartStore, marketplaceStore,
│   │                                 referenceDataStore (Zustand)
│   ├── types/       (15 files)       snake_case, mirrors backend Pydantic schema field names
│   ├── utils/                        empty (.gitkeep only — no shared helpers needed yet)
│   ├── constants/  config/  localization/  theme/  assets/
├── backend/
│   ├── requirements.txt (fully pinned), pytest.ini, .env.example
│   └── app/
│       ├── main.py                   mounts one aggregated v1 API router + /health
│       ├── core/                     auth.py, config.py, supabase_client.py
│       ├── api/v1/
│       │   ├── router.py             new — aggregates all 15 endpoint routers into one
│       │   └── endpoints/ (14 files) one APIRouter per domain (consultations lives with expert
│       │                             in the same domain count used elsewhere in this report)
│       ├── repositories/ (15 files)  thin Supabase-client wrappers, one per domain
│       ├── services/  (16 files)     business logic, state machines, audit logging
│       │                             (disease_inference.py renamed to ai_engine.py)
│       ├── schemas/   (15 files)     Pydantic request/response models
│       └── ml/checkpoints/model.pth  536-byte placeholder, not a real checkpoint
│   └── tests/
│       ├── conftest.py               new — added during the restructure pass, empty stub
│       └── unit/                     (17 files, 106 test functions — all real, mock-based,
│                                       confirmed passing via an actual `pytest` run)
├── android/   app/build.gradle, build.gradle, AndroidManifest.xml, debug.keystore (stock RN)
├── supabase/  migrations/ (28 files), config.toml, seed.sql (reference data only)
└── docs/      architecture/ (4 files — 1 stale), database/ (1 file — incomplete), setup/ (1)
```

`ios/` was deleted after the original version of this audit (the project isn't building for iOS right now — confirmed nothing else in the repo depended on it before removal). `.github/workflows/` now exists (see above) as minimal, unverified CI stubs — the original finding of "no CI configuration of any kind" no longer holds, though the stubs have not yet been exercised by a real PR/CI run and don't cover a Supabase migration-lint step.

**Second cleanup pass** (after the directory restructure, in response to an explicit "delete unused files" request): removed `Gemfile` (orphaned CocoaPods/Ruby tooling, no longer needed without `ios/`), `backend/app/models/` and `backend/app/utils/` (empty, no ORM/shared-utils ever added), the root-level `tests/unit/`/`tests/integration/` (empty and duplicated the real test homes — `__tests__/` for frontend, `backend/tests/` for backend), `docs/api/` and `docs/ui-ux/` (empty placeholders), and — since an orphan-reference scan found they were the only two genuinely unreferenced files left in the entire tracked source tree — the `src/utils/{currency,date}.ts` stubs, `backend/app/repositories/base_repository.py`, and the empty `__tests__/{components,screens,store}/` placeholder folders that this same restructure had just added. Re-verified clean afterward (0 TypeScript errors, 106/106 backend tests passing).

---

## 3. Repository Structure

| Directory | Purpose | Actively used | Legacy | Incomplete | Duplicates another |
|---|---|---|---|---|---|
| `src/navigation/` | React Navigation trees, all 5 roles | Yes | No | No | No |
| `src/screens/` | ~70 real, data-connected screens | Yes | No | 2 screens have non-tappable rows (§7) | `MyListingsScreen` intentionally reused by both Farmer "My Listings" and Dealer "Products" routes — deliberate reuse, not duplication |
| `src/components/` | Shared UI primitives + domain components | Yes | No | No | No |
| `src/services/` | 15 domain service folders under `services/modules/`, `apiFetch`-backed | Yes | No | No | No |
| `src/store/` | 4 Zustand stores, flat | Yes | No | No | No |
| `backend/app/api,repositories,services,schemas/` | Full FastAPI implementation, 15 domains | Yes | No | AI inference domain only (§19) | No |
| `supabase/migrations/` | 28 chronological SQL migrations | Yes | No | No | No |
| `docs/architecture/` | 4 markdown docs | Partially | 1 file (`authorization-model.md`) is stale | See §26 | No |
| `docs/database/schema.md` | Schema reference doc | Partially | Incomplete relative to current schema | Missing `listing_views` table + 3/6 storage buckets | No |
| `.idea/`, `.vscode/` | IDE metadata | N/A | N/A | N/A | N/A |

No duplicate screens, duplicate services, duplicate API clients, duplicate navigation systems, old web implementation, or abandoned prototypes were found anywhere in the repository. (A second cleanup pass, after this table was first written, removed several genuinely dead entries this table used to list: `backend/app/models/`, `backend/app/utils/`, the root-level `tests/unit/`/`tests/integration/`, `docs/api/`, `docs/ui-ux/`, `src/utils/{currency,date}.ts`, `backend/app/repositories/base_repository.py`, and the empty `__tests__/{components,screens,store}/` folders — see the note at the top of this document.)

---

## 4. Technology Stack

**Frontend**: React Native `0.86.2` (pinned exact), React `19.2.3` (pinned exact), TypeScript `^5.8.3`, Node `>= 22.11.0` (`package.json` engines).
**Navigation**: `@react-navigation/native ^7.3.16`, `native-stack ^7.18.8`, `bottom-tabs ^7.18.16`.
**State**: `zustand ^5.0.14` (4 real stores). `@tanstack/react-query ^5.101.4` is installed but used in only 2 of ~70 screens (`OrderDetailScreen`, `OrderHistoryScreen`) — most screens fetch manually.
**Forms**: `react-hook-form ^7.85.0`, `@hookform/resolvers ^3.10.0`, `zod ^4.4.3`.
**Data client**: `@supabase/supabase-js ^2.112.2` (Auth, Storage, Realtime) + a custom `apiFetch` HTTP client (`src/services/api/client.ts`) for the FastAPI backend.
**i18n**: `i18next ^26.4.0`, `react-i18next ^17.0.12` — real mechanism, 27 keys/language, 2 screens wired.
**Native**: `react-native-image-picker ^8.2.1` (gallery only, no camera), `react-native-config ^1.6.1`, `@react-native-async-storage/async-storage`, `react-native-url-polyfill ^4.0.0`, `lucide-react-native ^1.31.0`.
**Backend**: FastAPI `0.115.6`, `uvicorn[standard] 0.34.0`, `pydantic 2.10.4`, `pydantic-settings 2.7.1`, `python-dotenv 1.0.1`, `supabase 2.11.0` (Python client), `httpx 0.28.1`, `torch 2.5.1`, `torchvision 0.20.1`, `pillow 11.0.0`, `pytest 8.3.4`, `pytest-asyncio 0.25.2` — **all fully pinned** (unlike a prior claim that backend deps were unpinned; that claim is now false).
**Database**: Supabase/PostgreSQL, 28 migrations, RLS on all 36 tables.
**Firebase/push/payment-gateway/client-side-ML libraries**: confirmed absent on both sides (repo-wide grep, package manifests).

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

### Screen inventory (representative — see full per-screen table data gathered in this audit; all ~70 screens were individually read)

| Screen area | Count | Real UI | Real data | Notable issues |
|---|---|---|---|---|
| admin/ | 8 | 8/8 | 8/8 | `PlatformOrdersScreen` rows not tappable |
| auth/ | 4 | 4/4 | 4/4 | none |
| buyer/ | 1 | 1/1 | 1/1 | none |
| common/ | 2 | 2/2 | n/a | none |
| dealer/ | 7 | 7/7 | 7/7 | none |
| disease/ | 3 + util | 4/4 | 4/4 | dependent on backend AI model (§19) |
| expert/ | 8 | 8/8 | 8/8 | none |
| farmer/ | 7 | 7/7 | 7/7 | none |
| marketplace/ | 5 | 5/5 | 5/5 | `MyListingsScreen` rows not tappable |
| messaging/ | 2 | 2/2 | 2/2 | none |
| notifications/ | 1 | 1/1 | 1/1 | none |
| orders/ | 4 | 4/4 | 4/4 | none |
| payments/ | 3 | 3/3 | 3/3 | manual/COD only, no gateway |
| profile/ | 4 | 4/4 | 4/4 | `SettingsScreen` notification toggle is a local-only stub |
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
| My Listings view | PARTIAL | real data, rows not tappable (`MyListingsScreen.tsx`) |
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
| Products view ("Products" quick action) | PARTIAL | same `MyListingsScreen` reuse, rows not tappable |
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
         Notifications, MyListings/Products (REAL data, rows not tappable), FarmList/FarmDetail/
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

**Confirmed open gap**: `is_suspended` is checked in the FastAPI auth dependency (new, real, tested) but is **not** referenced in any Supabase RLS policy across all 28 migrations (explicitly self-documented as a known gap in `phase3_schema.sql`'s own comment, never closed by a later migration). A suspended user's still-valid Supabase JWT retains full RLS-governed access via any Supabase-direct path — Storage uploads, Realtime channel subscriptions, and Auth SDK calls all bypass the FastAPI layer entirely and are unaffected by suspension.

**Role self-escalation**: closed at the database layer — `guard_profiles_role()` trigger rejects any `role` column change unless performed by an admin (`is_admin()`).

**A real, documented, retroactively-fixed vulnerability**: the `create_notification` RPC was originally callable directly by any authenticated client via `/rest/v1/rpc/create_notification`, letting them inject an arbitrary notification into any other user's inbox. Fixed in `20260827080100_notifications_lockdown.sql` (made all 9 `notify_*` functions `security definer`, revoked `EXECUTE` on the helper from `public/anon/authenticated`).

**RLS coverage**: all 36 tables have RLS enabled; no table was found with RLS enabled and zero policies.

---

## 9. Backend / FastAPI Audit

`backend/app/main.py` mounts one aggregated router (`api/v1/router.py`), which itself includes all 15 domain routers (`admin, analytics, consultations, dealer, disease, expert, farmer, marketplace, messaging, notifications, orders, payments, profile, reference_data, reviews`), plus one inline `GET /health`. No router is defined but unmounted — no dead router files. (This `api/v1/router.py` aggregation, along with the `api/v1/endpoints/` nesting below, was introduced by a subsequent directory-restructure pass, after the rest of this audit's findings were gathered — verified afterward via a full `pytest` run: 106/106 passing, and a direct `from app.main import app` import check.)

| File | Purpose |
|---|---|
| `main.py` | FastAPI app, CORS middleware (wide open), mounts the one aggregated `api_router`, `/health` |
| `core/auth.py` | `get_current_user` / `require_role(*roles)` — the entire auth/authz gate (§8) |
| `core/config.py` | Pydantic `Settings`: Supabase URL/anon key/service-role key, `model_path`, `model_version`, `model_classes` |
| `core/supabase_client.py` | Three client factories: service-role (RLS-bypassing, narrowly used), public/anon, and **user-scoped** (RLS-respecting, authenticated as the caller — the default path) |
| `api/v1/router.py` | Aggregates all 15 endpoint routers into one — the only thing `main.py` imports |
| `api/v1/endpoints/*.py` (14 files) | One `APIRouter` per domain |
| `repositories/*.py` (15 files) | Thin Supabase-client wrappers, one per domain |
| `services/*.py` (16 files) | Business logic — ownership checks, status-transition state machines, server-authoritative pricing, audit logging (`disease_inference.py` was renamed to `ai_engine.py`) |
| `schemas/*.py` (15 files) | Pydantic request/response models |
| `ml/checkpoints/model.pth` | 536-byte placeholder text file (§19) |

**Design note (positive finding)**: `core/supabase_client.py`'s comments explicitly document that the user-scoped, RLS-respecting client is the default DB-access path, and the service-role client is "reserved for the narrow, explicitly documented cases... never the default DB-access path." This means the backend generally layers *additional* business-rule enforcement (state machines, server-derived pricing, ownership checks) on top of RLS rather than replacing it — RLS remains the authoritative row-level access boundary even for backend-mediated writes. This is a sound defense-in-depth design, not redundant/conflicting enforcement.

**No `lifespan`/startup-shutdown handler.** No rate-limiting middleware. No structured request-logging middleware. Error handling is ad hoc via `HTTPException` raises inside service functions, not centralized exception handlers.

**CORS**: `main.py` configures `CORSMiddleware(allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])` — fully open, no environment-based restriction.

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

**36 tables across 28 migrations.** RLS enabled and policy-covered on every table; no table found with RLS enabled and zero policies. Full table and policy inventories were built during this audit (table names, defining migrations, key columns, and every `CREATE POLICY` by table/operation) — condensed here; see §9 of the underlying database research pass for exhaustive per-policy detail if needed.

**Functions**: 4 `security definer` functions (`rls_auto_enable`, `is_admin`, `handle_new_user`, `available_stock`), all with `search_path` pinned. 4 non-`security definer` column-guard trigger functions (`set_updated_at`, `guard_profiles_role`, `set_listings_seller_role`, `guard_experts_verification_status`, `guard_payments_columns`) — all pinned **except** `guard_messages_updates()` (added 2026-08-30, after the project's own search-path hardening pass, but never given the same treatment — an inconsistency, not a currently-exploitable gap). 9 `notify_*` trigger functions were retroactively upgraded to `security definer` in the notification-lockdown fix.

**Storage buckets** (6 total): `avatars` (public), `listing-images` (public), `message-attachments` (private, participant-scoped), `expert-documents` (private, owner/admin), `consultation-attachments` (private, participant-scoped), `disease-images` (public).

**Enums** (final values, accounting for later `ALTER TYPE`): `user_role` (5 roles), `listing_status` (active/inactive/sold), `order_status` (10 values: pending/confirmed/completed/cancelled/processing/ready/rejected/payment_failed/disputed/refunded), `inventory_transaction_type` (6), `payment_status` (6), `verification_status` (4), `expert_specialization` (8), `consultation_status` (8), `consultation_priority` (3), `report_target_type` (6), `report_status` (4).

**`seed.sql`**: only admin-curated reference data — 8 categories, 12 crops, 1 country (Pakistan), 7 provinces, 13 cities, 1 phone code, 1 currency, 10 units. **No listings, orders, payments, reviews, consultations, disease cases, messages, farms, inventory, or user/profile rows are seeded anywhere.** No violation of a "no dummy data" discipline found.

**Escrow**: confirmed absent everywhere — no held-balance/release columns or logic in any migration; the payments migration's own comment explicitly states escrow is excluded by business rule.

**Self-admitted gaps and fixes found in migration comments** (quoted, file:line available on request — all independently confirmed against the actual SQL):
1. `is_suspended` still not enforced in RLS (self-documented, never closed) — repeated from §8.
2. `available_stock()` RPC exists specifically to avoid widening `inventory` RLS in a way that would leak `purchase_cost`/`selling_price` to buyers.
3. `payments` originally shipped select+insert only — no one could ever mark a payment received; fixed by a later migration granting the order's seller an UPDATE policy restricted to the `status` column via a guard trigger.
4. `payment_transactions` originally assumed a backend service-role would write provider webhook events; no such backend/gateway ever materialized, so a later migration granted the seller direct client-side INSERT instead — and a second migration fixed the seller not being able to read back what they'd just written.
5. `create_notification` RPC vulnerability (§8) — found and fixed.
6. `messages` had **no UPDATE policy/grant at all** before `messages_admin_moderation.sql` — meaning `markConversationRead()` had silently been affecting 0 rows every time it was called; read receipts had likely never actually persisted before this fix.
7. `messages_select_participants` originally had no admin bypass, unlike every other table's select policy, contradicting `authorization-model.md`'s own stated rule that messages should be admin-readable — fixed in the same migration as #6.
8. `reviews.order_id not null` originally blocked expert-consultation reviews entirely (experts are reviewed against a `consultations` row, not an `orders` row) — fixed by widening the constraint and the insert policy.
9. `consultation_messages` was initially missing from the Realtime publication (a self-flagged gap in `docs/database/schema.md`), later fixed.
10. `listing_views`'s INSERT policy does not exclude the listing's own owner — self-view-count inflation is prevented client-side only, per the migration's own comment; a direct API call could bypass this.

**Documentation discrepancies found** (docs, not code, are wrong):
- `docs/architecture/authorization-model.md` claims payments/payment_transactions writes are "server-side only (backend, service-role)" and that most tables' RLS is "not yet pushed" — both claims are stale; contradicted by the actual migrations and by `docs/database/schema.md` itself.
- `docs/database/schema.md` omits the `listing_views` table entirely (not in the table list, enum list, or ERD) and omits 3 of the 6 storage buckets (`expert-documents`, `consultation-attachments`, `disease-images`).

---

## 13. Data Model Consistency

Frontend TypeScript types (`src/types/*.ts`) use snake_case matching Postgres column names directly. Backend Pydantic schemas (`backend/app/schemas/*.py`) were cross-checked against these types for the orders and marketplace domains and match field-for-field (`product_subtotal`, `delivery_charge`, `order_items`, `category_id`, `crop_compatibility`, etc.) — the backend schemas were purpose-built to mirror the pre-existing frontend/database shapes.

No frontend/backend/database field-name mismatch was found in any domain examined. Two intentional, documented dualities exist and are not mismatches:
- `Profile.location` (legacy free-text display string) coexists with structured `country_id/province_id/city_id` fields — the app composes the display string from the structured fields; both are explicitly commented as intentional.
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

**Frontend**: `DiseaseUploadScreen` (optional crop + single gallery photo, no camera capture) → `DiseaseProcessingScreen` (uploads to the public `disease-images` Storage bucket, creates a `disease_cases` row via `POST /api/v1/disease/cases`, then calls `POST /api/v1/disease/predict`; on the current 503, shows Retry + "Talk to an Expert" handoff) → `DiseaseResultScreen` (prediction/confidence/description/recommended actions/disclaimer, expert-consult CTA, related-listings cross-link by crop name). Reachable **only by Farmer** — confirmed absent from Buyer, Dealer, and Expert navigators/dashboards.

**5 declared disease classes** (`healthy, bacterial_blight, leaf_rust, powdery_mildew, early_blight`), but the `DESCRIPTIONS` dict in `disease_service.py` only has a real entry for `"healthy"` — the other 4 always fall back to `(None, [])` for description/recommended actions, explicitly commented as provisional pending real training data.

**Ownership**: `disease_cases`/`disease_predictions` reads return 404 (not 403) for a non-owner, non-admin caller — intentionally hides existence rather than confirming/denying, tested in `test_disease_api.py`, which is itself explicitly documented as the regression test for a prior auth-bypass finding on this exact endpoint.

**Overall status**: real, non-trivial, tested plumbing exists end-to-end on both sides. The feature is **PARTIALLY IMPLEMENTED / effectively a designed-to-fail placeholder pending a real trained `model.pth`** — not a mock that fabricates results, and not a crash, but currently non-functional for its core purpose.

---

## 20. UI/UX Audit

**This audit is static (source-code reading only). No emulator/simulator was launched, no build was run, and no screenshots were reviewed in the course of this pass — visual/rendered UI quality is UNCERTAIN — requires runtime verification.**

What can be assessed from code:
- A real design-token system exists (`src/theme/`: `colors.ts`, `typography.ts`, `spacing.ts`, `roleColors.ts` — per-role accent colors for badges/indicators only, not full alternate themes — `moduleAccents.ts`, `statusColors.ts`).
- A real shared component library exists (`src/components/ui/`: 15 primitives — Button, Input, Card, Badge, Avatar, EmptyState, Spinner, Sheet, RoleBadge, SelectField, PhoneInput, LocationPicker, FilterChips, and others), suggesting screens are built from a common vocabulary rather than ad hoc styling per screen — consistent with no duplicate/divergent component implementations being found anywhere in this audit.
- Three confirmed **interaction** bugs, independent of visual polish: non-tappable rows on `PlatformOrdersScreen` (admin) and `MyListingsScreen` (farmer/dealer), and an unpersisted `Switch` stub on `SettingsScreen`.
- `linking.ts`'s empty deep-link config means a password-reset email has no in-app landing target — a real UX gap for that specific flow, though the flow itself (`ForgotPasswordScreen`/`VerifyOtpScreen`) is implemented.
- Image picking is gallery-only everywhere (no camera capture). The matching iOS gap (missing `NSPhotoLibraryUsageDescription`, previously noted here) is currently moot — `ios/` was deleted after this finding was first written, since the project isn't building for iOS right now (§24, BUG-06).

No conclusions about spacing/color/typography consistency, touch-target sizing, safe-area handling, keyboard behavior, or Android-device-size responsiveness can be responsibly drawn from source reading alone; a runtime pass (emulator or device) is needed before those aspects can be reported as fact rather than assumption.

---

## 21. Code Quality Audit

- **Repo-wide `TODO|FIXME|HACK|XXX`**: zero matches in any source file (frontend or backend).
- **`console.log(` in `src/`**: zero matches. **`print(` in backend Python**: zero matches.
- **No `.orig`/`.bak`/duplicate-suffixed files** anywhere. No stray empty non-`.gitkeep` files were found (a previously-noted `supabase_public_dump.sql` at repo root does not currently exist).
- Business logic is consistently kept out of screens: every screen calls into a `src/services/*` function, never `apiFetch`/`supabase` directly (with the two documented exceptions in §11).
- The codebase is unusually densely self-commented with accurate "here's what changed and why" notes at the exact relevant code (payments write-ownership history, the AI model placeholder, the notification-preferences stub, the `is_suspended` gap) — these function as reliable, current technical-debt signposts, independently corroborated by this audit wherever checked.

```
Architecture Quality:      8/10 — clean layered backend (api→service→repository), consistent
                            frontend service-layer discipline, sound RLS-as-authoritative-layer
                            design; docked for open CORS, no rate limiting, and two leftover
                            direct-Supabase reads outside the service layer.
Maintainability:           8/10 — dense, accurate self-documentation; two stale docs that could
                            mislead a new contributor (the dead `backend/app/models`/`utils`
                            directories this rating originally docked for were since removed —
                            see the note at the top of this document).
Type Safety:                8/10 — consistent TS types matching backend Pydantic schemas 1:1,
                            explicit adapter functions for casing conversion; a couple of
                            deliberately loose types (Notification.payload) are justified by
                            the underlying schema, not sloppiness.
Separation of Concerns:     8/10 — screens never touch supabase/fetch directly except the two
                            noted leftovers; backend cleanly separates api/service/repository/
                            schema per domain.
```

---

## 22. Security Audit

- **RLS**: comprehensive, 36/36 tables, policy-covered (§12).
- **Backend auth**: real server-side Supabase-token verification + role/suspension check on nearly every endpoint (§8–§10); public endpoints are individually, deliberately commented.
- **A real, documented, fixed vulnerability**: `create_notification` RPC was publicly callable, allowing cross-user notification injection — closed.
- **A real, documented, fixed defect**: `messages` had no UPDATE policy at all before a later migration — read receipts had likely never actually persisted.
- **Confirmed open gap**: `is_suspended` enforced in the FastAPI auth layer but never in RLS — a suspended user's Supabase JWT still has full RLS-governed access via Storage/Realtime/Auth SDK paths that bypass the backend.
- **Confirmed open gap**: `listing_views` INSERT policy doesn't exclude the listing owner — client-side-only self-view-count protection.
- **Confirmed gap**: `guard_messages_updates()` lacks `search_path` pinning, unlike every sibling guard-trigger function (hardening inconsistency, not an active exploit given current grants).
- **CORS**: backend allows `*` origins/methods/headers unconditionally, no environment-based restriction.
- **No rate limiting** anywhere in the FastAPI backend.
- **Secrets hygiene**: root `.env` exists (472 bytes, contents not read per this audit's constraints); `backend/.env` does not exist in this checkout. `.gitignore` covers `.env`/`.env.*` (with `!.env.example`), `*.pem`, `*.key`, `service-account*.json` — does not explicitly list `*.keystore`/`google-services.json` patterns, though neither file type is currently present, so this is a latent gap rather than an active exposure.
- **`android/app/debug.keystore`**: confirmed to be the stock React Native template debug keystore (standard `storePassword 'android'` credentials) — not a real secret. The release build type in `android/app/build.gradle` also signs with the debug config, flagged by the file's own inline comment as needing a real keystore before any production release.
- No hardcoded secrets, API keys, or credentials were found in any source file examined.

---

## 23. Dependency Audit

**Frontend** (`package.json`): all dependencies caret-ranged except `react`/`react-native` (pinned exact, standard RN practice). `@tanstack/react-query` is installed and used in only 2 of ~70 screens — a real but minor case of an underused dependency, not a fully dead one. No duplicate-purpose packages (single state library, single form library, single icon library, single navigation library). No Firebase/push/payment-gateway packages present (confirmed via manifest + grep).

**Backend** (`backend/requirements.txt`): all 12 packages fully pinned with exact versions (`fastapi==0.115.6`, `uvicorn[standard]==0.34.0`, `pydantic==2.10.4`, `pydantic-settings==2.7.1`, `python-dotenv==1.0.1`, `supabase==2.11.0`, `httpx==0.28.1`, `torch==2.5.1`, `torchvision==0.20.1`, `pillow==11.0.0`, `pytest==8.3.4`, `pytest-asyncio==0.25.2`) — a materially better state than a prior claim of "zero version pins." No auth library beyond direct Supabase HTTP calls (appropriate given the chosen verification approach — no local JWT-secret decoding needed).

No packages were installed, upgraded, or removed as part of this audit.

---

## 24. Build & Runtime Audit

**Frontend**: `npm ci` → `npm start` (Metro) → `npm run android`. `package.json` engines require Node `>= 22.11.0`. The `ios/` folder has since been deleted (the project isn't building for iOS right now — confirmed no other file in the repo depends on it before removal), so `npm run ios` is not currently usable; regenerate the native project (`npx react-native run-ios` or equivalent) when iOS support returns. One concrete risk remains for Android (not confirmed by an actual build in this audit, per the read-only constraint):
1. `AndroidManifest.xml` references `android:usesCleartextTraffic="${usesCleartextTraffic}"`, a Gradle manifest placeholder **defined nowhere** in any `.gradle` file — a real risk the Android build fails or the attribute silently resolves incorrectly.

(Historical note: this section previously also flagged `ios/ZaraiLinkRN/Info.plist` missing `NSPhotoLibraryUsageDescription`. That finding is moot now that `ios/` no longer exists — see BUG-06 in §30 for the re-open condition.)

**Backend**: `.venv` already exists at repo root; `pip install -r backend/requirements.txt` → `uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000`. `main.py` exposes `app` at exactly that import path and mounts a working `GET /health`. No missing-file or path-mismatch issues found in the backend build path.

**Database**: `supabase/config.toml` and `.temp/linked-project.json` show this checkout is linked to a real remote Supabase project (ref `uqcxwshlxvmoovjpizlf`); whether that project's live schema currently matches all 28 local migration files was **not checked** (no live DB connection made — UNCERTAIN, requires `supabase migration list`/`db diff` against the linked project to confirm).

No build, test run, or `uvicorn` startup was actually executed as part of this audit (static reading only, per the read-only constraint) — all of the above is **STATIC AUDIT**, not **RUNTIME VERIFIED**.

---

## 25. Testing Audit

| Area | Tests exist | Scope | Quality | Missing |
|---|---|---|---|---|
| Frontend component/screen | `__tests__/App.test.tsx` only | renders `<App/>`, asserts only that it doesn't throw | template smoke test, not a real test | all ~70 screens, all services, all stores |
| Backend | `backend/tests/unit/` — 17 files, 106 test functions | auth, ownership, pricing integrity, status-transition state machines, role rejection, input validation | **Real** — `unittest.mock`/`AsyncMock` isolate the Supabase layer, `TestClient` + `dependency_overrides` exercise real conditional branches (e.g. `test_admin.py` iterates every admin route asserting 401 with no auth header on all of them; `test_disease_api.py` is explicitly the regression test for a prior auth-bypass finding) | no coverage-tool (%) output available; no true integration test against a live/local Supabase instance |
| CI | `.github/workflows/frontend-ci.yml`, `backend-ci.yml` (new, added during the directory-restructure pass) | lint, typecheck, `npm test` (frontend); `pytest` (backend) | untested — never actually run against a real PR | not yet exercised by a real CI run; no Supabase migration-lint step; no branch-protection wiring |

Backend testing is a genuine strength of this codebase, deliberately focused on security-sensitive logic. Frontend testing is effectively the single largest coverage gap in the repository.

---

## 26. Dead Code / Duplicate / Legacy Audit

- `docs/architecture/authorization-model.md` — stale relative to current migrations (§12); contradicts both the real schema and `docs/database/schema.md` itself.
- `docs/database/schema.md` — incomplete relative to current schema: missing `listing_views` table entirely, missing 3 of 6 storage buckets.
- Stale inline comments in `src/constants/routes.ts` claim several routes "remain placeholders" — false as of the current codebase; every one of those routes now points to a real screen.
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
Path: docs/architecture/authorization-model.md
Reason: Contents are factually stale/contradicted by the current migrations and by
        docs/database/schema.md.
Evidence: See §12 — claims payments writes are "server-side only," claims most RLS is
        "not yet pushed" (contradicted by 25+ later migrations).
Consumers: developer reference only, no code depends on it
Risk: low to rewrite/update; risk of leaving it as-is is that a future contributor trusts
        incorrect information about the payments write model.
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
| Push notifications | | | ❌ | §22 (security agent, confirmed absent) | P2 |
| AI disease advisory (pipeline) | ✅ | | | §19 | P0 |
| AI disease advisory (real model) | | ✅ (placeholder) | | §19 | P0 |
| Localization (EN/UR) | | ✅ (2/70 screens) | | §20/verification grep | P3 |
| Automated test coverage (backend) | ✅ | | | §25 | P1 |
| Automated test coverage (frontend) | | | ❌ | §25 | P1 |
| CI/CD | | | ❌ | §25 | P2 |
| RLS on every table | ✅ | | | §12 | P0 |
| Suspension enforced at RLS layer | | | ❌ | §8, §12 | P1 |

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
| Admin functionality | ✅ | ✅ (order tap-through broken) | ✅ | ✅ | ✅ | ✅ | 🟡 |
| AI disease advisory | ✅ | ✅ | ✅ | 🟡 (placeholder model) | ✅ | ✅ | 🟡 (always 503s today) |
| Notifications (in-app) | ✅ | ✅ | ✅ (+Realtime) | ✅ | ✅ | ✅ | ✅ |
| Push notifications | ❌ | ❌ | ❌ | ❌ | — | — | ❌ |
| Profile management | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Search | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Filters | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Location (reference data) | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |

Legend: ✅ Implemented · 🟡 Partial · ❌ Missing.

---

## 30. Bug Report

```
BUG-01
Title: Admin Platform Orders list rows are not tappable
Severity: Major (P2)
File: src/screens/admin/PlatformOrdersScreen.tsx
Location: order-card onPress handler
Problem: Cards render with onPress={() => {}} — a real no-op.
Root Cause: Navigation to an order-detail destination was never wired for the admin stack.
Impact: Admin can see the full order list but cannot open any individual order to inspect or act on it.
Reproduction: Log in as admin → Home → Orders → tap any order card → nothing happens.
Recommended Fix: not prescribed by this audit (read-only); wiring an OrderDetail route into
        AdminNavigator's Home stack and passing the order id would be the natural fix.
Dependencies: none blocking
```

```
BUG-02
Title: Farmer "My Listings" / Dealer "Products" rows are not tappable
Severity: Major (P2)
File: src/screens/marketplace/MyListingsScreen.tsx
Location: listing row rendering
Problem: Rows have no onPress/TouchableOpacity wrapper.
Root Cause: Same class of omission as BUG-01.
Impact: Farmer/dealer can view but not edit a listing from this screen; they must re-find it
        via Browse to reach EditListingScreen.
Reproduction: Log in as farmer or dealer → Home → My Listings/Products → tap any row → nothing happens.
Dependencies: none blocking
```

```
BUG-03
Title: RoleAwareAnalyticsScreen defaults non-dealer roles to Farmer analytics
Severity: Minor (P3) — currently unreachable, latent
File: src/navigation/stacks/HomeNavigator.tsx
Location: RoleAwareAnalyticsScreen branch logic
Problem: Branches only on role === 'dealer'; every other role (including a hypothetical buyer
        reach) falls through to FarmerAnalyticsScreen.
Root Cause: Binary branch instead of an explicit per-role switch.
Impact: None today (BuyerDashboardScreen has no Analytics entry point), but a real bug if that
        entry point is ever added without also fixing this branch.
Dependencies: none blocking
```

```
BUG-04
Title: Settings notification-preferences toggle does not persist
Severity: Minor (P3) — self-documented in code
File: src/screens/profile/SettingsScreen.tsx
Location: notification Switch, local useState
Problem: No backing table/service call; state resets on app restart.
Root Cause: No notification-preferences table exists in the schema yet.
Impact: User believes they've changed a preference; it silently has no effect.
Dependencies: requires a new table/endpoint to fix properly
```

```
BUG-05
Title: AndroidManifest references an undefined Gradle manifest placeholder
Severity: Major (P2) — unconfirmed, needs a real build to verify
File: android/app/src/main/AndroidManifest.xml
Location: android:usesCleartextTraffic="${usesCleartextTraffic}"
Problem: No android/*.gradle file defines manifestPlaceholders { usesCleartextTraffic = ... }.
Root Cause: Placeholder was added to the manifest without the corresponding Gradle wiring
        (react-native-config's dotenv.gradle auto-injection may or may not cover this — not
        confirmed).
Impact: Risk that `npm run android` / a Gradle build fails or the attribute resolves
        incorrectly. NOT CONFIRMED — this audit did not run a build.
Reproduction: Attempt `cd android && ./gradlew assembleDebug` (not run as part of this audit).
Dependencies: none blocking other work; should be verified before relying on an Android build.
```

```
BUG-06
Title: iOS Info.plist missing NSPhotoLibraryUsageDescription
Severity: Major (P2) — MOOT since the fix below: the ios/ folder was deleted after this audit
        was written (the project isn't building for iOS right now). No file to fix currently
        exists. Re-open this item when ios/ is regenerated (`npx react-native run-ios` recreates
        the native project) — the same gap (no NSPhotoLibraryUsageDescription key) will need to
        be added again at that point, since it wasn't fixed before deletion, only removed.
File: ios/ZaraiLinkRN/Info.plist (no longer present in the repository)
Location: top-level plist keys
Problem: No NSPhotoLibraryUsageDescription key existed, despite launchImageLibrary being called
        in 8 files (ChatInput, EditProfileScreen, DiseaseUploadScreen,
        RequestConsultationScreen, CreateListingScreen, ExpertApplicationScreen,
        EditListingScreen, and one more).
Root Cause: Key was never added when image-picker usage was built out.
Impact: iOS requires this key for photo-library access; its absence will fail or crash the
        picker on a real device (behavior on Simulator may differ — not verified here). Not
        currently actionable since there is no ios/ project in the repo to patch.
Dependencies: blocked on iOS support being reintroduced
```

```
BUG-07
Title: guard_messages_updates() trigger function lacks search_path pinning
Severity: Minor (P3) — hardening inconsistency, not an active exploit under current grants
File: supabase/migrations/20260830080000_messages_admin_moderation.sql
Location: guard_messages_updates() function definition
Problem: Missing SET search_path clause present on every sibling guard-trigger function.
Root Cause: Function was added after the project's dedicated search-path hardening migration
        and wasn't retroactively covered.
Impact: Theoretical schema-shadowing attack surface, consistent with the class of issue the
        earlier hardening migration closed for other functions.
Dependencies: none blocking
```

```
BUG-08
Title: listing_views self-view-count inflation possible via direct API call
Severity: Minor (P3)
File: supabase/migrations/20260829080000_listing_views.sql
Location: INSERT policy (WITH CHECK viewer_id = auth.uid() or viewer_id is null)
Problem: Policy does not exclude listing.owner_id = auth.uid() — the exclusion is enforced
        client-side only, per the migration's own comment.
Root Cause: Deliberate scope decision at the time, self-documented as a known limitation.
Impact: A listing owner could inflate their own view count via a direct PostgREST call,
        bypassing the app's client-side check.
Dependencies: none blocking
```

```
BUG-09
Title: is_suspended not enforced in Supabase RLS
Severity: Major (P2) — long-standing, self-documented, never closed
File: supabase/migrations/20260821000000_phase3_schema.sql (original comment) — no later
        migration adds an is_suspended check to any policy
Location: every RLS policy across all 36 tables
Problem: Suspension is checked in the FastAPI auth dependency (real, server-side) but not in
        any RLS USING/WITH CHECK clause.
Root Cause: Deliberate initial scope decision, never revisited across 28 migrations.
Impact: A suspended user's still-valid Supabase JWT retains full RLS-governed access via any
        Supabase-direct path (Storage uploads, Realtime subscriptions, Auth SDK calls) that
        bypasses the FastAPI backend entirely.
Dependencies: would need either an is_suspended check added to relevant policies, or a
        Supabase Auth hook to revoke/refuse suspended sessions.
```

```
BUG-10
Title: Two stale/incomplete documentation files
Severity: Minor (P3) — documentation only, no code impact
File: docs/architecture/authorization-model.md, docs/database/schema.md
Location: "Status" section (authorization-model.md); table/enum/ERD lists (schema.md)
Problem: authorization-model.md claims payments writes are server-only and most RLS is
        "not yet pushed" — both false today. schema.md omits the listing_views table and 3 of
        6 storage buckets.
Impact: A future contributor trusting these docs would misunderstand the actual payments
        write model and miss two real tables/buckets.
Dependencies: none blocking
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

**Where refactoring is and isn't needed**: the two leftover direct-Supabase reads are worth cleaning up for consistency but are not urgent (no security impact). (The `backend/app/models/`/`utils/` empty directories this assessment originally flagged for removal were since deleted in a follow-up cleanup pass — see the note at the top of this document.) Nothing found warrants a large-scale refactor; the architecture is fundamentally sound and consistently applied.

```
Architecture Quality Score: 8/10
```

---

## 32. Critical Risks

1. **No real AI model** — the headline "AI Disease Advisory" feature is non-functional for its core purpose today.
2. **`is_suspended` not enforced in RLS** — a real, long-standing, self-documented security gap; suspension is only as strong as the FastAPI-mediated paths, which don't cover Storage/Realtime/Auth SDK.
3. **Open CORS + no rate limiting** on the FastAPI backend — acceptable for development, not for any production exposure.
4. **Zero frontend automated test coverage, and CI is only an unverified stub** — regressions across ~70 screens would still likely not be caught automatically.
5. **One unverified Android build-config risk** (`usesCleartextTraffic` placeholder) — could block getting a working Android build without a dedicated build-and-fix pass. (The matching iOS risk is moot for now — `ios/` was deleted since the project isn't building for iOS currently.)
6. **No real payment gateway** — the manual/COD flow is real and backend-enforced, but any move toward real online payment requires new integration work, not just enabling something already scaffolded.

---

## 33. Prioritized Implementation Roadmap

```
PHASE 0 — Critical Cleanup / Blockers
  Task: Confirm and fix the AndroidManifest usesCleartextTraffic placeholder with an actual
        Android build attempt. (The matching iOS NSPhotoLibraryUsageDescription task is
        deferred — ios/ was deleted since the project isn't building for iOS right now; redo
        this task's iOS half once ios/ is regenerated.)
  Why: This is a currently-unverified risk to getting the Android app running at all on a
        device.
  Files affected: android/app/src/main/AndroidManifest.xml, android/app/build.gradle
  Dependencies: none
  Risk: low to fix, high impact if left unverified
  Priority: P0
  Estimated complexity: small

PHASE 1 — Security Hardening
  Task: Restrict backend CORS to known origins; add rate limiting; add search_path pinning to
        guard_messages_updates(); decide and implement an approach for enforcing is_suspended
        at the RLS layer (or explicitly accept the gap with a documented mitigation).
  Why: These are the confirmed open security gaps from §22/§32.
  Files affected: backend/app/main.py, supabase/migrations/ (new migration), relevant RLS
        policies
  Dependencies: none
  Priority: P1
  Estimated complexity: medium

PHASE 2 — Interaction Bug Fixes
  Task: Wire admin Platform Orders rows and farmer/dealer My Listings/Products rows to their
        detail/edit destinations; fix RoleAwareAnalyticsScreen's role branch.
  Why: BUG-01/02/03 — real, user-facing dead interactions.
  Files affected: src/screens/admin/PlatformOrdersScreen.tsx,
        src/screens/marketplace/MyListingsScreen.tsx, src/navigation/stacks/HomeNavigator.tsx
  Dependencies: none
  Priority: P1
  Estimated complexity: small

PHASE 3 — AI Model Integration
  Task: Train and drop in a real backend/app/ml/checkpoints/model.pth; fill in DESCRIPTIONS for the
        remaining 4 disease classes; update model_version away from "placeholder".
  Why: The single biggest functional gap for the app's headline feature.
  Files affected: backend/app/ml/checkpoints/model.pth, backend/app/services/disease_service.py,
        backend/app/core/config.py, backend/.env
  Dependencies: real training data/model, external to this repo
  Priority: P0 (for product completeness)
  Estimated complexity: large (external ML work) / small (integration once weights exist)

PHASE 4 — Frontend Test Coverage
  Task: Build real tests for at least the highest-risk screens/services (checkout, payments,
        auth flows) under __tests__/ (the frontend's one real test root — a redundant
        root-level tests/unit/tests/integration pair was removed in a later cleanup pass).
  Why: Zero current coverage on the frontend is the largest testing gap in the repo.
  Files affected: __tests__/, new test files alongside src/
  Dependencies: none
  Priority: P1
  Estimated complexity: large

PHASE 5 — CI/CD
  Task: Verify the two CI workflow stubs added during the directory-restructure pass
        (.github/workflows/frontend-ci.yml, backend-ci.yml) actually run and pass against a
        real PR; add a Supabase migration-lint step and branch-protection wiring.
  Why: CI configuration now exists but has never been exercised — nothing yet confirms it
        actually catches a regression before merge.
  Files affected: .github/workflows/frontend-ci.yml, .github/workflows/backend-ci.yml
  Dependencies: Phase 4 (frontend tests to actually run)
  Priority: P2
  Estimated complexity: small (verify existing stubs) / medium (add migration-lint + branch
        protection)

PHASE 6 — Documentation Sync
  Task: Rewrite docs/architecture/authorization-model.md to match the current payments write
        model and RLS status; add listing_views and the 3 missing storage buckets to
        docs/database/schema.md.
  Why: BUG-10 — stale docs risk misleading future contributors.
  Files affected: docs/architecture/authorization-model.md, docs/database/schema.md
  Dependencies: none
  Priority: P2
  Estimated complexity: small

PHASE 7 — Localization Coverage
  Task: Retrofit useTranslation()/translation keys across the ~68 screens that don't currently
        use them.
  Why: The i18n mechanism works but covers only 2 of ~70 screens today.
  Files affected: most files under src/screens/, src/localization/en.json, ur.json
  Dependencies: none
  Priority: P3
  Estimated complexity: large (breadth, not difficulty)

PHASE 8 — Payment Gateway Integration
  Task: Integrate a real payment provider (e.g. a Pakistan-market gateway) behind the existing
        payments_service.py abstraction.
  Why: Manual/COD is a real, working flow, but a production marketplace typically needs at
        least one real online payment option.
  Files affected: backend/app/services/payments_service.py, backend/app/schemas/payments.py,
        backend/requirements.txt, src/services/modules/payments/paymentsService.ts,
        src/screens/payments/*
  Dependencies: choice of gateway, merchant account/credentials
  Priority: P2
  Estimated complexity: large

PHASE 9 — Push Notifications
  Task: Add FCM/APNs device-token registration and delivery, on top of the existing in-app
        notification event model.
  Why: Currently in-app-only; requires the app to be open to receive anything.
  Files affected: new backend module, new frontend push-registration code, new
        device_tokens-style table
  Dependencies: Firebase project setup
  Priority: P3
  Estimated complexity: large

PHASE 10 — Production Readiness
  Task: Real Android release keystore (replacing the debug-signed release build), .gitignore
        coverage for keystores/google-services.json, tighten CORS to production domains,
        confirm the linked Supabase project's live schema matches all 28 local migrations.
  Why: Final hardening pass before any real deployment.
  Files affected: android/app/build.gradle, .gitignore, backend/app/main.py
  Dependencies: Phases 0–6 substantially complete
  Priority: P2
  Estimated complexity: medium
```

---

## 34. Recommended Next Steps

1. Run an actual Android build to confirm or rule out BUG-05 — this is cheap to check and currently blocking confidence in "can this app even run on a device." (BUG-06/iOS is deferred — `ios/` was deleted since the project isn't building for iOS right now.)
2. Fix the three interaction bugs (BUG-01, BUG-02, BUG-03) — small, isolated, high-value fixes.
3. Decide the roadmap's Phase 3 timeline (AI model training) since it's the single biggest gap in the app's core value proposition, and it's external work this audit cannot do or estimate precisely.
4. Start frontend test coverage on the checkout/payment/auth flows specifically — the highest-risk, least-covered surface today.
5. Reconcile the two stale documentation files before anyone relies on them for a design decision.

---

## 35. Final Project Readiness Assessment

Evaluated strictly against the evidence gathered in this audit: ZaraiLink has substantially more real, working, tested functionality across all five roles than a superficial read of the repository's history might suggest — the backend in particular represents a large, well-architected, well-tested body of work that appears to have been built entirely since the last time this audit file was updated. The core marketplace/orders/messaging/reviews/expert-consultation/admin-governance loop is genuinely implemented and connected end-to-end, backed by a comprehensive and largely sound RLS security model with a real track record of self-caught-and-fixed vulnerabilities and defects visible in the migration history itself.

Confirmed gaps relative to a production-ready state: no real AI model (the product's namesake feature), `is_suspended` not enforced at the RLS layer, open CORS with no rate limiting, one unverified Android build-config risk, near-total absence of frontend automated tests, CI/CD present only as unverified stubs, no real payment gateway, no push notifications, and shallow localization coverage. None of these are architectural dead ends — each has a clear, scoped fix path (§33) — but collectively they represent real, non-trivial remaining work before this could be called production-ready.

---

## Final Readiness Score

```
Overall Readiness: 72/100

Architecture:      80/100
Frontend:          82/100
Backend:           78/100
Database:          85/100
Integration:       85/100
Security:          65/100
UI/UX:             UNSCORED — not runtime-verified in this audit
Testing:           40/100
Maintainability:   75/100
```

### TOP 10 THINGS THAT MUST BE FIXED FIRST

1. **Verify the Android build actually succeeds** (BUG-05) — everything else is moot if the app can't run on a device. (iOS/BUG-06 deferred: `ios/` was deleted since the project isn't building for iOS right now.)
2. **Get a real trained AI model into `backend/app/ml/checkpoints/model.pth`** — the core differentiating feature is currently non-functional.
3. **Enforce `is_suspended` at the RLS layer** (or explicitly, consciously accept and document the residual gap) — the single most concrete open security issue.
4. **Restrict CORS and add rate limiting** to the FastAPI backend before any production exposure.
5. **Fix the three interaction bugs** (admin Orders tap-through, My Listings/Products tap-through, RoleAwareAnalyticsScreen default) — small, cheap, real UX fixes.
6. **Build frontend test coverage**, starting with checkout/payments/auth — currently the largest testing blind spot in the repo.
7. **Stand up CI** running both test suites on every change — nothing currently catches a regression before merge.
8. **Reconcile the two stale documentation files** before anyone makes a decision based on them.
9. **Decide and scope real payment-gateway integration** if the product needs to move beyond manual/COD.
10. **Clean up the two leftover direct-Supabase reads** (`authStore.fetchProfile`, `SellerDashboard`'s count queries) for architectural consistency, and remove or populate the two dead empty backend directories.
</content>
