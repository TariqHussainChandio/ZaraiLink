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
semantics), the one operation needing a privileged Supabase call (AI inference writes — see
below), and anywhere a client-supplied value (an amount, a status, an actor id) must never be
trusted as-is.
Every such operation for all 15 domains now goes through this service; nothing new was invented
beyond what each domain's existing frontend logic already did — the logic moved, it wasn't
redesigned.

## Layering

```
backend/app/
├── main.py            lifespan (logging, Sentry, model, shared Supabase clients), middleware, error handlers,
│                       health/version routes; mounts one aggregated router (api_router.py)
├── api_router.py      aggregates all 15 module routers into one; the only thing main.py mounts
├── config/settings.py pydantic-settings, fails at boot on an empty Supabase URL/key; ENVIRONMENT, rate limit,
│                      Sentry DSN, model settings
├── auth/
│   ├── dependencies.py  the auth/authorization gate (below); `declared_roles` registry of require_role routes
│   └── jwt_verifier.py  local JWKS verification of the Supabase access token
├── database/supabase_client.py   the three async client modes (below)
├── middleware/
│   ├── http_middleware.py   pure ASGI: request id, security headers, body-size cap
│   ├── rate_limit.py        per-caller default limit (route-aware middleware over slowapi)
│   └── request_context.py   the request id carried into JSON logs
├── common/            shared core: rows.py (typed PostgREST rows), problem_details.py (RFC 9457 errors),
│   │                   errors.py, logging_config.py, pagination.py, idempotency.py, openapi.py,
│   │                   observability.py (Sentry, off unless SENTRY_DSN is set), audit_log.py, schemas.py
│   └── <feature>/      shared features: analytics, consultations, marketplace, messaging, notifications,
│                       orders, payments, profile, reference_data, reviews
├── admin/ dealer/ expert/ farmer/   role modules
└── ai/                disease advisory: router, service, repository, schemas, engine.py (inference),
                       checkpoints/ (model.pth, model_metadata.json)
```

Every module folder has the same four files: `router.py` (HTTP only: request parsing, dependency wiring,
response_model; no DB calls, no business rules), `service.py` (business logic: authorization beyond role,
ownership, state machines, calculations, orchestration; no direct Supabase calls), `repository.py` (the only
layer touching Supabase; thin query functions) and `schemas.py` (Pydantic contracts; no ORM anywhere).

Every domain (`admin`, `analytics`, `consultations`, `dealer`, `disease`, `expert`, `farmer`,
`marketplace`, `messaging`, `notifications`, `orders`, `payments`, `profile`, `reference_data`,
`reviews`) follows this exact shape — see any module's `router.py` alongside its `service.py` and
`repository.py` for the template. A module reaches another only through its `service.py` or `schemas.py`
(the reality gate's `module-boundary` rule).

Cross-domain business calls (e.g. `orders_service` reducing `dealer_service`'s inventory on
confirm, `payments_service` calling `orders_service.update_order_status`, several services
calling the shared `audit_log_service.log_admin_action`) are direct in-process Python calls —
this is one FastAPI monolith, not a set of services, so there's no HTTP hop between domains.

## Request pipeline (`main.py`, `middleware/`)

Cross-cutting concerns are wired at the app level, before any route runs. Ours are pure ASGI middleware, not
`BaseHTTPMiddleware`: each of those layers re-wraps the request and response streams, and the four of them cost
about 15% of throughput on public reads (ADR 0001).

- **Request id** (`RequestIDMiddleware`): trusts an inbound `X-Request-ID` or mints one, echoes it on the response,
  puts it on every JSON log line and on Sentry events.
- **Security headers**: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, a default-deny CSP, and HSTS over https.
- **Body cap**: 10 MB. A declared `Content-Length` over the cap is refused up front, and received bytes are counted,
  so a chunked body is cut off too (413 problem+json).
- **CORS**: `ALLOWED_ORIGINS` allowlist, `GET/POST/PATCH/DELETE`, `Authorization` and `Content-Type` only, no
  credentials (bearer tokens, never cookies). Only browsers care; the mobile app is not subject to CORS.
- **Rate limiting** (`middleware/rate_limit.py`): `RATE_LIMIT_DEFAULT` (200/minute) per caller on every route, keyed by
  a hash of the bearer token when one is present (nothing is read from the unverified token) and otherwise
  by client IP, with a tighter 10/minute on `/api/v1/disease/predict`. slowapi's own middleware cannot find handlers
  behind FastAPI 0.141's lazy included routers and silently stopped limiting, so `RateLimitMiddleware` does the route
  lookup through `iter_route_contexts`. Behind a load balancer set `FORWARDED_ALLOW_IPS` to its address, or every
  caller shares one bucket; never trust more than the real proxy.
- **Errors**: every `HTTPException`, validation error and unhandled exception is `application/problem+json`; the
  client never sees a stack trace.
- **Docs**: `/docs`, `/redoc` and `/openapi.json` exist only when `ENVIRONMENT=development`.

Health: `/health/live` (process up), `/health/ready` (a real query through the anon client; 503 when Supabase is
unreachable), `/health` (deprecated alias of live) and `/version`. The container healthcheck uses `/health/ready`.

## Authentication flow (`auth/dependencies.py`)

```
Authorization: Bearer <supabase_access_token>
    → verified locally against Supabase's JWKS (auth/jwt_verifier.py: signature, expiry, audience);
      a JWKS outage is a 503, not a 401
    → authenticated user id
    → profiles.role / profiles.is_suspended, read via a client scoped to that SAME token
      (get_user_scoped_client — RLS-respecting "read your own profile", not a separate trust path),
      cached for 10 s per user (so a suspension takes up to 10 s to bite)
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
`frontend/common/auth/services/authService.ts` is unchanged by this architecture and makes no FastAPI calls.

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

## Three Supabase client modes (`database/supabase_client.py`)

| Function | Auth used | When |
|---|---|---|
| `get_user_scoped_client(access_token)` | the caller's own JWT, via `client.postgrest.auth(token)` | **default** for every repository — RLS applies exactly as it does for the mobile app calling Supabase directly |
| `get_service_role_client()` | service-role key, bypasses RLS | only the narrow, documented cases below |
| `get_public_client()` | anon key, no user identity | only reads a table's RLS/grants already expose to `anon` (e.g. reference-data lookups, marketplace browsing) |

All three modes return an async client. The service-role and anon clients are shared singletons built once
in the FastAPI lifespan (`init_shared_clients()`); the user-scoped client is built per call, because each
caller has a different token and `postgrest.auth(token)` mutates shared state.

Service-role is used in two files today (P5 audit, verified against the code and both grant migrations):

- `ai/repository.py` (every function: `disease_cases`/`disease_predictions` reads and
  writes, plus signed URLs and downloads from the private `disease-images` bucket). It derives its
  filtering identifier from the verified `AuthenticatedUser`, never from a request value; ownership
  (`case.user_id == caller.id`, or admin) is checked in `ai/service.py` before trusting
  anything the repository returns. A service-role client bypasses RLS entirely, so that discipline is the
  only thing standing in for it. Kept: the storage path is deliberately never handed to a client-scoped
  storage credential.
- `common/profile/repository.py`, three sites in the account-deletion flow: `soft_delete_auth_user`
  (the GoTrue admin API has no user-token equivalent), `log_self_deletion` (`audit_logs`' only insert
  policy is admin-only by design, BR-15, and a self-deleting user is not an admin), and
  `delete_owned_storage_objects`. That last one could run under the user's own token, since the
  owner-scoped storage policies would allow it; it stays service-role because the token must still be
  valid mid-flow at that exact step and nothing re-authenticates it, and the caller owns those objects
  either way. The same file's `update_profile` and `anonymize_profile` use the user-scoped client.

No repository other than these two calls `get_service_role_client`.

Three domains that might look like service-role candidates deliberately don't reach for it,
each with its own reason documented at the call site:
- `audit_log_service.log_admin_action` uses the user-scoped client — every caller has already
  passed `require_admin`, and `audit_logs`' insert policy is admin-only, so RLS already permits
  the write; there's no reason for a full-bypass client just to log an action the caller was
  already allowed to take.
- `orders_repository.get_available_stock` calls the `available_stock` RPC through the
  user-scoped client too — the Postgres function itself is `security definer` (elevated at the
  database level), so the elevation lives in the RPC, not in the calling client.
- Notification *creation* isn't a backend code path at all — it's written entirely by Postgres
  triggers calling `public.create_notification` (`security definer`), with no FastAPI
  involvement (see [notifications.md](notifications.md)). The backend's own
  `common/notifications/repository.py` (reading, marking read) uses the user-scoped client like
  everything else.
- Three admin-facing reads (`fetch_all_profiles`, `fetch_reports`, `fetch_all_orders`) also use
  the user-scoped client, since the calling user IS an admin and RLS already permits admin-wide
  reads for those tables — no bypass needed.

## Storage

All 6 buckets stay direct-to-Storage from the mobile client for the upload itself
(owner/participant-scoped RLS on `storage.objects` already correct for `avatars`,
`listing-images`, `message-attachments`, `consultation-attachments`). FastAPI mediates only the
resulting domain record (e.g. `POST /api/v1/marketplace/listings` referencing already-uploaded
image URLs), never the file bytes themselves. Two exceptions, both private buckets where the API
mints the read-facing URL server-side rather than trusting one from the client:

- `expert-documents` — signed-URL minting moved server-side
  (`GET /api/v1/expert/admin/{expert_id}/document-url`, admin-only), because it derives the
  document path from that expert's own stored verification history rather than accepting a
  client-supplied path, which a bucket-level RLS policy alone can't express.
- `disease-images` — security fix C2 (see [ai-disease-advisory.md](ai-disease-advisory.md)
  §Data flow). This one isn't about admin access: the API used to accept and store whatever
  `image_url` the client sent and fetch it server-side, which P0 proved was a blind SSRF. It now
  accepts only a validated, owner-checked `storage_path` and mints its own signed URL for every
  response, so the backend never resolves a client-supplied location at all, upload or read.

## Realtime

Unchanged and not proxied through FastAPI. Supabase Realtime's Postgres Changes feature already
authorizes each change event against the subscribing client's own RLS-visible rows, so
`useRealtimeMessages`/`useRealtimeConsultationMessages`/`useRealtimeNotifications` keep
subscribing directly via the same `supabase` client instance used for Auth (`frontend/services/
supabase/client.ts`) — meaning the Realtime WebSocket authenticates with the signed-in user's own
session, unchanged by this migration. Only the *write* side of each of those domains
(`sendMessage`, `sendConsultationMessage`, `markRead`) now goes through FastAPI.

## Frontend API client

`frontend/services/api/client.ts` exports `apiFetch<T>(path, options)` — attaches the current Supabase
session's access token as `Authorization: Bearer <token>`, sends to `ENV.apiBaseUrl`, parses
JSON, and throws a typed `ApiError` (carrying the backend's `detail` message and HTTP status) on
a non-2xx response. Every domain service's business-logic calls go through this one function;
none construct their own `fetch` calls or attach tokens independently. Several services (`marketplace`,
`messaging`, `profile`, `expert`, `consultations`, `disease`) also import `supabase` directly
alongside `apiFetch` — confirmed to be Storage-bucket upload/`getPublicUrl`/`createSignedUrls`
calls only (per the "Storage" section above), plus one `supabase.auth.updateUser` for password
changes — never a `.from(table)` read/write bypassing FastAPI. `authService.ts`
(`frontend/common/auth/services/`) is the one service that never calls FastAPI at all.

## Model integration (disease domain)

See [ai-disease-advisory.md](ai-disease-advisory.md) for the model itself. On the backend side: the checkpoint is
loaded once in the lifespan (`load_classifier()`, read through `get_classifier()`), not at import and not per
request, and the forward pass runs in a worker thread (`asyncio.to_thread`) so inference cannot stall the event loop.
`MODEL_PATH`/`MODEL_VERSION`/`MODEL_CLASSES` are `Settings` fields. A missing/corrupt/incompatible checkpoint returns
`503`; an unparseable image `422`.

## Async data access

Every repository and service is `async`; only the terminal `.execute()` of a query chain is awaited. Independent
reads use `asyncio.gather` (checkout availability, analytics, platform stats); dependent chains stay sequential on
purpose. httpx builds an SSL context for every client, which loaded the CA bundle each time and blocked the event
loop for about 0.3 s, so `database/supabase_client.py` memoizes `create_ssl_context` (pinned to `httpx==0.28.1`). This,
not `await` alone, is what stopped requests serializing: see
[ADR 0001](adr/0001-async-supabase-client-migration.md) for the measurements.

## API contract (P7)

The OpenAPI document is the source of truth (`backend/openapi.json`, written by `scripts/export_openapi.py`; the mobile
client in `frontend/services/api/generated` is generated from it). `common/openapi.py` shapes it: readable operation ids
(`<tag>_<handler>`), a bearer security scheme instead of an optional `Authorization` parameter on every call, problem+json
as the documented error body (including 422), and the `Link` and `X-Request-ID` response headers. Every response has a
Pydantic model in its module's `schemas.py` (embeds such as the listing's owner and category are optional, because create and update
return the bare row and reads embed relations). Database errors that are really bad input are mapped to 4xx in
`common/problem_details.py` (`database_error_handler`), and an update that matched no row is a 404 (`common/rows.first_row`).

## Error contract (P7 7B)

Every error is `application/problem+json` (`common/problem_details.py`) with a stable `code` from `common/errors.py`
(`ErrorCode`, documented in the OpenAPI `ProblemDetail`). Most codes follow from the HTTP status (`default_code`); the
ones the app must tell apart raise `AppHTTPException` with their own (`account_suspended`, `insufficient_role`,
`mfa_required`, `incorrect_password`, `insufficient_stock`, `invalid_transition`, `idempotency_in_progress`,
`idempotency_key_reused`, and others). A 422 lists `errors: [{loc, msg}]` (never the input values), and a rate-limit 429
carries `Retry-After`. `title` is English for logs; clients decide from `code`, and the mobile app maps it to its own message.

## Pagination and idempotency

- **Pagination** (`common/pagination.py`): every list endpoint takes `limit` (1 to 100, default 100; 20 for the
  marketplace feed) and `offset`, returns a bare array, and sets `Link: <...>; rel="next"` when a page comes back
  full. There is no `X-Total-Count` (it needs a counted query per list and nothing consumes it yet). Mobile screens do
  not read `Link` until P7, so a list over 100 rows is cut off there.
- **Idempotency** (`common/idempotency.py`, table `idempotency_keys`): `Idempotency-Key` on order checkout and payment
  initiation. The key is claimed with an insert before any work runs; a repeat replays the stored response, a
  concurrent repeat gets 409 with `Retry-After`, a different body under the same key gets 422 (a stored request hash),
  and any failure releases the key. Keys are per user and per endpoint, owner-only under RLS, and swept after 24 h.
  Opt-in, and no client sends the header yet (P7). Checkout is not atomic across sellers, so a failure after the first
  seller's order releases the key and a retry can create that order again.

## Observability

JSON logs with the request id (stdlib, no structlog). Sentry (`common/observability.py`) is initialised only when
`SENTRY_DSN` is set; it sends no request bodies, cookies, query strings, credential headers, stack-frame locals, email
or IP. Live proof is blocked on the maintainer creating the project ([g5-sentry.md](../process/briefs/g5-sentry.md)).

## Container

`backend/Dockerfile` is multi-stage (uv builds the environment from `uv.lock`), runs as a non-root user, fetches the
checksum-verified model weights at build time with a BuildKit secret, and has a healthcheck on `/health/ready`.
`backend/docker-compose.yml` joins the local Supabase Docker network. Not hosted anywhere yet (gate G4).

## Tests

The unit tests (`backend/tests/<module>/`) mock only outer edges; `backend/tests/integration` runs a real uvicorn
against the local
Supabase stack. Highlights: the authorization matrix (every route as every role, plus a reviewed snapshot of who may
call what), the admin audit-log guard (every admin-reachable write leaves an `audit_logs` row, BR-15), idempotency,
pagination, HTTP hardening and proxy-header tests. CI gates unit plus integration coverage combined at 85% (currently
about 95%); the smoke backend runs under `tests/integration/smoke/serve_measured.py` so its lines are counted.
