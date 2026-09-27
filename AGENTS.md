# AGENTS.md: rules for AI coding agents

These rules apply to every AI agent working in this repository (Claude Code, Codex, Cursor, and any other).
They exist because earlier agent work shipped code that looked finished but did not work, and every green
check passed anyway. The auth module is the worked example: the sign-up code screen was built and unit-tested,
but no email server or SMS provider was ever configured and every test mocked the service, so a real user
could never verify an account.

Read first, every session:

| File | Why |
|---|---|
| [`docs/status/feature-register.md`](docs/status/feature-register.md) | What actually works. Never assume a feature works without checking it |
| [`docs/status/baseline-2026-09.md`](docs/status/baseline-2026-09.md) | Observed failures and how they were found |
| [`docs/srds.md`](docs/srds.md) | The requirements baseline (SRDS): roles, approval, inventory boundary, sync, AI, directory layout |
| [`docs/plan.md`](docs/plan.md) | The phased plan built from the SRDS: what to build next, open decisions, what is out of scope. It replaces `docs/process/standardization-plan.md` (kept for history) |

## The ten rules

1. **Done means a real path ran.** A task is complete only when the user-visible path works end to end on the
   real stack: emulator or device, then real FastAPI, then local Supabase in Docker (`npx supabase start`).
   Type checks and mocked unit tests are necessary, never sufficient.
2. **No stubs.** Production code contains no stubs, hard-coded returns, `NotImplemented`, empty handlers,
   "coming soon", or TODOs without an issue number. If a task cannot be finished, do not write speculative
   code: stop and file an Integration Brief (below).
3. **Mock only the outer edge.** Fake third-party services that cost money or send messages (SMS, email,
   payments, push), using fixtures recorded from the provider's sandbox. Never mock our own auth, service, or
   repository layers in an integration test, and pair every fake with a live sandbox smoke test.
4. **Evidence in every task.** Close with commands run, their output, and test names. For anything security
   related, show a two-user proof: the allowed path and the rejected path.
5. **Two-key verification.** The agent that implements never signs off its own work. A separate agent with
   fresh context re-runs the acceptance script and tries to break it ([verifier checklist](docs/process/verifier-checklist.md)).
6. **Keep the feature register truthful.** Update it in the same change that changes a capability. Anything not
   proven working is hidden or disabled in the UI behind a capability flag, never shipped as a dead button.
7. **The mechanical gates are not negotiable.** `python scripts/check_reality.py` (and the tool ratchets) must
   pass. Do not raise a recorded count, add a suppression, or edit the baseline to make it pass.
8. **Say what you did not do.** End every task with "Not done / blocked" and the reason. Silently narrowing
   scope is a violation.
9. **Contract first.** The backend OpenAPI document is the source of truth for the API. A route with no
   consumer, or a call with no route, is a defect.
10. **Standing project rules** (below) still apply.

## Stop and ask before any outside service

Trigger: a task touches anything beyond this repository and the local Supabase stack: email, SMS, push,
payments, error tracking, hosting, app stores, model-weight storage, domains, or a new external API.

1. Build up to the seam only if its interface is stable. Otherwise stop.
2. Write an [Integration Brief](docs/process/integration-brief.md) and ask the maintainer.
3. The maintainer creates the account and keys. Secrets go to GitHub Environments, Supabase secrets, or a local
   `.env`, never into chat, code, or git.
4. Implement against the provider's sandbox, then run a live smoke test and attach its output.
5. Only then mark the feature `Works`. Until then it stays `Blocked` in the register and hidden in the app.

## Standing project rules

- **Migrations:** validate every migration in the local Docker stack first (`supabase db reset`, then exercise
  the policies as two different users). Ask the maintainer before any `supabase db push` to the real project.
  Every new table needs explicit `GRANT`s, row-level security, indexes on policy and foreign-key columns,
  `(select auth.uid())` in policies, and `set search_path` on every `SECURITY DEFINER` function.
- **Hosted project changes:** agents may read the hosted Supabase project freely, but every write needs the
  maintainer's approval in that moment. Schema reaches it only as a migration file validated locally and
  `npx supabase db push`; Auth settings only through `supabase/config.toml` and `npx supabase config push`; never
  through ad-hoc SQL or an MCP `apply_migration`, so the repository stays the record of what the database is.
- **Supabase holds data and files; Git holds code.** Application data lives in Supabase PostgreSQL, application
  files (images, documents, the trained model, exports) in Supabase Storage. Never commit, or attach to a GitHub
  release, model weights, datasets, exports, backups or uploads (SRDS §45–§46). The model is fetched from the
  private `ml-models` bucket by `scripts/fetch_model_weights.py`.
- **Parallel lanes.** Plan phases are split into lanes, each owned by one agent in `.claude/agents/` with a fixed
  set of folders (`docs/plan.md` §3). Edit only your lane's folders; send anything else to the owning lane. Only
  `zl-db` writes migrations; only `zl-backend-core` regenerates the OpenAPI document and the client.
- **No dummy data:** never insert fake users, listings, orders, or other user content into a real project.
  Disposable fixtures inside the local stack or a test run are fine. `seed.sql` is admin-curated reference data only.
- **Do not commit or stage.** Leave changes in the working tree for the maintainer to test and commit, unless
  told otherwise in that moment.
- **Do not touch git configuration or hooks** in the maintainer's repository, and do not run destructive git
  commands. Experiment in a throwaway repository under the scratch directory, and check the working directory
  before any command that changes state.
- **Libraries over hand-rolled code.** Use the established package (for example `libphonenumber-js`,
  `date-fns`, `Intl.NumberFormat`, `ruff`) instead of writing your own parser or formatter.
- **Comments explain why,** especially for RLS, triggers, and business rules (cite the rule, for example BR-09).
- **Tidy layout:** follow the existing folder conventions, leave no scratch files, and do not add a second
  pattern where one already exists.
- **Business rules that must never regress:** BR-09 delivery charge is its own line; BR-10 no logistics
  entities; BR-11 no escrow, wallet, or held funds; BR-03/04 dealer inventory is dealer-only; BR-13 AI results
  are advisory and route to an expert; BR-15 every admin action is audit-logged.

## Commands

| | |
|---|---|
| Local stack | `npx supabase start`, `npx supabase status -o env`, `npx supabase db reset`, `npx supabase stop` |
| Backend | `cd backend && uv sync --frozen && uv run uvicorn app.main:app --reload --port 8000` |
| App checks | `npm run lint`, `npm run typecheck`, `npm test`, `npm run doctor` (Expo project checks) |
| Run the app | `npm run android` (generates `android/`, builds, installs on the emulator, starts Metro), then `npm start` |
| Native project | `npm run prebuild` regenerates `android/` from `app.config.ts`; `npm run prebuild:clean` starts it over |
| Backend checks | `cd backend && uv run pytest` |
| Database checks | `npx supabase test db` (pgTAP), `python scripts/ci/check_advisors.py`, `python scripts/check_migrations.py`, `python scripts/gen_schema_docs.py --check` |
| Reality gate | `python scripts/check_reality.py --tools knip` and `cd backend && uv run python ../scripts/check_reality.py --tools ruff,ruff-format,mypy` |
| Real-stack tests | see `docs/setup/DEVELOPMENT_SETUP.md` |

Run the backend from `backend/`, not the repository root, or it loads the wrong `.env`. Run `npm` with
`LEFTHOOK=0` in the maintainer's repository: an install otherwise writes git hooks, which the rule above forbids.

## Where things go

`app.config.ts` holds every native Android setting: permissions, SDK levels, plugins. `android/` is
**generated output, git-ignored, never edited**: the next prebuild erases the edit.
Today: `src/screens/<role or domain>/`, `src/components/{ui,features/<domain>}/`, `src/services/modules/<domain>/`,
`src/store/`, `src/types/<domain>.ts`, `src/constants/` (shared display labels);
`backend/app/{api/v1/endpoints,services,repositories,schemas,core,ml}/`. Plan A phase A1 moves everything to the
SRDS module layout (`docs/plan.md` §2): `frontend/` and `backend/app/` with `admin`, `farmer`, `dealer`, `buyer`,
`expert`, `ai`, `inventory`, `common` (shared features and utilities) and the core folders; new code written before
A1 follows today's layout. `supabase/migrations/` (timestamped, never edited after being pushed);
`docs/{architecture,database,setup,process,status}/`; the plans are `docs/plan*.md`.

## Learned the hard way

- The pinned `supabase-py` write builders have no `.select()`, so `insert(...).select()` crashes at runtime
  while mocked tests pass. `mypy` catches it; its error count is a ratchet that may only fall.
- `service_role` gets no table privileges from the migrations. A call that works on the hosted project can fail
  on a fresh database. Test against a database built only from migrations.
- Handlers are `async` but the database client is synchronous, so a slow call stalls every request.
- lefthook wraps `run:` blocks in `sh -c "..."`; a double quote inside one is truncated on Windows.
- Line endings are LF everywhere (`.gitattributes`).
- Each Expo SDK pins exact versions of React Native and several native libraries. Bumping one alone breaks the
  build; `npx expo install --check` lists the mismatches and `--fix` applies them. Dependabot ignores them.
- Expo replaces only the literal `process.env.EXPO_PUBLIC_NAME`. Destructuring or computed access reads
  `undefined` on the device. `src/config/env.ts` is the one place that reads them and validates the result.
- To test a deep link, run the real flow: request the reset in the app, read the email from the local mail
  catcher, open its link. A made-up `?code=` proves nothing: with no stored PKCE verifier, supabase-js rejects it
  locally, so the app shows nothing and the server sees nothing, whether or not the link was delivered.
- JavaScript `console` output does not reach `adb logcat` in this React Native version, in debug or release.
  Prove app behaviour by what the screen shows, by gateway or backend logs, or through React Native DevTools.
- `adb shell`, `cmd //c`, and `sleep` all misbehave under Git Bash on Windows. A command that prints only a
  shell banner and exits 0 ran nothing. Read the actual output; never trust the exit code alone.
- Jest runs as Android. Testing Library treats only iOS's `RCTSwitch` as accessible by default, so an
  Android `Switch` needs an explicit `accessible` prop and label to be found by role.
- Test the release build, not only debug. R8 renames classes in release, and Expo derives the JavaScript error
  code of a native error from its class name, so a check like `error.code === 'ERR_USER_REJECTED_PERMISSIONS'`
  passes in debug and fails in release. `app.config.ts` keeps those names; prefer a plain result over a code.
- When you swap a lint config, diff the active rules (`eslint --print-config`) before and after. Unchanged findings
  do not mean unchanged checks: a rule that is switched off finds nothing.
