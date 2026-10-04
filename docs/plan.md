# ZaraiLink Plan of Record

> **Status (2026-10-04): A0, A1 and A2 closed; A3 in progress (A3a verified on `a3a/account-status`, ready to
> merge; A3b next).**
> - **A0** (PR #13): the hosted project matches the repository (56 migrations with the reference data) and Auth is
>   configured as code (`supabase/config.toml` through `npx supabase config push`: email codes sent by Gmail SMTP,
>   Supabase's password rules, reauthentication for old sessions, phone sign-up off).
> - **Before A1** (PR #14, migration `20260928090000`, pushed to the hosted project): an expert can no longer approve
>   themselves, and an admin can no longer edit or delete any listing unaudited (BR-15).
> - **A1, modular restructure** (PR #15, merge commit `8ddd846`): the code is in the SRDS module layout (section 2),
>   with no behaviour change; the strict `module-boundary` rule is at zero, and `zl-verifier` signed it off after four
>   rounds (`docs/plan-ecommerce.md` A1).
> - **A2, design system and app shell** (PR #22, merge commit `64fa667`): the theme, components and five role shells
>   from the approved design system (D14), with the strict `raw-style` and `header-right` rules at zero; proven on the
>   Pixel 8 emulator as each role, in light and dark. `zl-verifier` signed it off in its fourth round, and narrower
>   checks of the follow-up fixes left nothing above Low (`docs/plan-ecommerce.md` A2). The same PR patched transitive
>   npm advisories that newly failed the dependency scan.
> - An early build of A3's account status, email-only sign-in and Application Status screen is parked, unmerged, on
>   branch `wip/a3-account-status` (its migration is not pushed); A3 ports it by hand with `scripts/a1/moves.json`.
>
> D2–D4 decided. The requirements are [`docs/srds.md`](srds.md),
> traced requirement by requirement in [`docs/status/srds-traceability.md`](status/srds-traceability.md); this
> plan follows it strictly. It is split into two plans that share one module map and one set of agents:
>
> - **Plan A — ZaraiLink e-commerce platform:** [`docs/plan-ecommerce.md`](plan-ecommerce.md)
> - **Plan B — Dealer Inventory Management System (IMS):** [`docs/plan-inventory.md`](plan-inventory.md)
>
> The app is English only. Application data and files live in Supabase (PostgreSQL and Storage); GitHub holds
> source code only. The rules in [`AGENTS.md`](../AGENTS.md) apply to every task: a real path must run, no stubs,
> evidence, two-key verification, a truthful feature register, stop-and-ask before any outside service. The
> previous P0–P14 program ([`docs/process/standardization-plan.md`](process/standardization-plan.md)) is history;
> its P0–P7 results carry over.

## 1. How the work is organised

Every phase is split into **lanes**. A lane is one module (or one shared layer) with its own folders, its own
agent, and a written list of what it may change. Lanes in the same phase run at the same time; they meet only at
**contracts** (section 5) that are agreed before the phase starts. A phase ends when every lane is done and a
fresh-context verifier has signed it off.

```
Phase start ──► task cards per lane ──► lanes work in parallel ──► integration checkpoint ──► verifier ──► phase done
                 (contracts agreed)      (own folders only)          (contract tests green)     (two-key)
```

Rules that keep parallel lanes from colliding:

1. **Own folders only.** A lane edits only the folders listed as its own (section 3). Anything else goes to the
   owning lane as a request in the phase task card.
2. **One migration writer.** Only `zl-db` writes `supabase/migrations/` and `supabase/tests/`. Other lanes send it
   a schema request: tables, columns, policies, and the two-user proof they need.
3. **One contract writer.** Only `zl-backend-core` regenerates `backend/openapi.json` and the generated client
   (`npm run api:generate`), once per checkpoint, after the API lanes have merged.
4. **Public entry points.** Code outside a module imports only its `index.ts` (frontend) or `service.py` and
   `schemas.py` (backend). Shared layers (`navigation/`, `services/`, `state/`, `hooks/`, `common/components/`)
   see modules as types only; `navigation/` may also mount a module's screens. The strict `module-boundary` rule
   of `scripts/check_reality.py` (A1) fails anything else.
5. **Branch per lane, merge at the checkpoint.** Each lane works on `<phase>/<lane>` and rebases on the phase
   branch; the orchestrator merges lanes in the task card's order (database, then API, then app).
6. **Nothing but code in git.** Model weights, exports, backups, uploads and test data never go into the
   repository or a GitHub release; they belong in Supabase Storage or the database.

## 2. Target repository layout (SRDS §38–§43)

Top-level modules exactly as the SRDS names them. Features several roles use (marketplace, cart and orders,
payments, reviews, messaging, notifications, consultations, sign-in and registration, profile) live in `common/`,
one sub-folder each, because none of them belongs to a single role (SRDS §42; decision D1).

```
frontend/                                   backend/app/
├── admin/  farmer/  dealer/  buyer/         ├── admin/  farmer/  dealer/  buyer/
├── expert/                                  ├── expert/
├── ai/                                      ├── ai/            (model, inference, AI report)
├── inventory/      (the separate IMS app)   ├── inventory/     (IMS API, dispatch sync)
├── common/                                  ├── common/
│   ├── components/ forms/ validation/       │   ├── errors, problem_details, pagination,
│   ├── types/ constants/ formatting/        │   │   idempotency, openapi, logging, observability
│   ├── error-handling/ loading/             │   ├── marketplace/ orders/ payments/ reviews/
│   ├── permissions/ api/                    │   ├── messaging/ notifications/ consultations/
│   ├── auth/ profile/                       │   └── profile/ reference_data/
│   ├── marketplace/ orders/ payments/       ├── auth/          (JWT/JWKS, roles, approval checks)
│   ├── reviews/ messaging/                  ├── database/      (Supabase clients)
│   └── notifications/ consultations/        ├── storage/       (signed URLs, uploads)
├── theme/                                   ├── middleware/    (request id, rate limit, headers)
├── navigation/  services/  state/           ├── config/
└── hooks/  utils/  assets/  config/         └── main.py
```

Every feature folder (a role module or `common/<feature>`) has the same inside: frontend `screens/ components/
services/ hooks/ types/ index.ts`; backend `router.py service.py repository.py schemas.py`. Tests sit beside the
code they test (frontend) or mirror the module (`backend/tests/<module>/`). pgTAP stays in
`supabase/tests/database/` and `supabase/config.toml` stays where it is, because the Supabase CLI requires both.
Cross-stack real-path tests go in a top-level `tests/<module>/`.

**Built in A1 (2026-09-28)** for the code that exists today; each module folder has a `README.md` (what it owns, its
public API, the tables it uses). Three shared folders the tree above does not show: `common/analytics` (every
role's dashboard numbers, until a phase splits it per role), frontend `common/reference-data` (backend
`common/reference_data`) and frontend `testUtils/`. Folders with no code yet appear in the phase that fills them:
backend `buyer/`, `storage/` and `inventory/` (B0 carves it out of `dealer/`), and frontend
`common/{forms,validation,formatting,error-handling,loading,permissions,api}` (A2). The explicit old-to-new file
list is `scripts/a1/moves.json`, kept for porting older branches (A3, B0).

## 3. Lanes and agents

Agents are defined in `.claude/agents/` (one file each, listing the folders they own). Skills in `.claude/skills/`
give them domain know-how; `CLAUDE.md` maps work types to skills.

| Lane / agent | Owns (write access) | Plans |
|---|---|---|
| `zl-orchestrator` | task cards, phase branches, `docs/plan*.md`, merge order | A, B |
| `zl-db` | `supabase/migrations/`, `supabase/tests/`, `supabase/seed.sql`, `docs/database/` | A, B |
| `zl-backend-core` | `backend/app/{auth,database,storage,middleware,config}`, backend core in `backend/app/common/`, `backend/app/main.py`, `backend/openapi.json`, the generated client, `scripts/` gates | A, B |
| `zl-app-core` | `frontend/{theme,navigation,services,state,hooks,utils,assets,config,testUtils}`, `frontend/common/{components,forms,validation,types,constants,formatting,error-handling,loading,permissions,api}` | A, B |
| `zl-accounts` | `frontend/common/{auth,profile}`, `backend/app/common/profile` (sign-in, registration, application status, account security) | A |
| `zl-commerce` | `frontend/common/{marketplace,orders,payments,reviews,reference-data,analytics}`, `backend/app/common/{marketplace,orders,payments,reviews,reference_data,analytics}` | A, B |
| `zl-comms` | `frontend/common/{messaging,notifications}`, `backend/app/common/{messaging,notifications}`, email templates | A |
| `zl-farmer` | `frontend/farmer`, `backend/app/farmer` | A |
| `zl-buyer` | `frontend/buyer`, `backend/app/buyer` | A |
| `zl-dealer` | `frontend/dealer`, `backend/app/dealer` (the dealer's marketplace side) | A, B |
| `zl-expert` | `frontend/expert`, `frontend/common/consultations`, `backend/app/expert`, `backend/app/common/consultations` | A |
| `zl-admin` | `frontend/admin`, `backend/app/admin` | A, B |
| `zl-ai` | `frontend/ai`, `backend/app/ai`, `scripts/fetch_model_weights.py`, model metadata | A |
| `zl-inventory-api` | `backend/app/inventory` | B |
| `zl-inventory-app` | `frontend/inventory` | B |
| `zl-devops` | `.github/`, `app.config.ts`, `eas.json`, release scripts | A, B |
| `zl-verifier` | nothing: reads, runs, reports; fresh context every time | A, B |

## 4. Order of work (waves)

Plan B starts once Plan A's restructure (A1) and dealer approval (A3) exist; from then on the plans run side by side.

| Wave | Plan A (e-commerce) | Plan B (IMS) |
|---|---|---|
| 1 | A0 Baseline and readiness | — |
| 2 | A1 Modular restructure | — |
| 3 | A2 Design system and shell · A3 Accounts, registration, approval | — |
| 4 | A4 Marketplace, orders, dispatch | B0 Inventory boundary · B1 Inventory data model |
| 5 | A5 Messaging and notifications · A6 AI advisory and expert assessment | B2 Inventory API · B3 Marketplace sync |
| 6 | A7 Admin moderation and audit | B4 IMS app |
| 7 | A8 UI/UX rollout and accessibility | B5 Reports, analytics, reconciliation |
| 8 | A9 Hardening and release | B6 IMS verification and release |

## 5. Contracts between lanes and plans

Agreed before the phase that needs them. Each has a contract test, so a lane can build against it alone.

| Contract | Producer → consumer | Shape | Phase |
|---|---|---|---|
| Account status | `zl-db`, `zl-backend-core` → every lane | `profiles.account_status` (`pending`, `approved`, `rejected`) for dealers and experts; SUSPENDED stays `profiles.is_suspended` (maintainer, 2026-10-04). DB helpers `is_account_approved()`, `is_approved_dealer()`, `is_approved_expert()`, `caller_role()`, `is_seller_role(id)`; a decision only through `decide_account_status()` (aal2, audited in the same transaction). API: every `get_current_user` and `require_role` dependency admits a dealer or expert only when approved (403 `account_not_approved`); `get_current_user_any_status` and `require_role_any_status` for the few routes a pending user needs; a session from before the approval gets 403 `sign_in_again` | A3 (A3a done on its branch) |
| Module public API | each module → the others | frontend `index.ts` exports; backend `service.py` functions; no deep imports | A1 |
| OpenAPI document | API lanes → app lanes | `backend/openapi.json` and the generated client, regenerated at each checkpoint | all |
| Order dispatched event | `zl-commerce` → `zl-inventory-api` | an `order_events` row (`id`, `order_id`, `order_item_id`, `seller_id`, `listing_id`, `quantity`, `type = 'dispatched'`, `created_at`) written in the dispatch transaction, unique per order line | A4 → B3 |
| Listing availability | `zl-inventory-api` → `zl-commerce` | `listing_availability(listing_ids)` returns `in_stock`, `low_stock`, `out_of_stock` or `unknown` per listing; a timeout means `unknown`, never an error | B3 → A4 |
| Inventory entry | `zl-dealer` → `zl-inventory-app` | the dashboard tile opens the `Inventory` root navigator; shown only to approved dealers | B4 |
| AI report | `zl-ai` → `zl-expert` | one `AiReport`: disease, confidence, symptoms, treatment, precautions, advisory, image | A6 |

## 6. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | Shared features live in `common/<feature>`; no extra top-level folder | **Decided** 2026-09-26 |
| D2 | `src/` becomes `frontend/`; Expo project files (`package.json`, `app.config.ts`, `index.js`) stay at the root | **Decided** 2026-09-27 (maintainer) |
| D3 | One backend package, `backend/app/`, containing the SRDS module folders | **Decided** 2026-09-27 (maintainer) |
| D4 | Tests beside the code (frontend), mirrored per module (backend), pgTAP in `supabase/tests` | **Decided** 2026-09-27 (maintainer) |
| D5 | Order lifecycle `pending → confirmed → processing → ready → dispatched → completed`; stock leaves the IMS at dispatch | Recommended |
| D6 | A known stock shortage blocks dispatch | Recommended |
| D7 | Dispatch writes an outbox event; the IMS applies it idempotently; an IMS outage never blocks the marketplace | Recommended |
| D8 | Dealer listings show availability from their linked IMS product | Recommended |
| D9 | Farmer→farmer and dealer→dealer buying allowed; nobody buys from themselves; experts and the admin do not buy | Recommended |
| D10 | Pending or rejected dealers and experts see only an Application Status screen; a rejected one can resubmit | **Decided** 2026-10-04 (maintainer) |
| D11 | AI report text comes from a curated, expert-reviewed disease knowledge base (no LLM) | Recommended |
| D12 | Conversations start only from a listing, an order or a consultation | Recommended |
| D13 | Model weights live in the private Supabase bucket `ml-models`, fetched by signed URL | **Done** 2026-09-26 |
| D14 | A2's design source is a new ZaraiLink design system built from the SRDS (§43–§44, the business rules and the status vocabulary); the earlier Cowork design system and prototype are not used | **Decided** 2026-09-28 (maintainer); design approved 2026-09-28 |

## 7. Outside services and gates

| Gate | Needed for | Status |
|---|---|---|
| G1 Email (SMTP) | Approval and rejection emails, email change, hosted sign-up | Brief exists; built against local Mailpit until provided |
| G3 Backups | Hosted database backups | Brief exists |
| G5 Error tracking | App and API crash visibility | Brief exists |
| G13 EAS | Store builds | Brief exists |
| Hosted migrations | Every phase that changes the database | Pushed only with the maintainer's approval in that moment |
| `MODEL_WEIGHTS_URL` | CI downloads the model | **Done** 2026-09-26: repository secret set; CI downloads and checks the model. Dependabot pull requests need the same value as a Dependabot secret |

## 8. Where each SRDS §53 rule is delivered

| Rules | Plan and phase |
|---|---|
| 1–9 roles, registration, documents, approval, email, log in again | A3 |
| 10 all main-platform functionality under admin moderation | A7 |
| 11–13 private IMS with its own dashboard and UI | B0, B4 |
| 14–16 dispatch sync, idempotent and auditable, manual movements | A4, B1–B3 |
| 17–20 who buys from whom, who messages whom | A4, A5 |
| 21–25 AI module, report, full report to the expert, expert assessment | A6 |
| 26–29, 33–34 modular layout, common, theme, controlled cross-module calls | A1, A2 |
| 30–32 Supabase for data and files, Git for code | A0 (model weights done), every phase |
| 35–37 no escrow, delivery charge line, no logistics | kept, re-tested in A4 |
| 38–39 AI and IMS failures isolated | A6, B3 |
| 40 server-side authorization | every phase, with two-user proofs |
