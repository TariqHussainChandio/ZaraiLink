# Backend Architecture (Module 19)

How `backend/app/` is organized, how a request gets authenticated/authorized, and how it talks
to Supabase. Domain-specific ownership rules live in [authorization-model.md](authorization-model.md);
notification write-path specifics live in [notifications.md](notifications.md); the disease
model itself lives in [ai-disease-advisory.md](ai-disease-advisory.md). This doc is the piece
those three don't cover: the layering, the auth flow, and the three Supabase client modes.

## Why a backend service exists at all

The mobile app talks to Supabase directly for identity (Auth) and for reads/writes RLS already
authorizes correctly on its own. FastAPI exists for the operations RLS structurally can't express
alone — cross-row business rules (checkout math, order state transitions, stock adjustment
semantics), anything needing a privileged Supabase call (AI inference writes, audit logging), and
anywhere a client-supplied value (an amount, a status, an actor id) must never be trusted as-is.
Every such operation for all 15 domains now goes through this service; nothing new was invented
beyond what each domain's existing frontend logic already did — the logic moved, it wasn't
redesigned.

## Layering

```
backend/app/
├── main.py            mounts one aggregated router (api/v1/router.py) exposing every domain
│                       under /api/v1/<domain>
├── core/
│   ├── config.py       pydantic-settings: Supabase URL/keys, MODEL_PATH/VERSION/CLASSES
│   ├── auth.py          the auth/authorization gate (below)
│   └── supabase_client.py   the three client modes (below)
├── api/v1/
│   ├── router.py        aggregates all 15 domain routers into one; the only thing main.py imports
│   └── endpoints/       HTTP only — request parsing, dependency wiring, response_model. No DB
│                        calls, no business rules. One file per domain.
├── services/   business logic — authorization checks beyond role (ownership, state machines,
│               calculations), orchestration, cross-domain calls. No direct Supabase calls.
├── repositories/  the only layer touching Supabase. One file per domain, thin query functions,
│                  plus an unused base_repository.py placeholder.
├── schemas/    Pydantic request/response contracts. No ORM anywhere in this codebase.
└── ml/checkpoints/   model.pth + inference (ai_engine.py, disease domain only)
```

Every domain (`admin`, `analytics`, `consultations`, `dealer`, `disease`, `expert`, `farmer`,
`marketplace`, `messaging`, `notifications`, `orders`, `payments`, `profile`, `reference_data`,
`reviews`) follows this exact shape — see any `api/v1/endpoints/<domain>.py` alongside its
`services/<domain>_service.py` and `repositories/<domain>_repository.py` for the template.

Cross-domain business calls (e.g. `orders_service` reducing `dealer_service`'s inventory on
confirm, `payments_service` calling `orders_service.update_order_status`, several services
calling the shared `audit_log_service.log_admin_action`) are direct in-process Python calls —
this is one FastAPI monolith, not a set of services, so there's no HTTP hop between domains.

## Authentication flow (`core/auth.py`)

```
Authorization: Bearer <supabase_access_token>
    → GET {SUPABASE_URL}/auth/v1/user   (verifies the token against Supabase Auth itself —
                                          no JWT signature/JWKS verification reimplemented here)
    → authenticated user id
    → profiles.role / profiles.is_suspended, read via a client scoped to that SAME token
      (get_user_scoped_client — RLS-respecting "read your own profile", not a separate trust path)
    → AuthenticatedUser(id, email, role, access_token)   or a 401/403 rejection
```

| Condition | Result |
|---|---|
| Missing `Authorization` header | 401 |
| Malformed / non-bearer header | 401 |
| Invalid or expired token | 401 |
| Token valid, no matching profile | 401 |
| Token valid, `profiles.is_suspended = true` | 403 |
| Token valid, wrong role for the route | 403 (`require_role` dependency) |
| Token valid, correct role, authorized | proceeds |

`role` and `is_suspended` are **never** read from the request — only from this server-side
lookup, on every single protected call. `require_admin`/`require_expert`/`require_dealer`/
`require_farmer`/`require_buyer` are `require_role(...)` instances built on top of the same
`get_current_user` dependency.

Supabase Auth itself (`supabase.auth.signUp/signIn/signOut/...`) stays entirely client-side —
`src/services/modules/auth/authService.ts` is unchanged by this architecture and makes no FastAPI calls.

## Authorization — three layers

1. **RN UI** (role-gated Quick Actions, hidden nav items) — convenience only, never trusted as a
   security boundary.
2. **FastAPI** — `require_role(...)` for role gates; explicit ownership/business-rule checks in
   the service layer for everything else (e.g. "only this order's buyer/seller may read it",
   "only a completed order's buyer may review it"). Each check is written against the resource's
   actual RLS policy, not guessed — see [authorization-model.md](authorization-model.md) for the
   per-resource rules this mirrors.
3. **PostgreSQL RLS** — stays fully enabled on every table, unweakened. Because repositories use
   the user-scoped client by default (below), a bug or omission in a Level-2 check degrades to
   "RLS still blocks it" rather than "silently exposed."

## Three Supabase client modes (`core/supabase_client.py`)

| Function | Auth used | When |
|---|---|---|
| `get_user_scoped_client(access_token)` | the caller's own JWT, via `client.postgrest.auth(token)` | **default** for every repository — RLS applies exactly as it does for the mobile app calling Supabase directly |
| `get_service_role_client()` | service-role key, bypasses RLS | only the narrow, documented cases below |
| `get_public_client()` | anon key, no user identity | only reads a table's RLS/grants already expose to `anon` (e.g. reference-data lookups, marketplace browsing) |

Service-role is used in exactly four places: `audit_log_service` (`audit_logs` is
admin-select-only by RLS regardless), the notifications trigger domain (inserts were already
trigger-only, never client-writable), disease inference (`disease_cases`/`disease_predictions`
writes), and the `available_stock` RPC call during checkout. Every one of those derives its
filtering identifier from the verified `AuthenticatedUser`, never from a request value — a
service-role client bypasses RLS entirely, so this discipline is the only thing standing in for
it. Three admin-facing reads (`fetch_all_profiles`, `fetch_reports`, `fetch_all_orders`) that
might look like service-role candidates deliberately use the user-scoped client instead, since
the calling user IS an admin and RLS already permits admin-wide reads for those tables — no
bypass needed.

## Storage

All 6 buckets stay direct-to-Storage from the mobile client (owner/participant-scoped RLS on
`storage.objects` already correct for `avatars`, `listing-images`, `disease-images`,
`message-attachments`, `consultation-attachments`). FastAPI mediates only the resulting domain
record (e.g. `POST /api/v1/marketplace/listings` referencing already-uploaded image URLs), never
the file bytes themselves. The one exception: `expert-documents` (private) — signed-URL minting
moved server-side (`GET /api/v1/expert/admin/{expert_id}/document-url`, admin-only), because it
derives the document path from that expert's own stored verification history rather than
accepting a client-supplied path, which a bucket-level RLS policy alone can't express.

## Realtime

Unchanged and not proxied through FastAPI. Supabase Realtime's Postgres Changes feature already
authorizes each change event against the subscribing client's own RLS-visible rows, so
`useRealtimeMessages`/`useRealtimeConsultationMessages`/`useRealtimeNotifications` keep
subscribing directly via the same `supabase` client instance used for Auth (`src/services/
supabase/client.ts`) — meaning the Realtime WebSocket authenticates with the signed-in user's own
session, unchanged by this migration. Only the *write* side of each of those domains
(`sendMessage`, `sendConsultationMessage`, `markRead`) now goes through FastAPI.

## Frontend API client

`src/services/api/client.ts` exports `apiFetch<T>(path, options)` — attaches the current Supabase
session's access token as `Authorization: Bearer <token>`, sends to `ENV.apiBaseUrl`, parses
JSON, and throws a typed `ApiError` (carrying the backend's `detail` message and HTTP status) on
a non-2xx response. Every domain service under `src/services/modules/` calls through this one
function; none construct their own `fetch` calls or attach tokens independently. `authService.ts`
(`src/services/modules/auth/`) is the one exception — it never calls FastAPI at all.

## Model integration (disease domain)

See [ai-disease-advisory.md](ai-disease-advisory.md) for the model itself. On the backend side:
`ai_engine.py` loads `model.pth` lazily and once (a module-level singleton, not
per-request); `MODEL_PATH`/`MODEL_VERSION`/`MODEL_CLASSES` are all `Settings` fields, not
hardcoded. A missing/corrupt/incompatible model file returns `503`; an unparseable image returns
`422`; a valid request against the current placeholder file returns `503` until real weights are
dropped in at the same path — no code change needed when that happens.
