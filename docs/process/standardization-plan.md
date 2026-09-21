<!-- Canonical copy of the standardization plan. Update THIS file as phases complete; the copy under the
     maintainer's ~/.claude/plans is a working draft. Sections 1.1 to 1.6 describe unfixed weaknesses in detail:
     review them before the repository is made public (go-public gate, section 6.4). -->

# ZaraiLink Standardization Program — Plan v2

> **Status (2026-09-21): P0, P1, and P2 executed** (P1 and P2 proven locally; GitHub-side proof needs your
> push, see `docs/status/p1-gates-2026-09.md` and `docs/status/p2-expo-2026-09.md`. P2 stops at gate G13:
> the EAS brief waits for you and blocks nothing before P12).
>
> **P0 executed.** Runtime results are in §1.6 and in
> `docs/status/baseline-2026-09.md`. They confirmed the source-level findings, re-rated one, and
> exposed a large new defect class (N1), so the roadmap gained a repair phase, **P5a**, ahead of
> the auth vertical slice. §1 findings were first verified by reading source; §1.6 is by running.
>
> **Decisions already made by you:** full Expo (prebuild + EAS) · email sign-in first, phone next ·
> repository becomes public · full 12+ week program (all phases in scope; each is tagged
> Must/Should/Could only to set order).

---

## 0. Context

**Why this plan exists.** ZaraiLink (React Native 0.86 + FastAPI + Supabase, five roles: farmer,
buyer, dealer, expert, admin) is "feature-complete" on paper: the existing Field Manual marks
Phases 0–3 and 5–7 done. The direction now is to stop adding features and **standardize the
project to modern mobile-app practice** — security, coding standards, documentation, test suites,
UI/UX, and CI/CD — and to fix a specific process failure: earlier agent work **skipped hard parts
or shipped functions that do not work** (the auth module is the named example).

**The auth failure is concrete, not vague.** The project's own `implementation plan.md`
(Module 3, `VerifyOtpScreen`) admits the signup OTP screen is "built and wired up" but "not yet
end-to-end": the hosted Supabase project uses the free-tier default email sender, so the email
carries a link instead of the code the screen expects. Supabase's docs confirm the default sender
only delivers to **project team members** and is capped at **2 messages/hour**, "non-production
only". So, as configured, a real new user cannot complete signup verification. The code exists,
tests pass (they mock the service), and the feature does not work. That pattern — *code without a working
foreign-service integration, validated only by mocks* — is what the protocol in §2 is designed to
make impossible.

**What has changed since the Field Manual was written** (verified this session, Sept 2026):

| Fact | Consequence for the plan |
|---|---|
| Expo SDK 57 is live and ships React Native **0.86** — the exact version this repo uses | Adopting Expo modules/EAS is now a version-aligned option, not a downgrade (SDK 56 was RN 0.85) |
| Hermes V1 is the default engine since RN 0.84; RN team recommends a framework (Expo) over the bare Community CLI | Toolchain decision in §4.1 |
| Google Play: new apps/updates must target **API 36** from 31 Aug 2026; in-app **and** web account deletion is mandatory; 16 KB page-size support required | Repo already targets 36, but `edgeToEdgeEnabled=false` is ignored at API 36 → layout audit; account deletion is a new feature |
| Supabase: from **30 Oct 2026** new tables in *existing* projects are no longer auto-exposed to the Data API — every migration must carry explicit `GRANT`s | All future migrations follow a new template (§4.3) |
| Supabase default SMTP = team members only, 2/hr; custom SMTP then defaults to 30/hr; SMS needs a provider or the Send-SMS hook | Auth cannot work in production without provisioning (§3) |
| `torch==2.5.1` (pinned in `backend/requirements.txt`) is the **last version vulnerable to CVE-2025-32434** (RCE via `torch.load` even with `weights_only=True`; fixed in 2.6.0) and `model.pth` (9.3 MB, real weights now) is tracked in git | Critical item in the security phase |
| FastAPI is at 0.141.x, pydantic 2.13.x; repo pins 0.115.6 / 2.10.4 / supabase-py 2.11.0 | Dependency modernization phase |
| GitHub Free + private repo: no branch protection, no rulesets, no secret scanning push-protection, no CodeQL | Decided: the repo goes public after a go-public gate (§6.4); until then gates are convention (§4.7) |

---

## 1. Ground truth — what is real and what is not

Method: every finding below was verified **first-hand by reading source, config, and
migrations** (file references given). Nothing has been executed; findings marked
*source-confirmed* still need a runtime proof, which is the first task of P0 (write the failing
test, then fix).

### 1.1 Auth module — flow by flow

| Flow | Works as shipped? | Why (evidence) |
|---|---|---|
| Email sign-up + 6-digit OTP verify | **No** | Email template is the default link template, not the token (`supabase/config.toml` has no `[auth.email.template.*]`); hosted default SMTP only reaches team members at 2/hr; `VerifyOtpScreen` expects a code. Backend + frontend tests mock the service, so they pass |
| Phone sign-up / sign-in / verify | **No** | `[auth.sms.twilio] enabled = false`, no Send-SMS hook, no `[auth.sms.test_otp]`, yet `enable_confirmations = true` |
| Email sign-in (already-confirmed account) | Probably | No blocker in code; unproven on a running stack |
| Password reset | **Partial** | Email cannot reach non-team addresses on the hosted default sender; PKCE + custom-scheme deep link (`zarailink://reset-password`) never exercised on a device; `ResetPasswordScreen` is new and untracked |
| Role chosen at sign-up | **Broken (security)** | `handle_new_user()` reads `raw_user_meta_data->>'role'` and the enum includes `admin`; the guard trigger only fires on UPDATE. Anyone with the public anon key can sign up as admin (see C1) |
| Session persistence / refresh | Works, **insecure** | Session stored in plain AsyncStorage (`src/services/supabase/client.ts`) |
| Server-side token verification | Works, slow and fragile | One network call to `/auth/v1/user` plus one profile query per request; Supabase outage returns 401 (`backend/app/core/auth.py`) |
| Suspension | Works in RLS + API | Migration `20260901110000`, `core/auth.py` |
| MFA | **Disabled** | `[auth.mfa.totp] enroll_enabled = false`, even for admin |
| Password policy | **Weak** | `minimum_password_length = 6`, no complexity; `ResetPasswordScreen` also min 6 |
| Account deletion | **Absent** | No code or SQL anywhere (Play requires it) |
| 401 handling in the app | **Absent** | No handling of 401 responses anywhere in `src/` (suspension is detected only from the profile row); `apiFetch` has no timeout or retry |

### 1.2 Findings ranked

**Critical**

| # | Finding | Evidence |
|---|---|---|
| C1 | Privilege escalation at signup: any caller can create an admin profile through the public Auth API | `20260820000000_core_schema.sql:52-71`; `20260822085900_profiles_role_guard.sql` (UPDATE only). *Source-confirmed, runtime proof pending* |
| C2 | **Re-rated High after P0 (blind SSRF).** Server-Side Request Forgery: client-supplied `image_url` is stored unvalidated (service-role insert) and later fetched server-side, with no size cap and distinguishable error responses; content is not returned to the caller | `schemas/disease.py`, `services/disease_service.py:341-362`, `repositories/disease_repository.py` |
| C3 | Real users cannot complete signup (see table above) | config + `VerifyOtpScreen.tsx` |
| C4 | Blocking I/O inside async handlers: all 115 routes are `async def`, yet every DB call uses the synchronous supabase-py client and model inference is synchronous; a new client object is built per request. One slow call stalls every other request | `core/auth.py:64-66`, `core/supabase_client.py:31-38`, `services/ai_engine.py`, `disease_service.py:365` |
| C5 | `torch==2.5.1` is the last version affected by CVE-2025-32434; weights are tracked in git | `backend/requirements.txt`, `git ls-files` |

**High**

| # | Finding | Evidence |
|---|---|---|
| H1 | Tokens in plain AsyncStorage (MASVS-STORAGE) | `src/services/supabase/client.ts` |
| H2 | No size or MIME limits on any of the 6 storage buckets; 3 are public including `disease-images` (photos can carry GPS EXIF); extension and content-type come from the client | migrations (`insert into storage.buckets`), `diseaseService.ts:9-22` |
| H3 | Release build signed with the debug keystore; no R8 minify; static `versionCode 1` | `android/app/build.gradle:61,86-108` |
| H4 | Rate limiting keyed by client IP with no proxy configuration (all users share one bucket behind a proxy, or the key is spoofable); `/docs` and `/openapi.json` exposed; no request IDs, structured logs, or security headers | `core/rate_limit.py`, `main.py` |
| H5 | Tests prove logic, not reality: the 18 backend unit-test files replace the repository/Supabase layer with mocks or overrides (`conftest.py` is empty) and the single integration test only loads the model checkpoint; the frontend mocks the whole Supabase client; no E2E, no pgTAP/RLS tests, no coverage gate in CI | `backend/tests/`, `src/testUtils/supabaseMock.ts`, `.github/workflows/` |
| H6 | 206 `auth.uid()` calls across policies and helper functions, none in the `(select auth.uid())` form, so it is re-evaluated per row; no advisor run in CI | `supabase/migrations/*.sql` |
| H7 | 14 of 15 endpoint modules take no pagination parameters; the 15th (marketplace) has a page index with no size limit. Supabase silently caps responses at 1000 rows by default | `backend/app/api/v1/endpoints/` |
| H8 | AI feature: model is PlantVillage-only (lab photos, 38 classes) and covers none of Pakistan's staple crops (wheat, rice, cotton, sugarcane); no out-of-distribution rejection; the 99.8% figure is measured on the same lab-photo distribution, and no training code, dataset provenance, or split method exists in the repo, so it cannot be reproduced or audited; each retrain adds ~9 MB to git history | `ml/checkpoints/*.json`, `ai_engine.py`, repo search for notebooks/scripts |
| H9 | No account deletion (Play policy) and no privacy/Data-Safety artefacts | repo-wide |

**Medium**

| # | Finding | Evidence |
|---|---|---|
| M1 | Data layer is hand-rolled: React Query is used in 2 files while 57 of 65 screens fetch in `useEffect`; no `onlineManager`/NetInfo, no ErrorBoundary, no crash reporting | `src/`, `App.tsx` |
| M2 | Type and lint debt: 114 `as any` in 76 files, 39 `console.*` calls, 10 empty handlers, ESLint 8 with the RN preset only, no knip/dead-code check, stale comments (e.g. `diseaseService.ts` still describes placeholder weights) | grep census |
| M3 | Localization: 62/65 screens wired but 1/42 components; `ur.json` is 4 keys short; no Urdu font bundled (`src/assets/fonts` empty); no RTL handling (no `I18nManager` call), so Urdu renders left-to-right | `src/localization`, grep |
| M4 | Photos are uploaded uncompressed (no `maxWidth`/`quality`) over rural connections | `src/utils/photoPicker.ts` |
| M5 | Dependency drift: FastAPI 0.115.6 (0.141.x current), pydantic 2.10.4 (2.13.x), supabase-py 2.11.0; no lockfile or hashes; pytest in production requirements; no ruff/mypy/coverage | `backend/requirements.txt` |
| M6 | Features that do not exist: push notifications (no FCM, no device tokens) and any payment gateway (only manual confirmation) | grep |
| M7 | `edgeToEdgeEnabled=false` while `targetSdk 36` (opt-out is ignored on Android 16) | `android/gradle.properties`, `build.gradle` |
| M8 | Repo hygiene: 152 uncommitted files (+4.6k/−1.5k lines) including a new screen and model metadata; stray `.zl-i18n-verify-tmp/`; `mcp_configurations/` Python files that are documentation, not config; no `.gitattributes`/`.editorconfig` (CRLF churn); no CONTRIBUTING, SECURITY, LICENSE, CHANGELOG, CODEOWNERS, dependabot, PR template, or CLAUDE.md; README is two lines; two project skills are stale (`qa-test-engineer` says frontend tests are absent; `devops-engineer` says do not propose Docker) | git status, file checks |
| M9 | CI: no `permissions` block, actions pinned to tags not SHAs, no Gradle cache or APK build, no coverage, no security scans, no CD; path filters can leave required checks pending | `.github/workflows/*.yml` |

### 1.3 What is genuinely solid (keep and protect)

RLS on all 36 tables (126 policies, 42 indexes); server-derived pricing and delivery charge as a
generated column; atomic row-locked stock RPC; suspension enforced in RLS; append-only audit log;
`seed.sql` contains only admin-curated reference data; **no secrets in tracked files or git
history** and `.env` is ignored; explicit GRANT discipline already present in migrations;
`allowBackup=false` and release cleartext off; 133 test files with a test for every screen;
migration-lint CI; 706 lines of architecture docs; zero TODO/FIXME in source.

### 1.4 Where the Field Manual overstates

Phase 3 ("UI/UX richness") and Phase 1 ("security hardening") are marked done, yet C1, C2, H1,
H2, and the auth failures above survive them. Phase 5 counts 734 frontend + 112 backend tests as
coverage, but H5 shows they cannot detect any of these defects. Phase 4 (model) has started in the
working tree but H8 shows it is not product-ready. This plan therefore **re-opens** those areas
with runtime proof as the acceptance standard.

### 1.5 Coverage check — every finding has an owner phase and a proof

This table is the anti-skip control: at each wave's reality audit (§7) the verifier confirms every
row below is closed with the listed proof, or explicitly still open.

| Finding | Fixed in | Proof required |
|---|---|---|
| C1 role escalation | P3 (fix), P4 (AT2), P6 (pgTAP) | Red test turns green; reverting the fix turns it red again |
| C2 SSRF | P3, P11 (abuse suite) | Internal-URL payloads rejected; oversize and non-image files rejected |
| C3 signup cannot complete | P4 (4A–4C) | AT1 locally and AT11 live on staging |
| C4 blocking I/O | P5 | k6 run shows concurrent requests no longer serialize; ADR with numbers |
| C5 torch CVE, weights in git | P3 (pin, move), P9 (ONNX) | `pip-audit` clean; fresh clone fetches weights by checksum |
| H1 plain-text tokens | P4B | AT7: stored value is ciphertext |
| H2 no upload limits | P3 (limits), P6 (pgTAP), P7 (compress, EXIF strip) | Oversize and wrong-MIME uploads rejected by the bucket itself |
| H3 debug-signed release, no R8 | P2 (R8, versionCode), P12 (signing) | Release AAB verified with `apksigner`; mapping file archived |
| H4 rate limit, docs, logs, headers | P5 | Behind a proxy, two users get separate buckets; `/docs` off in prod |
| H5 mock-only tests, no E2E/pgTAP/coverage | P1 (report), P5, P6, P11 | Integration, pgTAP, Maestro all run in CI with thresholds |
| H6 bare `auth.uid()` | P6 | Advisor clean; `EXPLAIN` before/after |
| H7 no pagination | P5 | Every list route rejects `limit > 100` and returns a `next` link |
| H8 AI honesty | P9 | Model card; field-set accuracy; out-of-distribution rejection tested |
| H9 no account deletion / privacy artefacts | P4 (deletion), P13 (compliance) | AT9; public deletion page; Data Safety mapping |
| M1 hand-rolled data layer | P7 | 57 screens migrated; boilerplate deleted; airplane-mode script |
| M2 type and lint debt | P1 (ratchet), P2 (ESLint), P7 (burn-down) | Counters at zero |
| M3 localization / RTL | P8 | RTL and Urdu-font script; parity lint |
| M4 uncompressed photos | P7 | Uploaded size under budget on a test photo |
| M5 dependency drift | P2 (frontend), P5 (backend) | `expo-doctor` and `pip-audit`/OSV clean; lockfiles |
| M6 push and gateway absent | P0 (register is truthful), P10 | Live smoke tests, or the feature stays hidden |
| M7 edge-to-edge | P2 (config), P8 (verified) | Screenshots on Android 15 and 16 |
| M8 repo hygiene | P0, P1 | Clean `git status`; standards files present |
| M9 CI gaps | P1, P12 | Deliberate-failure PRs; tagged release rehearsal |
| N1 write-then-select crashes (25 chains, 9 repositories) | P5a | Every create/update endpoint returns 2xx against the real local stack in CI |
| N2 four read routes crash (missing foreign key hint) | P5a | The GET sweep returns no 5xx |
| N3 service role has no privileges on a fresh database | P5a (grants), P3 (disease flow) | Disease create and predict pass on a database built only from migrations |
| N4 real-photo model test skipped (no fixture) | P9 | A license-clean sample photo committed; test runs unskipped |
| N5 unneeded TRUNCATE/TRIGGER/REFERENCES grants | P6 | Grants match a documented allow-list |

### 1.6 P0 runtime results (2026-09-21)

Method: local Supabase in Docker (35 migrations applied from empty), FastAPI against it, scripted
calls with real JWTs. Full evidence: `docs/status/baseline-2026-09.md` and `docs/status/evidence/`.

| Finding | Runtime verdict |
|---|---|
| C1 forged-admin signup | **Confirmed end to end.** Public signup produced an admin profile; that session returned 200 from the admin API |
| C2 SSRF | **Confirmed, re-rated High.** Server fetched its own gateway and itself; reachable vs unreachable addresses give different errors |
| C3 signup verification | **Confirmed.** Email has links only, no code |
| Phone sign-in | **Confirmed disabled** (`phone_provider_disabled`) |
| C4 blocking I/O | **Confirmed and measured.** Median 1.6 s per authenticated request; 40 concurrent took 61 s (ratio 0.97 of fully serialized) |
| H8 no rejection of non-leaf input | **Confirmed.** A synthetic green image with brown dots was labelled a specific tomato disease at 0.90 confidence |
| N1 (new) | 25 write paths use a call the pinned client lacks. Observed 500 on listing, store, inventory, checkout |
| N2 (new) | 4 of 30 read routes crash on a foreign-key hint that does not exist |
| N3 (new) | Migrations grant the service role nothing, so disease endpoints fail on a fresh database |
| Migrations | 35 of 35 apply cleanly. Role gates and suspension held in every check |

**Roadmap change:** the backend has never been run against a real database. P5 is therefore split:
**P5a Backend repair** runs immediately after P3, so the auth vertical slice (P4) has working
endpoints to build on; the remainder of P5 stays as planned.

**Still open in P0 (needs you):** an emulator or device for the UI-level pass; the two read-only
queries on the hosted project (admin/expert accounts, service-role privileges); testing and
committing the P0 groups (done on branch `chore/p0-p1-standardization`).

---

## 2. Agent operating protocol — "Reality Rules"

These rules are the contract every coding agent works under for every phase. They exist because
green `tsc`/`eslint`/`jest`/`pytest` proved nothing about the auth module. They are enforced
mechanically in CI wherever possible (Phase 1) and by a separate verifier agent everywhere else.

### 2.1 The ten rules

1. **Done means a real path ran.** A task is complete only when the user-visible path works
   end-to-end on the real stack: emulator/device → real FastAPI (uvicorn) → local Supabase
   (Docker, `supabase start`). Type-checks and mocked unit tests are necessary, never sufficient.
2. **No-stub rule.** Production code paths contain no stubs, hard-coded returns,
   `NotImplemented`, empty handlers, "coming soon", or TODOs without a tracked item. If a task
   cannot be finished (blocked on a foreign service, ambiguous requirement), the agent does
   **not** write speculative code — it stops and files an Integration Brief (§2.3).
3. **Mock boundary.** Tests may fake only the outer edge of third-party services that cost money
   or send messages (SMS, email, payments, push), using fixtures recorded from the provider's
   sandbox. Our own auth, service, and repository layers are **never** mocked in integration
   tests. Every faked edge has a matching live/sandbox smoke test (§2.3 step 6).
4. **Evidence in every task.** Each task closes with an Evidence Block: commands run with
   output, test names, screenshots or `adb logcat` excerpts, and — for anything security-related —
   a two-user SQL/HTTP proof (allowed path *and* rejected path). No evidence, not done.
5. **Two-key verification.** The implementer is never the verifier. A separate agent with a fresh
   context (skills: `integration-engineer`, `qa-test-engineer`, `security-engineer`,
   `code-reviewer`) re-runs the acceptance script and actively tries to break it. Its findings
   gate the phase.
6. **Feature Register.** One table (`docs/status/feature-register.md`) lists every user-facing
   capability with status `Working` (with evidence link), `Blocked-on-<service>`, or
   `Not started`. Anything not `Working` is hidden or disabled in the UI behind a capability
   flag — **no dead buttons**.
7. **Mechanical guards, not promises.** CI fails on: unused code (knip, vulture), swallowed
   errors, `any`, `console.*`/`print`, unreferenced TODO/FIXME, "stub/placeholder/not
   implemented" strings outside tests, missing coverage on changed lines, and unpinned or
   vulnerable dependencies. (Configured in Phase 1.)
8. **Scope honesty.** If any part of a task is not done, the agent's final report lists it under
   "Not done / blocked" with the reason. Silently narrowing scope is a protocol violation.
9. **Contract-first across layers.** Backend OpenAPI is the source of truth; the mobile client's
   API types are generated from it and CI fails on drift. A route with no consumer, or a call with
   no route, is a defect.
10. **Standing project rules still apply:** validate every migration in a throwaway Docker
    Postgres first and ask before `supabase db push`; never seed dummy users/listings/orders;
    the user tests before anything is committed; prefer standard libraries over hand-rolled code;
    write meaningful comments on non-obvious/security logic; keep the file layout tidy; keep the
    Field Manual artifact updated as decisions land.

### 2.2 Definition of Done (per task)

- [ ] Acceptance test written first; for bug fixes, seen **failing** before the fix.
- [ ] Real-path proof captured (rule 1) and Evidence Block attached.
- [ ] Tests at the right level: unit/component, plus integration against the real local stack for
      anything crossing a layer.
- [ ] CI mechanical gates green locally (lint, typecheck, tests, knip/vulture, secret scan).
- [ ] Docs updated (feature register, affected `docs/`, an ADR if a decision was made).
- [ ] Verifier agent sign-off recorded.
- [ ] Left uncommitted in the working tree for the user to test and commit.

### 2.3 Integration Gate protocol (foreign services)

Trigger: any task that touches something outside *the repo + local Supabase* — email, SMS, push,
payments, error tracking, hosting, app stores, model-weight storage, DNS/domains.

1. **Detect** — the agent checks the task against the register in §3.
2. **Stop the live part.** Build up to the seam only if the interface is stable; otherwise stop.
3. **Integration Brief** (posted for the user, template below), then ask.
4. **User provisions** the account/keys. Secrets go to GitHub Environments / Supabase secrets /
   local `.env` — never into chat, code, or git.
5. **Implement against the sandbox**, with a contract test built from recorded sandbox fixtures.
6. **Live smoke test** — a scripted end-to-end run against the real (sandbox) service, with
   captured evidence. This is what turns "code exists" into "feature works".
7. **Register** — feature moves to `Working` with the evidence link, or stays `Blocked`.

**Integration Brief template**

```
Service / purpose:            <what and which requirement/BR id it serves>
Options considered:           <2–3, with cost, free-tier limits, Pakistan availability>
Recommendation + why:
What YOU must do:             <create account, verify domain, copy which keys, where to store them>
Env var / secret names:       <exact names, which environment>
Where it is used in code:     <files/modules>
How I prove it locally:       <fake / local substitute>
How I prove it live:          <smoke-test script + expected output>
Failure modes + fallback:     <what the app does when the service is down>
Privacy / cost implications:
```

### 2.4 Who does what (existing project skills)

| Work type | Implementer skill | Verifier skill(s) |
|---|---|---|
| Mobile screens, state, navigation | `senior-react-native-architect` | `qa-test-engineer`, `code-reviewer` |
| UX/visual/a11y | `ui-ux-designer` | `srds-requirements-validator`, `academic-supervisor-reviewer` |
| FastAPI services/endpoints | `fastapi-backend-engineer` | `integration-engineer`, `security-engineer` |
| Migrations, RLS, storage | `postgresql-database-engineer` | `security-engineer` (two-user proofs) |
| Disease model | `ai-ml-engineer` | `qa-test-engineer` |
| CI/CD, hosting, releases | `devops-engineer` | `security-engineer` |
| Docs, ADRs, runbooks | `technical-documentation-writer` | `academic-supervisor-reviewer` |
| Orchestration, phase gates | `zarailink-master-orchestrator` | `senior-software-project-manager` |

### 2.5 Agent Task Card (one per task, kept in the PR/phase notes)

```
Task id / phase:        Objective (one sentence):
Skill(s):               Requirement ids (SRDS / BR-xx):
Files in scope:         Files explicitly OUT of scope:
Acceptance tests (written first):
Integration gate?       yes/no → brief link
Evidence required:      Rollback:
Not done / blocked (filled at the end):
```

---

## 3. Integration Gate Register (foreign services)

Every row is a place an agent must **stop and ask** before writing live-integration code. The
"proves locally" column is what lets agents finish and verify the code *before* the real account
exists, so nothing is blocked longer than necessary.

| # | Service | Needed for | Phase | Options (recommended first) | You provide | Proves locally with |
|---|---|---|---|---|---|---|
| G1 | Custom SMTP | Signup verify, password reset, email OTP | P4 | Resend, Brevo, Amazon SES | Account, verified sending domain (SPF/DKIM), SMTP creds | Supabase local Mailpit (built into `supabase start`) |
| G2 | SMS OTP provider | Phone sign-in/verify (after email works) | P4 (4D) | Local PK aggregator via Send-SMS hook (cheap), Twilio Verify (~$0.05–0.10/verify), or drop phone-as-login | Account + API key, sender id | `[auth.sms.test_otp]` fixed number→code map |
| G3 | Supabase staging project | Safe pre-prod for migrations/auth config | P3, P6 | 2nd free project | Project ref, DB password, access token | Local stack |
| G4 | FastAPI hosting | Staging + prod API | P5, P12 | Google Cloud Run, Render, Koyeb (need a Dockerfile) | Account, region, billing (if any) | `docker compose` |
| G5 | Error tracking | Crash + API error visibility | P5, P7 | Sentry (free: 5k errors/mo) | Org, 2 DSNs (RN, FastAPI), auth token for source maps | DSN empty ⇒ disabled |
| G6 | Push (FCM) | Order/message/consultation push | P10 | Firebase Cloud Messaging HTTP v1 | Firebase project, `google-services.json`, service-account key | Dry-run (`validate_only`) |
| G7 | Payment gateway | Non-COD payments | P10 | JazzCash, Easypaisa, Safepay, PayFast (BR-11: no escrow/wallet) | Merchant sandbox creds, webhook URL, IP allow-list | Recorded sandbox fixtures + signed-webhook replay |
| G8 | Model weight storage | Ship the disease model without bloating git | P3, P9 | GitHub Releases, Hugging Face Hub, or Supabase Storage (checksum-pinned) | Choice + access | Local file |
| G9 | Google Play Console | Internal/closed testing, release | P12, P14 | Play Console (one-time fee); Play App Signing | Account (org vs personal ⇒ 12-tester/14-day rule), upload key | — |
| G10 | Static hosting | Privacy policy + web account-deletion page (Play requires both) | P4, P13 | GitHub Pages, Cloudflare Pages | Repo/domain choice | — |
| G11 | GitHub visibility | Branch protection, secret scanning, CodeQL, free Actions minutes | P3 | **Decided: make the repo public** after the go-public gate (§6.4) | Choose a licence; flip visibility when the gate passes | — |
| G12 | Bot protection (optional) | OTP abuse / SMS pumping | P4 | Cloudflare Turnstile / hCaptcha (native Supabase support) | Site key/secret | — |
| G13 | Expo account + EAS | Release builds, OTA updates, credentials vault | P2, P12 | Expo free plan: 15 Android builds/month (low-priority queue), EAS Update free to 1,000 users | Expo account, `eas init` project, `EXPO_TOKEN` in GitHub secrets | Local `expo prebuild` + Gradle needs no account |

---

## 4. Target standards (decisions and rationale)

### 4.1 Toolchain and platform

| Decision | Choice | Why |
|---|---|---|
| React Native | Stay on 0.86, New Architecture + Hermes V1, Android first | Already current; iOS has no `ios/` folder and is out of scope unless you say otherwise |
| Expo | **Decided: full Expo — Continuous Native Generation (`expo prebuild`) + EAS.** Expo SDK 57 (= RN 0.86). `android/` becomes generated output and leaves git; native settings live in `app.config.ts` + config plugins | RN team recommends a framework; SDK 57 removes the version barrier; upgrades become "bump deps, re-run prebuild". Highest-blast-radius change in the program, so it gets its own phase (P2), a `pre-expo-cng` rollback tag, and a before/after evidence bar (§5, Phase 2). Recorded as ADR-001 |
| Android target | `targetSdk 36` (Play requires it), `minSdk 24`, 16 KB page-size verified, edge-to-edge handled explicitly | `edgeToEdgeEnabled=false` is ignored at API 36 — every screen needs inset handling |
| Node / Python | Node ≥ 22 (already), Python 3.12, **uv** with a lockfile | Reproducible, fast CI |

### 4.2 Auth architecture (the reference vertical slice)

1. Supabase Auth stays the identity provider. **Email + password with 6-digit email OTP** for
   signup verification and password recovery (template uses the token, not the link), so no
   deep-link dependency for the core flows.
2. **Phone (decided: email first, phone next)**: until an SMS provider is chosen (G2), phone is a
   plain profile field. Phone OTP is then added in P4D through the Send-SMS hook, so nothing is
   built against a provider that does not exist yet.
3. **Session storage**: replace plain AsyncStorage with an encrypted adapter (AES key held in the
   Android Keystore via `expo-secure-store`, ciphertext in storage — the pattern Supabase
   documents for React Native); `autoRefreshToken` tied to `AppState`.
4. **Server verification**: migrate the project to JWT signing keys; FastAPI verifies tokens
   locally against the JWKS (PyJWT), not with a `get_user` network call per request. Role is read
   from the database profile, never from client-supplied data; suspension is enforced in both RLS
   and the API.
5. **Role integrity**: users can only self-select buyer/farmer/dealer/expert-applicant; admin is
   DB-assigned; expert privileges require verification. Proven by pgTAP tests.
6. **Admin hardening**: TOTP MFA for admin accounts (free plan supports it); admin write policies
   require `aal2`.
7. **Abuse controls**: Supabase rate limits set as code in `config.toml`; optional Turnstile (G12).
   Plan-limited features (leaked-password check, inactivity timeout are Pro-only) get app-side
   compensations or are documented as accepted gaps.
8. **Account deletion** (Play requirement): in-app flow + public web page; backend endpoint with
   re-authentication that anonymizes retained business records (orders, reviews), deletes storage
   objects, then deletes the auth user.
9. **Config as code**: auth settings (OTP length/expiry, password policy, redirect URLs, rate
   limits, hooks, SMTP) live in `supabase/config.toml` and are pushed with `supabase config push`
   (per-environment overrides), so hosted settings can no longer drift from what the app expects.
10. **Proof without paid services**: locally, email goes to Mailpit and phone uses
    `[auth.sms.test_otp]`; the same E2E test passes locally and (with G1/G2 provisioned) against
    staging.

### 4.3 Security baseline

- **Frameworks**: OWASP MASVS v2 (target L1 everywhere, L2 for STORAGE, AUTH, NETWORK), OWASP API
  Security Top 10 (2023), and a STRIDE threat model for six flows: auth, checkout/payment,
  messaging, disease upload, expert verification, admin actions.
- **Mobile**: release `usesCleartextTraffic=false` with a network security config;
  `allowBackup=false`; R8 minify + shrink; exported-component audit; minimal permissions;
  `FLAG_SECURE` on OTP/payment screens; no secrets in the bundle beyond the public anon key and
  API base URL; certificate pinning intentionally **not** adopted (bricking risk) — recorded in an
  ADR.
- **Backend**: pagination caps, upload validation (size, magic bytes, image-bomb limits), security
  headers, strict CORS, RFC 9457 problem+json error model, request IDs, rate limits keyed by user
  id (authenticated) or IP (anonymous) with a correct trusted-proxy setting, idempotency keys on
  order/payment writes, no PII in logs.
- **Database — new migration template** (mandatory from now on): `create table` + `enable row
  level security` + explicit `GRANT`s per role (required for new tables from 30 Oct 2026) +
  policies using `(select auth.uid())` + index on every policy/FK column + `set search_path` on
  every `SECURITY DEFINER` function + a pgTAP test file. Storage buckets get size limits, MIME
  allow-lists, and path-ownership policies.
- **Supply chain**: lockfiles, Dependabot (npm, pip, gradle, actions), OSV-Scanner + `pip-audit`
  + `npm audit`, SHA-pinned workflow actions, least-privilege `permissions`, SBOM at release.
- **ML**: torch ≥ 2.6 or, better, export to ONNX/safetensors so nothing is ever unpickled; pin
  the weights by SHA-256; weights live outside git history going forward (G8).
- **Privacy**: data inventory mapped to the Play Data Safety form, retention rules, deletion flow,
  PII scrubbing in Sentry `beforeSend`.

### 4.4 Code standards and tooling

| Area | Standard |
|---|---|
| TypeScript | `strict` + `noUncheckedIndexedAccess`; no `any`; ESLint 9 flat config (`eslint-config-expo/flat` + typescript-eslint strict-type-checked + react-hooks + react-native-a11y); layer-boundary rule (screens → hooks → services; no direct Supabase calls in screens); `i18next/no-literal-string` to finish localization; Prettier 3; **knip** for dead code |
| Python | `pyproject.toml` + `uv.lock`; **ruff** (lint + format; rule sets incl. `S`, `B`, `ARG`, `T20`, `ERA`, `ASYNC`, `TD`); **mypy** strict on `app/`; **vulture**; `pydantic-settings`; **structlog**; dev vs prod dependency split (pytest out of prod image) |
| SQL | Migration template (§4.3); `supabase db lint` + Supabase advisors (splinter) + pgTAP in CI |
| Git | Conventional Commits (commit-msg hook via **lefthook**), PR template with an evidence checklist, CODEOWNERS, ADRs in `docs/adr/` |
| Comments | Explain *why*, especially RLS/trigger/business-rule logic; every non-obvious security decision carries a one-line rationale and rule id (BR-xx) |

### 4.5 Test strategy

| Layer | Tool | Gate |
|---|---|---|
| Unit / component | Jest + React Native Testing Library (734 tests exist; audit them for behaviour vs render-smoke, delete tests that only mock themselves) | ≥ 80% lines; ≥ 90% on `services/`, `store/`, auth |
| Network-level FE tests | **MSW** instead of mocking our own service modules | Auth, checkout, payments flows |
| Contract | FastAPI OpenAPI → generated TS client (drift check in CI) + **Schemathesis** against the running API | Zero drift, zero 5xx on fuzz |
| Backend integration | pytest against a **real local Supabase** with real test users created through the auth admin API; auto-generated role × endpoint authorization matrix | ≥ 85%; 100% of authz branches |
| Database | **pgTAP** (`supabase test db`) per table × role × operation; Supabase advisors clean | Every policy has a test |
| E2E | **Maestro** flows on an Android emulator in CI against the local stack: auth per role, browse → checkout, dealer inventory, expert consult, admin moderation, disease predict | Smoke on PR label/main; full nightly |
| Security | gitleaks, Semgrep OSS, OSV-Scanner, ZAP baseline/API scan (nightly, staging), manual MASVS checklist | No high findings |
| Non-functional | k6 baseline load; TalkBack + Accessibility Scanner scripts; cold-start and bundle-size budgets | Budgets recorded in docs |

Test data rule (from your standing no-dummy-data rule): fixtures exist only inside disposable
local containers/CI runs, never in the real projects.

### 4.6 UI/UX standards

- Keep the existing token system and per-role accents as the identity layer; work is behaviour,
  accessibility, and robustness rather than repainting.
- **Accessibility (WCAG 2.2 AA)**: 4.5:1 text contrast, ≥ 48 dp touch targets, TalkBack
  labels/roles/states, logical focus order, font scaling to 200%, reduce-motion respected.
- **Urdu/RTL parity**: full RTL pass (mirrored layouts and icons, Nastaliq line-height clipping,
  numerals, restart handling on language switch), enforced by the no-literal-string lint.
- **Edge-to-edge at API 36**: explicit inset handling on every screen; verified on Android 15 and
  16 emulators.
- **Low-connectivity first** (rural users): NetInfo-aware react-query (`onlineManager`), persisted
  query cache (MMKV or AsyncStorage), image compression before upload, retry with backoff, offline banner, drafts
  for listings/messages; **no** offline checkout.
- **Low-literacy design**: icon-first navigation, plain-language Urdu copy, large targets,
  sunlight-safe contrast; voice input is a stretch item, not a commitment.
- **Performance**: FlashList v2 on long lists, Reanimated 4 for animation, cached images, budgets
  for cold start (< 2 s mid-range device) and bundle size.
- **Validation**: task-based usability test with 5–8 real users and a SUS score, reusable in the
  FYP report.

### 4.7 CI/CD design

- **PR pipeline** (an always-running aggregate job so required checks never hang on path
  filters): frontend (lint, typecheck, jest+coverage, knip, i18n parity, OpenAPI drift), backend
  (ruff, mypy, pytest unit+integration on local Supabase, vulture, pip-audit), database
  (migrations apply, `db lint`, advisors, pgTAP, migration-template checker), security (gitleaks,
  Semgrep, OSV, actionlint + zizmor), Android (`assembleDebug` with Gradle cache; Maestro smoke),
  PR hygiene (conventional title, evidence checklist).
- **Main**: everything above + preview APK artifact + deploy to **staging** (backend +
  `supabase db push` + `config push`) + staging smoke.
- **Release (tag `v*`)**: signed AAB → Play internal track, production backend deploy behind a
  GitHub Environment approval, production migrations only after staging is green, Sentry release
  + source maps, SBOM, generated release notes.
- **Hardening**: default `permissions: {}`, per-job minimum; actions pinned to SHAs and kept
  current by Dependabot; `concurrency` cancel-in-progress; job timeouts; secrets only in
  Environments; never `pull_request_target` with checkout of PR code.
- **Builds**: PR and main builds run `expo prebuild` + Gradle directly on GitHub runners (free and
  unlimited once the repo is public); EAS Build (15 free Android builds/month, slow queue) is
  reserved for signed release builds, with a local-Gradle fallback if the quota runs out.
- **Enforcement**: once the repo is public (G11, gate in §6.4) branch protection/rulesets, secret
  scanning with push protection, and CodeQL are free. **Until then** (Phases 0–3) the gate is
  convention: lefthook hooks, the aggregate CI job, and the PR evidence checklist.

### 4.8 Documentation standard

Real `README`, `CONTRIBUTING`, `SECURITY.md`, `CHANGELOG` (release-please), `docs/adr/`,
`docs/architecture/` (kept in sync by a docs-drift check on PRs touching migrations/routes),
generated API reference, runbooks (deploy, rollback, rotate secrets, restore backup, incident),
threat model + MASVS checklist, compliance pack (privacy policy, Data Safety mapping, account
deletion), test strategy + per-role manual QA scripts, `docs/status/feature-register.md`, and a
`CLAUDE.md`/`AGENTS.md` that embeds §2 so every agent session starts under the protocol. An SRDS
traceability matrix (requirement → endpoint → screen → test id) supports the FYP report.

---

## 5. Phased roadmap

Effort is relative (S ≈ days, M ≈ a week, L ≈ two weeks or more, including time waiting for you to
test). Tier only sets order: **Must** = blocks a safe launch, **Should** = expected of a modern
app, **Could** = stretch. Phases in the same wave touch different folders and can run in
parallel under separate agents.

| Phase | Title | Tier | Effort | Wave | Depends on | Gates |
|---|---|---|---|---|---|---|
| P0 | Baseline and runtime truth | Must | S | 1 | — | — |
| P1 | Agent OS, repo standards, CI gates v1 | Must | M | 1 | P0 | — |
| P2 | Expo CNG migration | Must | L | 1–2 | P0 | G13 (late) |
| P3 | Security emergency fixes + go-public | Must | M | 1–2 | P0, P1 | G3, G8, G11 |
| P5a | Backend repair (added after P0) | Must | M | 2 | P1, P3 | — |
| P4 | Auth vertical slice | Must | L | 2 | P2, P3, P5a | G1, G2 (4D), G12 |
| P5 | Backend standardization | Must | L | 3 | P1, P3, P5a | G4, G5 |
| P6 | Database standardization | Must | M | 3 | P3 | G3 |
| P7 | API contract and frontend data layer | Must | L | 3 | P2, P4 | G5 |
| P8 | UI/UX, accessibility, localization | Should | L | 4 | P7 | — |
| P9 | AI disease advisory, made honest | Should | L | 4 | P5 | G8, data |
| P10 | Push notifications and payments | Should / Could | L | 4 | P4, P5 | G6, G7 |
| P11 | Test suite completion | Must | L | 5 (ongoing) | P4–P10 | — |
| P12 | CI/CD and release engineering | Must | M | 5 (starts in P1) | P2, P5 | G4, G9, G13 |
| P13 | Documentation and compliance | Must | M | 5 (ongoing) | all | G10 |
| P14 | Release readiness and store launch | Must | M | 5 | all | G9 |

**Every phase**: starts from a Task Card (§2.5), follows the Reality Rules (§2), updates the
Feature Register, ends with a verifier pass, and leaves changes uncommitted for you to test.

**Merge order in wave 1–2:** P3 merges first, then P5a (backend and migrations only, so it does
not conflict with P2), then P2 and P4. P3 merges before P2. P3 is small and urgent, and its only frontend
edits (the disease upload/result path, because the API contract changes from a URL to a storage
path) are confined to `diseaseService.ts` and the disease screens. P2 then rebases onto it.

---

### P0 — Baseline and runtime truth  `Must · S`

**Objective:** turn "source-confirmed" into "observed", protect the 152 uncommitted files, and stop
building on unverified ground.

**Skills:** `zarailink-master-orchestrator`, `qa-test-engineer`, `integration-engineer`.

1. **Commit plan for the working tree.** The agent proposes logical groups (i18n retrofit, reset-
   password screen + auth changes, ML model + metadata + tests, docs, Android/config); you test
   and commit each. Nothing is committed by an agent (standing rule).
2. **Stand up the real stack locally**: `supabase start` (Docker), FastAPI under uvicorn, app on an
   Android emulator. Record the exact commands in `docs/setup/` as they are proven.
3. **Reality run** of every flow in §1.1 plus checkout, dealer inventory, consultation, disease
   predict. Output: `docs/status/baseline-2026-09.md` with pass/fail and captured evidence.
4. **Red tests first** for C1 (sign up with forged `role: admin` through the local GoTrue API) and
   C2 (create a disease case with an internal URL). Kept as strict `xfail` so CI stays green and
   flips red the moment a fix lands, forcing the marker's removal.
5. **Feature Register v0** — truthful: email signup `Blocked-on-G1`, phone `Blocked-on-G2`, push
   `Not started`, payment gateway `Not started`, AI `Working-but-limited`.
6. **Quick hygiene** (no logic change): delete `.zl-i18n-verify-tmp/`, add `.gitattributes`
   (`* text=auto eol=lf`) and `.editorconfig`, move `mcp_configurations/` into `docs/tooling/`,
   fix the stale `qa-test-engineer` and `devops-engineer` skill text, refresh comments that
   describe placeholder weights.

**Exit:** baseline report accepted by you; red tests exist for C1 and C2; register published.

**Boundaries.** P0 writes new documents, two expected-failure tests, and small config files. Its
only edits to existing files are two skill descriptions, comments that still describe placeholder
weights, and the removal or move of two stray folders. It changes no application logic,
migrations, dependencies, or CI. It fixes no vulnerability (C1 and C2 stay open until P3). It
commits nothing. It touches only the local stack, never the real Supabase project.
**Needs from you:** Docker Desktop running, an Android emulator or device, and time to test and
commit each group.

---

### P1 — Agent OS, repo standards, CI gates v1  `Must · M`

**Objective:** make the Reality Rules mechanical so later phases cannot regress. Toolchain-
independent items only; the frontend ESLint base is finalized in P2.

**Skills:** `devops-engineer`, `technical-documentation-writer`, `senior-software-project-manager`.

1. `CLAUDE.md` + `AGENTS.md` embedding §2, plus `docs/process/` (Task Card, Integration Brief,
   Definition of Done, verifier checklist).
2. Repo files: real `README`, `CONTRIBUTING`, `SECURITY.md`, `CODEOWNERS`, PR template with the
   evidence checklist, issue templates, `dependabot.yml` (npm, pip, actions), commitlint config.
3. **lefthook** hooks: format/lint staged files, conventional commit message, gitleaks on staged
   diff.
4. **Backend tooling**: `pyproject.toml`, `uv.lock`, ruff, mypy, vulture, pytest-cov, pip-audit;
   dev dependencies split from production ones.
5. **Anti-stub scanner** (`scripts/check-reality.*`, run in CI): fails on `NotImplemented`, "stub /
   placeholder / coming soon" strings outside tests, TODO/FIXME without an issue id, empty
   handlers, `console.*`, `print()`.
6. **Ratchet, not big-bang**: record today's counts (114 `as any`, 39 `console`, 10 empty
   handlers, etc.) as the ceiling; CI fails if any number rises; later phases burn them to zero.
7. **CI v1**: `permissions` blocks, SHA-pinned actions, `concurrency`, timeouts, an always-running
   aggregate job (so required checks never hang on path filters), Gradle/uv/npm caches, coverage
   report (no threshold change yet), gitleaks, Semgrep OSS, OSV-Scanner, actionlint + zizmor.
8. **Prove each gate**: one deliberate-failure PR per gate (as was done for lint/tsc/jest before),
   then revert.

**Exit:** every gate demonstrably fails when it should; a fresh clone follows the README to a
running app.

**Result (2026-09-21):** every gate was proven locally by planting a violation and confirming
rejection: 30 tests for the reality gate itself, plus scratch-repo proofs for hooks, ESLint/knip
ratchets, gitleaks, OSV-Scanner, Semgrep, and the workflow linters. `npm ci`, the app bundle, the
backend `uv sync --frozen`, and the database job's exact steps were run. **Still needs you:** run
`scripts/ci/plant-violations.sh` on a throwaway branch and confirm the same gates go red on GitHub.
Deviations: Gradle cache moved to P2; OSV-Scanner replaces `pip-audit`; hooks install automatically
on `npm ci` (lefthook's standard behaviour); `requirements.txt` removed. New finding: mypy reports
exactly the 25 write-path defects (N1), so a type check alone would have caught them.

---

### P2 — Expo CNG migration  `Must · L`  (`G13` for release builds)

**Objective:** move to Expo SDK 57 with Continuous Native Generation, with **no behaviour change**,
proven by before/after evidence.

**Skills:** `senior-react-native-architect`, `devops-engineer`; verifier `integration-engineer`.

1. Branch `chore/expo-cng`; tag `pre-expo-cng` (rollback point). P0 commits must already exist.
2. Install `expo`; `npx expo-doctor` clean; `babel-preset-expo`, `expo/metro-config`, `jest-expo`.
3. **`app.config.ts`** replacing `app.json`: name, `scheme: zarailink`, package `com.zarailink`,
   `versionCode` derived from the CI run number, `newArchEnabled`, edge-to-edge, automatic
   dark mode, `allowBackup: false`, release cleartext off / debug on (`expo-build-properties`),
   R8 minify + shrink in release, `targetSdk 36`, `minSdk 24`.
4. **Re-express native customizations**: the only uncommitted native edit is the `onNewIntent`
   override for deep links — Expo's template and the OTP-code recovery flow (P4) make it
   unnecessary; the deep-link intent filter becomes `scheme`/`intentFilters` config.
5. **Replace `react-native-config`** with validated `EXPO_PUBLIC_*` variables (zod check at
   startup, fail fast) and per-environment EAS env files. Public values only — never secrets.
6. **Library swaps**: `react-native-haptic-feedback` → `expo-haptics`; `react-native-image-picker`
   → `expo-image-picker`; add `expo-secure-store`, `expo-image`, `expo-image-manipulator`,
   `expo-font`, `expo-localization`, `expo-dev-client`. Keep `react-native-svg`: `lucide-react-native`
   needs it (an earlier note called it unused; knip showed that was wrong). Each swap
   is its own reviewed commit.
7. **ESLint 9 flat** with `eslint-config-expo/flat`, `typescript-eslint` strict, react-native-a11y,
   layer-boundary rule; knip; Prettier 3. Set the ratchet ceilings from P1.
8. `android/` becomes generated: add to `.gitignore`, document `npm run prebuild` and
   `npm run android`.
9. **Evidence bar** (all required): `expo prebuild --clean` reproduces the project; `assembleDebug`
   and `assembleRelease` succeed; merged manifests diffed against the current one (permissions,
   intent filters, `allowBackup`, cleartext all equal or intentionally different); all 133 test
   files pass with a before/after count; app launches on an emulator and each role's login →
   dashboard works; `adb shell am start` deep-link test; Hermes V1 and New Architecture confirmed;
   bundle size compared.
10. CI: `expo prebuild` + Gradle build job with cache; `expo-doctor` step. **G13**: create the Expo
    account, `eas init`, add `EXPO_TOKEN`; produce a first EAS preview build.

**Exit:** merged only after you test it on a device; `pre-expo-cng` tag kept until P4 finishes.

**Result (2026-09-21):** every item of the evidence bar was met on an Android 16 emulator against the local
stack, and `expo-doctor` passes 21 of 21 on a fresh copy of the tree. Details, numbers, and screenshots are in
`docs/status/p2-expo-2026-09.md`. Findings that change later phases:

- Item 4 was right: Expo's generated activity delivers a link tapped in a running app, so the `onNewIntent`
  override is gone. Proven with a control build, after my first tests turned out to be invalid.
- Item 6: the SDK pins several packages *below* what the repo had (gesture-handler, async-storage, screens,
  safe-area-context, svg), and TypeScript 6. The repo now follows the pins. Dependabot ignores them.
- Item 6: the unused packages (`expo-secure-store`, `expo-image`, `expo-image-manipulator`, `expo-font`,
  `expo-localization`) are added by the phase that first uses them (P4, P7, P8), because an unused package raises
  the dead-code ratchet.
- Item 7: ESLint 9 and Expo's config are in, with findings unchanged, and the 55 useful rules that Expo's config
  dropped are restored (jest, React Native, deep imports, shadowing, `eval`, and others). `typescript-eslint`
  strict, a11y, and the layer-boundary rule move to P7 and P8, where their findings are burned down. Prettier 3 is
  installed but not enforced: 263 of 316 files never matched `.prettierrc.js`.
- Item 10: the `android` CI job and Dependabot rules are in. G13 is a written brief, not a provisioned account.
- New for P4: camera capture now needs the CAMERA permission, and a bad reset link shows the user nothing.
- Found by the independent verifier: R8 renames the classes Expo derives JavaScript error codes from, which broke
  the camera-refusal check in release builds only. Fixed, and now a lesson in `AGENTS.md`. Test release builds.
- New for P8: the app must be checked on Android 15 and older, because SDK 57 forces edge-to-edge on.
- New for P12: release builds carry the developer scheme `exp+zarailink://`; Expo's template adds JitPack; the
  release is still signed with the debug key.

---

### P3 — Security emergency fixes and go-public gate  `Must · M`  (`G3`, `G8`, `G11`)

**Objective:** close the exploitable holes before the repository becomes public.

**Skills:** `postgresql-database-engineer`, `fastapi-backend-engineer`, `security-engineer`.

1. **C1 — role escalation.** Migration rewrites `handle_new_user()` with an allow-list
   (`buyer`, `farmer`, `dealer`, `expert`); `admin` is never accepted from metadata. Admin creation
   moves to a documented, service-role-only bootstrap runbook. pgTAP proves: forged admin signup
   → stored as non-admin; normal signups unaffected; role update by non-admin still blocked. The
   P0 red test turns green. Validate in local Docker first, then **ask before `supabase db push`**.
2. **Live forensic check (you, read-only).** List existing profiles with role `admin` or `expert`
   on the real project and confirm each is expected. Rotate anything suspicious.
3. **C2 — SSRF.** Replace the `image_url` request field with a `storage_path` validated against
   `^<user_id>/<safe-name>$` and a fixed bucket; the server reads the object through the Storage
   API, never an arbitrary URL. Cap size (for example 8 MB), verify with Pillow (`verify()`,
   `MAX_IMAGE_PIXELS`), and return uniform errors. Make `disease-images` private with signed URLs.
   Migrate existing rows. Red tests use `http://169.254.169.254/` and `http://localhost` payloads.
4. **C5 — torch.** Pin `torch>=2.6` immediately (full ONNX move is P9). Take `model.pth` out of
   git going forward: weights hosted per **G8**, SHA-256 recorded in `model_metadata.json`,
   fetched by a documented command.
5. **H2 — storage limits.** `file_size_limit` and `allowed_mime_types` on all six buckets; derive
   the stored extension from the validated MIME type, not the client filename.
6. **Go-public gate** — see §6.4. Flip visibility only when every box is ticked, then enable
   branch protection/rulesets (required check = the P1 aggregate job), secret scanning with push
   protection, CodeQL default setup, and Dependabot alerts. Prove it: a direct push to `main`
   must be rejected.

**Exit:** C1 and C2 tests green and mutation-checked (revert the fix, test must fail again); repo
public with protection on.

---

### P4 — Auth vertical slice (reference implementation)  `Must · L`  (`G1`, `G2`, `G12`)

**Objective:** one flow set that works end-to-end on the real stack, proving the protocol for
everything that follows.

**Skills:** `postgresql-database-engineer`, `fastapi-backend-engineer`,
`senior-react-native-architect`, `ui-ux-designer`; verifier `security-engineer` +
`integration-engineer`.

**4A — Server and config**
1. `supabase/config.toml` becomes the source of truth: email templates using `{{ .Token }}`,
   password policy (min 8, letters + digits), OTP length 6 and expiry ≤ 15 min, resend
   frequency 60 s, tightened rate limits, TOTP enabled, redirect URLs. Pushed with
   `supabase config push` (per-environment overrides for staging/prod).
2. Migrate the project to **JWT signing keys**; FastAPI verifies tokens locally against the JWKS
   with PyJWT (cached, refresh on unknown `kid`; checks `aud`, `iss`, `exp`, `alg`), dropping the
   per-request `/auth/v1/user` call. A Supabase outage now returns 503, not 401.
3. Role/suspension resolved from the profile once per request and cached briefly; never trusted
   from the client.
4. **Admin MFA**: build the enrolment screen and recovery-code guidance first, enrol the first
   admin, and only then switch on the `aal2` requirement in admin write policies — enforcing it
   before enrolment would lock every admin out of moderation.
5. **Account deletion**: authenticated endpoint with re-authentication → anonymize retained
   business records (orders, reviews, messages) → delete storage objects → delete auth user;
   audit-logged; plus the public web page (G10).
6. Admin bootstrap runbook (SQL/CLI), documented; no seeded users.

**4B — Mobile**
1. Session storage: AES-encrypted blob in AsyncStorage with the key in `expo-secure-store`
   (Android Keystore); `autoRefreshToken` tied to `AppState`.
2. **Global auth handling** in the API client: 401 → one refresh attempt → sign-out with a clear
   message; 403 suspended → suspended screen; offline → banner, not a logout.
3. Rebuild `VerifyOtpScreen`: 6-digit validation, `oneTimeCode` autofill, paste support, resend
   cooldown with cleanup on unmount, localized mapped errors (no raw server text), accessibility.
4. Password reset via **recovery OTP code** (no deep link, no PKCE dependency); remove the
   custom-scheme handler from `authStore`. After a password change, sign out other sessions.
5. Register screen sends only allowed roles; expert applicants follow the verification path.

**4C — Live proof (G1)**: you create the SMTP account and verified domain (SPF/DKIM); the agent
wires it to **staging**; live smoke test sends a real code to a real inbox.

**4D — Phone OTP (Could, only after G2)**: Send-SMS hook as a signed HTTPS endpoint (Standard
Webhooks verification) in FastAPI or an Edge Function, calling your chosen provider; local proof
with `[auth.sms.test_otp]`; live smoke test on staging; optional Android SMS Retriever autofill.

**Acceptance tests (all automated, real local stack; Mailpit's API supplies the code)**
AT1 register → code → verify → correct non-admin role · AT2 forged-admin signup stays non-admin ·
AT3 wrong, expired, replayed codes rejected and rate-limited · AT4 suspended user blocked in API,
RLS, and UI · AT5 reset flow, old sessions revoked · AT6 tampered, expired, wrong-audience and
`alg=none` tokens rejected by FastAPI; key rotation handled · AT7 stored session is ciphertext ·
AT8 admin without `aal2` cannot write · AT9 account deletion removes or anonymizes everything ·
AT10 Maestro: register → verify → dashboard for buyer, farmer, dealer; login/logout; reset ·
AT11 live email smoke on staging.

**Exit:** Feature Register shows auth `Working` with links to all evidence; verifier's attempts to
break it (escalation, brute force, replay, tampering) all fail.

---

### P5a — Backend repair  `Must · M`  (added after P0)

**Objective:** make every backend endpoint work against a real database, and prove it in CI, before
anything is built on top. P0 showed that 25 write paths, 4 read routes, and every service-role call
on a fresh database fail, and that no existing test can see it.

**Skills:** `fastapi-backend-engineer`, `postgresql-database-engineer`; verifier
`integration-engineer`, `qa-test-engineer`.

1. **Real-database smoke matrix first.** Generate one test per OpenAPI operation (116) that calls
   it with the right role against the local Supabase stack: create/update endpoints must return 2xx
   and persist, reads must return 2xx, invalid input must return 4xx. Start with these tests
   failing; they define "done". This is the seed of the P5 integration suite.
2. **N1: the 25 write-then-select chains.** Replace them with the supported pattern for the pinned
   client (the write call returns the row), or upgrade the client and verify the new behaviour with
   the matrix. Do not change repository signatures. Decide by test, not by assumption.
3. **N2: the four crashing reads.** Fix the embedded relationship (`consultations` to the expert's
   profile): correct the hint to a relationship that exists, or add the missing foreign key by
   migration if the design requires it (validated in Docker first, ask before pushing).
4. **N3: service-role privileges.** A migration grants the service role exactly what the backend
   needs, or the backend stops using the service role where RLS already allows the user's own
   access. The disease flow must pass on a database built only from migrations.
5. **Flows that were blocked by N1**: run and record checkout with the delivery split (BR-09), the
   order lifecycle and stale-order expiry, payments, reviews, dealer stock reduction and oversell
   rejection (BR-03/04), consultations. Update the Feature Register row by row.
6. Add the matrix to CI as a job that starts local Supabase (the migration-lint job already does).

**Exit:** the matrix is green in CI with zero 5xx; the Feature Register shows every backend
capability as `Works (API)` or explicitly `Blocked`; a database built only from migrations passes
the disease flow.

---

### P5 — Backend standardization  `Must · L`  (`G4`, `G5`)

**Skills:** `fastapi-backend-engineer`; verifier `integration-engineer`, `security-engineer`.

1. **Dependencies**: FastAPI 0.141.x, pydantic 2.13.x, supabase-py current, uvicorn, httpx;
   `uv.lock`; production vs dev split.
2. **Async correctness (C4)**: benchmark two designs with k6 and record an ADR — (a) sync handlers
   run in the threadpool with a shared HTTP pool, or (b) async client on a shared `httpx` pool.
   Requirement either way: no blocking call on the event loop, no per-request client construction.
   Inference moves to a threadpool or worker.
3. **Config**: `pydantic-settings` with fail-fast validation (empty URL/keys refuse to boot),
   `lru_cache`d dependency, model loading moved into the FastAPI lifespan.
4. **HTTP hardening**: request-ID middleware, structlog JSON logs, RFC 9457 problem+json
   handlers, security headers, strict CORS methods/headers, docs disabled outside development,
   trusted-proxy configuration, rate-limit key = user id when authenticated else client IP,
   request body size limit.
5. **Pagination** on every list endpoint (limit ≤ 100, offset/cursor, `next` link) — 14 of 15
   modules currently take no pagination parameters.
6. **Idempotency**: `Idempotency-Key` on order and payment creation (unique per user + key,
   response replay, TTL).
7. **Service-role audit**: remove the four disease-repository uses if RLS can serve them;
   otherwise keep with a documented exception and tests.
8. **Health**: liveness and readiness (Supabase reachable), build/version endpoint.
9. **Container**: multi-stage Dockerfile, non-root, healthcheck, `.dockerignore`, compose file
   that joins the Supabase local network.
10. **Tests**: integration suite against real local Supabase (users created through the auth
    admin API); auto-generated role × route authorization matrix from the OpenAPI document (115
    routes × 5 roles + anonymous); every admin mutation asserted to write an audit-log row
    (BR-15); mock-only tests kept only for pure logic. Coverage ≥ 85%.
11. **Observability** (G5): Sentry SDK with PII scrubbing, request IDs propagated to logs.

**Exit:** k6 shows concurrent requests no longer serialize; authorization matrix green; Docker
image builds and passes the readiness check.

---

### P6 — Database standardization  `Must · M`  (`G3`)

**Skills:** `postgresql-database-engineer`; verifier `security-engineer`.

1. Rewrite the 206 bare `auth.uid()` references to `(select auth.uid())`; same for `is_admin()`
   style helpers; before/after `EXPLAIN` on the hottest tables.
2. Supabase advisors (splinter) run against the local DB in CI; fix all security findings and
   the missing-index / duplicate-policy performance findings.
3. **pgTAP suite**: every policy × role × operation (126 policies), storage policies, `SECURITY
   DEFINER` functions, triggers, generated columns. Uses Supabase test helpers.
4. Migration template + checker script in CI (RLS on, explicit GRANTs, `search_path` on definer
   functions, index on policy/FK columns, a paired pgTAP file) — required for new tables from
   30 Oct 2026.
5. Realtime: confirm RLS governs `messages`, `notifications`, `consultation_messages` changes;
   private channels if any broadcast is used.
6. Backups: the free plan has none — nightly encrypted `pg_dump` from a scheduled workflow to
   private storage (artifacts on a public repo are readable by anyone, so never store an
   unencrypted dump there); documented restore drill.
7. Generated `docs/database/schema.md` from the live schema, replacing hand maintenance.

**Exit:** advisors clean, pgTAP green in CI, restore drill completed once.

---

### P7 — API contract and frontend data layer  `Must · L`  (`G5`)

**Skills:** `senior-react-native-architect`, `integration-engineer`.

1. FastAPI exports OpenAPI in CI; TypeScript client and types generated (`@hey-api/openapi-ts`),
   committed, with a drift check. Schemathesis runs against the local API.
2. **`apiFetch` rewrite**: timeouts via `AbortController`, bounded retries for idempotent GETs,
   the P4 auth handling, error taxonomy (network / auth / validation / server), stable error
   codes mapped to localized messages, request IDs surfaced in Sentry breadcrumbs.
3. **React Query everywhere**: query-key factory, hooks per domain in `src/hooks/api/`,
   `onlineManager` + `focusManager` wired to NetInfo/AppState, persisted cache for safe reads,
   optimistic updates only where idempotent. Migrate the 57 hand-rolled screens domain by domain
   (marketplace → orders → dealer → farmer → expert → admin → rest); delete the per-screen
   loading/error/retry boilerplate as each moves.
4. Layer-boundary lint: screens → hooks → services; no direct Supabase calls in screens.
5. **Resilience**: ErrorBoundary at root and per navigator, Sentry (RN) with source maps,
   offline banner, image compression + EXIF strip before upload (`expo-image-manipulator`,
   max ~1600 px, quality ~0.8).
6. Type debt: burn `as any` from 114 to 0 using generated types; `noUncheckedIndexedAccess` on.
7. Lists: migrate the 26 `FlatList` files to FlashList v2.

**Exit:** ratchet counters at zero for `as any`/`console`/empty handlers; client drift check
green; airplane-mode test script passes (reads from cache, writes fail clearly, no logout).

---

### P8 — UI/UX, accessibility, localization  `Should · L`

**Skills:** `ui-ux-designer`, `senior-react-native-architect`; verifier `srds-requirements-
validator`, `academic-supervisor-reviewer`.

1. **Per-role UX review**: information architecture, navigation depth, empty/error/loading
   patterns, forms; written findings first, then fixes.
2. **Edge-to-edge (M7)**: inset handling on every screen, verified on Android 15 and 16
   emulators.
3. **Accessibility (WCAG 2.2 AA)**: labels/roles/states, ≥ 48 dp targets, contrast audit of the
   token set, font scaling to 200%, reduce-motion; TalkBack script per role; Accessibility
   Scanner run; lint rule enforced.
4. **Urdu/RTL (M3)**: `I18nManager` handling with a reload on language change, bundled Urdu font
   via `expo-font` (Nastaliq or Naskh, chosen after a line-height/clipping test), mirrored icons,
   numerals, plurals, and `i18next/no-literal-string` lint; close the 4-key gap; translate the 41
   untranslated components; `SellerDashboard` check.
5. **Low-literacy and low-bandwidth design**: icon-first navigation, plain-language Urdu copy,
   illustrated empty states, retake-photo guidance for disease capture; voice input is a stretch.
6. Motion with Reanimated 4 (replace the 5 `Animated` files); dark-mode QA.
7. **Usability test**: task-based, 5–8 real users (farmers, dealers, buyers), SUS score, findings
   fed back and reused in the FYP report.

**Exit:** a11y and RTL scripts pass; SUS results documented.

---

### P9 — AI disease advisory, made honest  `Should · L`  (`G8`, data)

**Skills:** `ai-ml-engineer`, `fastapi-backend-engineer`; verifier `qa-test-engineer`.

1. **Scope decision (H8)**: current model is PlantVillage-only. Decide the supported crops
   (candidates: wheat, rice, cotton, sugarcane, maize, potato, tomato, citrus) and state
   unsupported crops plainly in the app.
2. **Data plan** (long lead — start in week 1): sources with licences for wheat/rice/cotton/
   sugarcane, PlantDoc for field-condition images, field collection with expert labelling;
   provenance recorded per image.
3. **Evaluation that can fail**: leakage-safe splits (by plant/source, not by random image),
   a separate field-photo test set, per-class metrics, confusion matrix, calibration
   (temperature scaling). Report field accuracy, not the 99.8% lab number.
4. **Out-of-distribution rejection**: "not a plant leaf / unsure" path (extra class or energy/
   entropy threshold), top-3 predictions, low-confidence → "consult an expert" (BR-13).
5. **Serving**: export to ONNX and serve with ONNX Runtime on CPU (drops full PyTorch from the
   image); preprocessing parity tests, golden-image regression tests, latency budget; inference
   off the event loop.
6. Model registry: versioned artefacts, SHA-256 pinning, model card (data, metrics, limits).
7. **App UX**: retake guidance, crop-mismatch warning, disclaimer kept visible, Urdu advisory
   text; optional expert-validated feedback loop as a stretch.

**Exit:** model card published; field-set accuracy reported honestly; OOD test images rejected.

---

### P10 — Push notifications and payments  `Should / Could · L`  (`G6`, `G7`)

**10A Push (FCM).** `device_tokens` table + RLS; register on login, remove on logout; backend
sender via FCM HTTP v1 (legacy API is gone) with token cleanup on `UNREGISTERED`; Android 13
`POST_NOTIFICATIONS` prompt with a rationale screen; channels; tap → route; trigger from the
existing notifications inserts. Local proof with `validate_only`; live smoke on a physical device.

**10B Payments gateway.** *Start merchant onboarding now — Pakistani gateways can take weeks.*
You choose among JazzCash, Easypaisa, Safepay, PayFast at G7. Then: provider adapter behind the
existing abstraction; hosted checkout/redirect so no card data touches our servers; signed
webhook endpoint with replay protection and idempotency; payment state machine; reconciliation
job; refund/dispute path; **BR-11 preserved: no escrow, no wallet, no held funds**. Sandbox
fixtures for contract tests; live sandbox smoke test.

**Exit:** each feature moves to `Working` only with a recorded live smoke test; otherwise it stays
`Blocked` and hidden.

---

### P11 — Test suite completion  `Must · L` (runs alongside every phase)

1. Frontend: audit the 734 tests; rewrite over-mocked ones onto MSW; delete tests that only assert
   on their own mocks; coverage ratchet to ≥ 80% (≥ 90% on `services/`, `store/`, auth).
2. Backend: integration + authz matrix (P5); Schemathesis; k6 baseline for the top 10 endpoints.
3. Database: pgTAP complete (P6).
4. **E2E (Maestro)** on an emulator in CI: auth per role, browse → checkout with delivery line
   (BR-09), dealer inventory (BR-03/04), expert consultation, admin moderation with audit log
   (BR-15), disease predict (BR-13). Smoke on every PR to `main`; full run nightly.
5. Security: ZAP API scan nightly against staging, MASVS checklist run and recorded, abuse-case
   suite (escalation, SSRF, IDOR, replay, rate-limit bypass), dependency audits.
6. Non-functional: cold-start, bundle size, and list-scroll budgets; 3G throttling run; low-end
   device run; accessibility script results.
7. Test documentation: strategy, per-role manual QA scripts, fixture policy (no data outside
   disposable containers).

**Exit:** thresholds enforced in CI; nightly suite green for a week.

---

### P12 — CI/CD and release engineering  `Must · M`  (`G4`, `G9`, `G13`)

1. Pipelines per §4.7: PR, main (deploys **staging** and pushes migrations + config there),
   release tags (signed AAB → Play internal track, production backend behind an environment
   approval, production migrations only after staging is green).
2. Signing: Play App Signing with an upload key held in GitHub Environment secrets or EAS
   credentials; `versionCode` from the run number; SBOM (CycloneDX) attached to releases.
3. OTA: EAS Update channels `staging` and `production` with a runtime-version policy; documented
   rule for what may ship over the air.
4. Backend deploy: OIDC to the host (no long-lived cloud keys) or a deploy hook; rollback command
   documented and rehearsed.
5. release-please for changelog and versions; branch protection required checks finalized.
6. **Minimum-supported-app-version** check served by the API, so an old client cannot call a
   changed contract.

**Exit:** a tagged release goes from commit to Play internal testing without a manual step other
than approvals; one rollback rehearsed.

---

### P13 — Documentation and compliance  `Must · M` (continuous)

**Skills:** `technical-documentation-writer`; verifier `academic-supervisor-reviewer`.

1. Docs per §4.8, including ADRs for every decision in this plan (Expo, auth design, pgTAP,
   no certificate pinning, async design, hosting).
2. Threat model (STRIDE, six flows) and MASVS checklist with evidence links.
3. **Compliance pack**: privacy policy, Data Safety mapping, account-deletion page (G10), data
   retention table, consent copy.
4. Runbooks: deploy, rollback, rotate secrets, admin bootstrap, restore backup, incident.
5. SRDS traceability matrix (requirement → endpoint → screen → test id) and FYP report alignment
   (`report.md` rewritten from verified facts only).
6. Docs-drift check in CI: PRs touching migrations or routes must touch the matching doc.

---

### P14 — Release readiness and store launch  `Must · M`  (`G9`)

1. Play Console: app registration, Urdu + English listing, content rating, Data Safety, target
   API 36 verified, **16 KB page-size check** on the release build, Play App Signing.
2. Testing: a personal account created after Nov 2023 needs a closed test with **12 testers for 14
   days** before production access — schedule this early (organization accounts are exempt).
3. Pre-launch report, ANR/crash budget, staged rollout, Sentry and uptime alerts, support address.
4. Final security review (MASVS L1 + L2 subset) and a last verifier pass over the Feature
   Register against a fresh install on a real device.
5. Post-launch: dependency update cadence, quarterly key rotation, restore drill schedule.

---

## 6. Cross-cutting

### 6.1 Environments

| | Local | Staging | Production |
|---|---|---|---|
| Supabase | `supabase start` (Docker) | second free project | existing project |
| API | uvicorn / compose | container host (G4) | container host (G4) |
| App | dev client on emulator | EAS preview APK + `staging` OTA channel | Play track + `production` channel |
| Email / SMS | Mailpit / `test_otp` | real SMTP (G1) / real SMS (G2) | same as staging |
| Data | disposable fixtures only | real accounts you create | real users |
| Secrets | `.env` (ignored) | GitHub Environment | GitHub Environment |

### 6.2 Working agreement (agents + you)

Agent works on a phase branch and leaves changes **uncommitted** → verifier agent re-checks →
you test on the emulator/device → you commit → PR → CI → merge → Field Manual artifact updated.
Any Integration Gate pauses that task (not the whole phase) until you answer the brief.

### 6.3 Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Expo CNG migration breaks a native behaviour | Lost days, unstable base | Own phase, rollback tag, evidence bar, merge only after your device test |
| Going public exposes known weaknesses | Faster exploitation | Go-public gate is after P3 and requires sanitized docs |
| Supabase free project pauses after 7 idle days, no backups | Outage, data loss | Keep-alive from staging monitor, nightly encrypted dump, or upgrade before launch |
| EAS free queue (15 Android builds/month, slow) | Blocked releases | PR/main builds run locally in CI; EAS only for releases |
| SMS and gateway lead times | Blocked phases | Start onboarding in week 1 (§6.5) |
| No labelled data for Pakistani crops | AI stays limited | Data plan in P9; honest scope and UI copy |
| Free-tier quotas (Sentry 5k errors, EAS Update 1,000 users) | Lost visibility | Sampling and alerts on quota use |
| Agent drift back to stubs | Regression of the original problem | Reality Rules + mechanical CI guards + verifier |
| Solo bandwidth | Slipped waves | Tiering; waves can slip without breaking dependencies |

### 6.4 Go-public gate (all required before flipping visibility)

- [ ] C1 and C2 fixed, tested, and (for C1) the live-project account check done
- [ ] `gitleaks` full-history scan clean; any finding rotated
- [ ] Internal notes reviewed: `report.md`, `implementation plan.md`, `docs/`, `.claude/` —
      anything that documents an unfixed weakness removed or rewritten
- [ ] Project reference removed from `.mcp.json` (ship a `.mcp.json.example`)
- [ ] Licence chosen and added (Apache-2.0 or MIT recommended; **check your university's FYP IP
      rule first** — a public repo without a licence is "all rights reserved")
- [ ] `SECURITY.md` with a reporting address; README accurate
- [ ] P1 CI gates green on `main`
- [ ] After flipping: branch protection + required checks, secret scanning push protection,
      CodeQL, Dependabot alerts enabled; direct push to `main` proven rejected

### 6.5 Long-lead items to start in week 1

Payment-gateway merchant onboarding · SMS aggregator account and sender-id registration · a domain
(SPF/DKIM for email, hosting for the privacy and deletion pages) · Play Console account and tester
recruitment · crop-disease image sourcing and field collection for Pakistani crops · Expo account.

---

## 7. Verification — how we know the work is real

**Per phase:** exit criteria above, an Evidence Block per task, verifier sign-off, Feature Register
updated, ratchet counters not increased, your device test.

**Reality audit (run at the end of every wave):** a script (`scripts/verify-reality`) brings up the
local stack, runs backend integration + pgTAP + Maestro smoke, and cross-checks the Feature
Register — every `Working` row must link to evidence produced in the last run, and no route in
OpenAPI may lack a consumer or a test.

**Release-candidate gate (P14):** fresh install on a physical Android device; every role's core
path walked; auth live smoke on staging passes; MASVS checklist recorded; advisors clean; pgTAP,
integration, Maestro, k6 baseline, ZAP scan all green; Field Manual and Feature Register agree.

**Checks specific to this plan's central concern (auth):** the AT1–AT11 suite in P4 must pass
against the real local stack *and* the live staging smoke test. If either fails, auth is not
`Working`, regardless of unit-test status.

---

## 8. Decisions

**Made:** full Expo (CNG + EAS) · email first, phone next · repo public · full 12+ week program.

**Still open (defaults shown; each is asked at its gate, not now):**

| Decision | Default | Asked in |
|---|---|---|
| SMS provider (local aggregator via Send-SMS hook vs Twilio Verify) | Local aggregator (cheaper) | P4D |
| API hosting (Cloud Run, Render, Koyeb) | Cloud Run (scale-to-zero; needs billing account) or Koyeb if you want no card | P2/P12 |
| Payment gateway | Your choice among JazzCash, Easypaisa, Safepay, PayFast | P10B |
| Supported crops for the AI model | Wheat, rice, cotton, sugarcane, maize, potato, tomato | P9 |
| Licence | Apache-2.0 | P3 gate |
| Play account type (personal vs organization) | Personal (12-tester rule applies) | P14 |
| iOS | Out of scope; Expo keeps it possible later | — |

## 9. First actions on approval

1. Republish the Field Manual artifact with this plan (standing rule: it is the plan of record);
   the local plan file alone is not enough.
2. P0: propose the commit groups for the 152-file working tree; start the local stack; run the
   reality baseline; write the C1/C2 red tests.
3. Start the long-lead items in §6.5.
4. P1 in parallel: `CLAUDE.md`/`AGENTS.md`, repo standards files, CI v1.
5. Save to memory (blocked while planning): the four decisions in §8, the standing rule that
   agents must stop and ask before any foreign-service integration and must prove a real path
   before calling work done, and the plan's location.
