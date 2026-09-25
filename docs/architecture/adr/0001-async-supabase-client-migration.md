# ADR 0001: Async Supabase client, and what actually serialized requests

Status: accepted (P5, item 2). This is the first ADR in the repository; `docs/architecture/adr/` is a new
convention, numbered from 0001.

## Context

P0 measured the backend as effectively serial: about 1.6 s per authenticated request, and 40 concurrent
requests taking 61 s (serialization index 0.97). The handlers were `async def` but every repository call
used the synchronous `supabase-py` client, so each call blocked the event loop.

## Decision

Move every repository and service to the `AsyncClient` shipped in the pinned `supabase==2.11.0`
(`create_async_client`), and `await` each query. Rejected alternative: keep the sync client and run it in
the threadpool. A fresh client is still needed per request because `postgrest.auth(token)` mutates shared
state, so threadpool workers would be a second capacity setting to tune, and the per-request client cost
(below) would remain.

Independent reads inside one request run with `asyncio.gather` (checkout availability, the four analytics
endpoints, admin stats). Dependency chains stay sequential (checkout's order, items and history inserts;
`mark_payment_failed`).

## What the benchmark found

Converting to `await` alone did **not** fix serialization. The first k6 run of the migrated code still took
about 2.1 s per checkout and 25 s for 10 concurrent checkouts, so the loop was still blocked. Profiling
`create_async_client` showed why: each `httpx.AsyncClient` builds an SSL context, and loading the CA bundle
is about 0.28 s of synchronous CPU. One Supabase client builds several httpx clients, and the per-request
user-scoped client is built on every repository call. This cost existed before the migration too, and it is
the more likely origin of P0's number than the blocking `.execute()` itself.

Fix, in `core/supabase_client.py`: memoize httpx's `create_ssl_context` so the CA bundle loads once per
process. An `SSLContext` is safe to share. Warm client creation plus one query went from 0.60 s to 0.017 s.
This patches a private httpx name (`httpx._transports.default`), pinned to `httpx==0.28.1`; revisit on upgrade.
Still in place, and still needed, on supabase-py 2.31 (which pins the same httpx).

## Measurements

Method: k6 (`grafana/k6` Docker image, since no local binary), `backend/k6/list-and-write.js`, 20 s per run,
constant VUs, local Supabase stack, one uvicorn process on a Windows dev machine. The slowapi rate limiter
was switched off through a launcher (`limiter.enabled = False`) because its 200/min per-IP default returns
429 to a single-IP load test; no application code was changed for this. Numbers are the load phase only.

"Before" is the last commit (`8cf1152`), run from a `git worktree`. That is the codebase P0 measured, so it
contains none of P3/P4/P5a/P5. It is therefore not an isolated test of the async change alone; no
intermediate commit exists to isolate it, and work is uncommitted by policy. Before's write paths crash
(N1), so the write scenario has no "before" and the authenticated-read scenario is the like-for-like one.

Authenticated `GET /api/v1/orders` (buyer token; profile lookup plus one query per request):

| VUs | before req/s | before avg latency | after req/s | after avg latency |
|---|---|---|---|---|
| 1 | 0.65 | 1.55 s | 52 | 19 ms |
| 10 | ~1 (21 in 20 s) | 14.5 s | 87 | 114 ms |
| 50 | ~1 (25 in 20 s) | 25.8 s | 74 | 682 ms |

"Before" throughput does not rise with VUs: fully serialized. "After" is roughly two orders of magnitude
faster, and rises from 1 to 10 VUs.

Authenticated `POST /api/v1/orders/checkout` (after only): 19.5 req/s at 1 VU (49 ms), 32.7 at 10, 30.2 at 50.

## Consequences and limits

- The "no longer serializes" exit criterion is met for authenticated requests: latency at 1 VU is 19 ms,
  not 1.5 s, and throughput scales past one VU.
- Scaling is modest and plateaus (about 87 req/s reads, about 30 req/s checkout). One Python process is
  CPU-bound; more throughput needs more workers, which is a deployment decision (P12), not measured here.
- Public reads (`GET /marketplace/listings`, shared client) were about 150-180 req/s before and about 20%
  slower after 5A. Cause found by removing layers one at a time (100 VUs, 15 s): all middleware cost about 15%
  and JSON logging setup about 8% more. The three `BaseHTTPMiddleware` classes and slowapi's were rewritten as
  pure ASGI middleware (`core/middleware.py`, `core/rate_limit.py`), and public reads returned to about 150
  req/s (102 req/s on the upgraded stack before the rewrite, 150 after). The remaining logging cost was left.
- The dependency refresh (FastAPI 0.141.1 / Starlette 1.7 / pydantic 2.13 / supabase-py 2.31) ran through the same
  k6 script: authenticated reads 84 req/s at 10 VUs and 71 at 50 VUs, in line with the 87 and 74 above.
- Machine and Docker Desktop timing on Windows are noisy; treat ratios, not absolute numbers, as the result.
  The verifier should re-run both passes rather than trust these figures (plan, verification step 5).

## Reproduce

```
git worktree add ../zarailink-p5-baseline 8cf1152    # before; uv sync --frozen inside backend/
# start each server with the limiter off, on ports 8001 (before) and 8000 (after):
python -c "from app.core.rate_limit import limiter; limiter.enabled=False; import uvicorn, sys; uvicorn.run('app.main:app', host='127.0.0.1', port=int(sys.argv[1]))" 8000
docker run --rm -i -v "$PWD/backend/k6:/scripts" grafana/k6 run /scripts/list-and-write.js \
  -e BASE_URL=http://host.docker.internal:8000 -e SUPABASE_URL=http://host.docker.internal:54321 \
  -e ANON_KEY=... -e SERVICE_KEY=... -e SCENARIO=authread -e VUS=10 -e DURATION=20s
```
`SCENARIO` is `read`, `authread` or `write`.
