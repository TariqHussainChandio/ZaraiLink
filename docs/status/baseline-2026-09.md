# P0 baseline: what actually runs (2026-09-21)

Everything below was **observed by running the system**, not read from source: a local Supabase
stack in Docker, the FastAPI backend against it, and scripted HTTP calls with real JWTs. Nothing
touched the hosted Supabase project. The scripts, raw outputs, and how to re-run them are in
[`evidence/`](evidence/). Screens and on-device behaviour were **not** exercised here (no emulator
attached); see "Not verified".

## Verdict

The migrations apply cleanly and the role gates held in every check I ran. The backend does not
hold up: most write paths crash against a real database, the one privilege boundary that matters
can be bypassed at sign-up, and the auth module cannot verify a real user. All of this was
invisible because the backend tests replace the database client with a mock.

| Area | Result |
|---|---|
| Migrations | All 35 apply cleanly to an empty database and the seed loads |
| Auth: email sign-up, sign-in | Sign-up works but the email carries a link, not the code the app expects. Sign-in works for a confirmed user |
| Auth: role assignment | **Broken.** A public sign-up with a forged admin role produced an admin profile, and that session was accepted by the admin API |
| Auth: phone | **Disabled.** The stack reports no SMS provider and rejects phone sign-ups |
| Backend writes | **Broken.** 25 create/update paths across 9 repositories use a call the pinned client does not support. Observed: listing, store, inventory, checkout all return 500 |
| Backend reads | 26 of 30 parameterless GET routes return 200; 4 return 500 |
| Disease pipeline | Fails on a fresh database (missing privileges). With privileges it runs, but has no rejection of non-leaf images and fetches client-supplied URLs |
| Throughput | About 1.6 s per authenticated request, and concurrent requests are fully serialized |

> **Update (2026-09-22, phase P3):** this page is left as originally observed on 2026-09-21 — it
> is point-in-time evidence, not a living status doc (see [`feature-register.md`](feature-register.md)
> for current status). C1 (role assignment) and C2 (disease pipeline fetching client URLs) below
> are now fixed and proven against the real local stack; see
> `docs/process/standardization-plan.md` §5 "P3" and the Evidence files table at the bottom of
> this page for the renamed regression tests. Backend writes (N1), backend reads (N2), and the
> disease pipeline's fresh-database privilege failure (N3) remain open — P5a, not P3.

## How this was run

```bash
npx supabase start                # local Docker stack (images already pulled)
npx supabase db reset             # rebuild from the 35 migrations + seed.sql
# backend, pointed at the LOCAL stack only (environment overrides beat backend/.env)
cd backend
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<local anon> \
SUPABASE_SERVICE_ROLE_KEY=<local service> ../.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
# evidence scripts (need LOCAL_SUPABASE_ANON_KEY / LOCAL_SUPABASE_SERVICE_ROLE_KEY exported)
python docs/status/evidence/p0_auth_reality.py  docs/status/evidence/results/p0_auth_results.json
python docs/status/evidence/p0_core_reality.py  docs/status/evidence/results/p0_core_results2.json
python docs/status/evidence/p0_get_sweep.py
```

The keys are the public demo keys `supabase start` prints for a local stack. Test users exist only
in that disposable database (no dummy data reaches the real project).

## Results

### Auth flows

| ID | Flow | Result | Observed evidence |
|---|---|---|---|
| A1 | Sign up with `data.role = admin` through the public Auth API | **Confirmed defect (C1)** | HTTP 200; stored `profiles.role = admin` |
| A3b | Use that session on the real backend | **Confirmed impact** | `GET /api/v1/admin/stats` returned 200 |
| A2 | Signup confirmation email | **Confirmed defect (C3)** | Subject "Confirm your email address"; no standalone 6-digit code; only links. `VerifyOtpScreen` needs a typed code |
| A3 | Confirm through the link | Pass | 303 redirect carrying a session |
| A4 | Phone sign-up | **Fail** | HTTP 400 `phone_provider_disabled`; the CLI also printed "no SMS provider is enabled. Disabling phone login" |
| A5 | Password-reset email | Partial | Email arrives with a link; the custom-scheme deep link needs a device to prove |
| A6 | Email sign-in, confirmed user | Pass | HTTP 200 |
| A7 | Backend auth gate | Pass | No token 401, garbage token 401, valid token 200 |
| A8 | Email rate limit | Info | Local stack does not enforce `email_sent`; the hosted default sender is capped at 2 per hour by the platform. Pushing `email_sent = 2` to a custom-SMTP project would cap real users at 2 per hour |
| A0b | API docs | Finding | `/docs` is open (200) |

### Business flows (API level)

| ID | Flow | Result | Observed evidence |
|---|---|---|---|
| B1 | Reference data | Pass | Categories and units readable |
| B2 | Farmer creates a listing | **Fail** | HTTP 500 |
| B3 | Buyer browses listings | Pass | Listing visible (row seeded by SQL because B2 fails) |
| B4 | Buyer checkout | **Fail** | HTTP 500 |
| B5 to B7 | Order lifecycle, payment, review | Not reached | Blocked by B4 |
| B8 to B8c | Dealer store, listing, inventory | **Fail** | HTTP 500 each |
| B8d | Oversell protection and atomic stock | Not reached | Blocked by the above |
| B11 | Role gates | Pass | No token 401; buyer to dealer inventory 403; farmer to admin 403; buyer to admin 403; another buyer's order hidden |
| B12 | Suspended user | Pass at the API | HTTP 403 "Account suspended" |
| Sweep | 30 parameterless GET routes | 26 pass, **4 fail** | `analytics/expert`, `analytics/farmer`, `consultations/mine`, `consultations/assigned` return 500 |

### Disease pipeline

| ID | Step | Result | Observed evidence |
|---|---|---|---|
| B10a | Upload photo to storage as a buyer | Pass | HTTP 200 |
| B10b | Create a case on a fresh database | **Fail** | HTTP 500: the backend's privileged role has no table privileges after the migrations |
| B10c/d | Same, after granting that role privileges locally | Pass | Prediction in about 1 s |
| B10d | What it predicted | **Finding (H8)** | A synthetic green image with brown dots was diagnosed as a specific tomato disease at 0.90 confidence |
| B10e | Server-side fetch of client URLs | **Confirmed defect (C2, High)** | Fetched the API gateway and the API itself; answered "not a valid image" for reachable addresses and "could not fetch" for unreachable ones. Content is not returned, so it is a blind SSRF with a reachability oracle |

### Performance

| ID | Measurement | Result |
|---|---|---|
| B13 | One authenticated `GET /api/v1/orders` | Median 1575 ms |
| B13 | 40 concurrent requests | 60,989 ms in total, ratio 0.97 of fully serialized |
| Profile | Building one database client | About 200 ms on this machine, and each request builds several |

The 200 ms figure is from a Windows machine, so absolute numbers will differ on Linux. The
serialization does not: the handlers are `async` but call a synchronous client.

## Defects found by running (new since the source audit)

| # | Defect | Evidence | Fixed in |
|---|---|---|---|
| N1 | 25 write-then-select chains crash: the pinned `postgrest 0.19.3` write builders have no `select()` (`AttributeError`). Affects categories, listings, dealer inventory/stores/suppliers, farms and farm crops, expert application/profile, messaging, consultations, **orders (checkout)**, **payments**, reviews | The same `AttributeError` traceback for every failed write in the backend log; static count by repository: consultations 2, dealer 6, expert 2, farmer 4, marketplace 4, messaging 2, orders 1, payments 2, reviews 2 | Backend repair, then P5 |
| N2 | 4 read routes crash: the code embeds `profiles` through a foreign key `consultations_expert_id_fkey` that does not exist (`PGRST200`) | Backend log; sweep results | Backend repair |
| N3 | Migrations give `service_role` no table privileges, so every service-role call fails on a fresh environment (disease endpoints). It works on the hosted project only if that project still has older default privileges | `permission denied for table profiles / disease_cases` | P3 + P6 |
| N4 | The integration test that should prove the model works on a real photo is skipped: `backend/tests/fixtures/sample_leaf.jpg` does not exist | pytest reports 1 skipped | P9 |
| N5 | `anon`, `authenticated`, and `service_role` hold `TRUNCATE`, `TRIGGER`, `REFERENCES` on tables (observed on `profiles` and `disease_cases`). Not reachable through the Data API, but broader than needed | `information_schema.role_table_grants` | P6 |
| N6 | The frontend suite passes (133 suites, 743 tests, typecheck clean) but Jest warns that a worker failed to exit gracefully, meaning a test leaks a timer. The cause is not yet identified; the OTP screen's resend countdown is never cleared on unmount and is a likely candidate | `npm test` output | P4 / P11 |

## Corrections to the plan

- **C2 severity: Critical becomes High.** It is a blind SSRF; content is not returned.
- **C4 is stronger than stated:** measured serialization, and per-request client construction is the main cost.
- **N1 and N2 change the shape of P5.** The backend was never run against a real database, so
  P5 starts with a repair step and a real-database integration suite, not with modernization.
  Recommended: split it into a repair step that runs right after P3 (so P4's end-to-end tests
  have working endpoints) and the rest of P5 as planned.
- **C1 impact is confirmed end to end**, not just in the trigger.

## Not verified (needs an emulator or the hosted project)

- Every screen and on-device behaviour: OTP screen, deep-link reset, dark mode, edge-to-edge on
  Android 16.
- Realtime delivery of messages and notifications.
- Whether the hosted project has the same admin-signup hole, custom SMTP, email confirmation on,
  and service-role privileges (read-only checks below).

## Needs from you (read-only, on the hosted project)

Run in the Supabase SQL editor of the real project. They change nothing.

```sql
-- 1. Are there admin or expert accounts you do not recognise? (C1 is exploitable there today)
select id, role, full_name, created_at from public.profiles
where role in ('admin', 'expert') order by created_at;

-- 2. Does service_role have privileges there? (decides whether N3 affects production)
select table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'service_role'
  and table_name in ('disease_cases', 'disease_predictions', 'profiles');
```

Also note, from Authentication settings: is "Confirm email" on, is a custom SMTP server set, and
what do the email templates contain.

## Evidence files

| File | Contents |
|---|---|
| `evidence/p0_auth_reality.py`, `results/p0_auth_results.json` | Auth flows A0 to A8 |
| `evidence/p0_core_reality.py`, `results/p0_core_results2.json`, `results/p0_core_run.txt` | Business flows, disease pipeline, authorization, concurrency |
| `evidence/p0_get_sweep.py`, `results/p0_get_sweep.txt` | The 30-route GET sweep |
| `backend/tests/unit/test_disease_case_ssrf_protection.py` | Was the expected-failure test for C2; now a passing regression test (P3 fixed it) |
| `backend/tests/integration/test_signup_role_escalation.py` | Was the expected-failure test for C1; now a passing regression test (P3 fixed it) |

These scripts are the seed of the reality-audit script planned in P1.
