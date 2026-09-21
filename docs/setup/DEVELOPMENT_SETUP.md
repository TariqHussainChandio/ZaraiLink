# ZaraiLink Development Setup

The README has the short version. This is the full guide for a Windows, macOS, or Linux machine. Every
command below was run against the current tree.

## Requirements

| Tool | Why | Notes |
|---|---|---|
| Node.js 22.11 or newer | App tooling | `engines` in `package.json` |
| Python 3.12 | Backend and quality gates | The gates in `scripts/` use only the standard library |
| [uv](https://docs.astral.sh/uv/) | Backend dependencies | Reads `backend/uv.lock`; installs Python 3.12 itself if missing |
| Docker Desktop | Local Supabase | Must be running before `supabase start` |
| Supabase CLI | Local stack | Installed by `npm ci` (`npx supabase`) |
| JDK 17, Android Studio, Android SDK | Building and running the app | Only needed to run the app, not the API or tests |
| Git | | |
| gitleaks (optional) | Secret scan in the local git hook | CI scans regardless |

## 1. Install app dependencies

```bash
git clone https://github.com/TariqHussainChandio/ZaraiLink.git
cd ZaraiLink
npm ci
```

`npm ci` also installs fast git hooks (lefthook's postinstall step; CI skips it). Before each commit they
check staged files with the reality gate and ESLint, scan the staged diff for secrets if `gitleaks` is
installed, and check the commit message against Conventional Commits. Skip a single commit with
`LEFTHOOK=0 git commit ...`, remove the hooks with `npx lefthook uninstall`, and put them back with
`npm run hooks:install`.

## 2. Local Supabase

```bash
npx supabase start        # first run pulls images; applies all migrations and supabase/seed.sql
npx supabase status -o env
```

`status` prints `API_URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY`. These are the public demo keys for a
local stack. They only work against it. Mail sent by Auth (signup codes, password reset) is caught by
the local mail inbox at `http://127.0.0.1:54324`, so no email account is needed for development.

To start again from a clean database: `npx supabase db reset`. To stop: `npx supabase stop`.

`supabase/seed.sql` holds admin-curated reference data only (categories, crops, currencies, units).
Never add dummy users, listings, orders, or other user content to it, and never push test data to a
real Supabase project. Fixtures for tests are created inside the disposable local stack.

## 3. Backend

```bash
cd backend
uv sync --frozen
cp .env.example .env
```

Fill `backend/.env` from step 2: `SUPABASE_URL` is `API_URL`, plus `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`. The anon key backs the default RLS-respecting, request-scoped client used
for almost every database call. The service-role key bypasses RLS and is reserved for the documented
exceptions in `docs/architecture/backend-architecture.md`. It must never reach the mobile app, a log, or git.

Run the API from the `backend/` folder so `.env` is found:

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` lets an emulator or a phone on the same Wi-Fi reach it. If Windows Firewall prompts,
allow private networks. The API serves interactive docs at `/docs` in development.

`backend/app/ml/checkpoints/` holds the disease-model weights and their metadata. See
`docs/architecture/ai-disease-advisory.md` for what the model does and does not cover.

## 4. The app

The app is an [Expo](https://docs.expo.dev) project (SDK 57, React Native 0.86). Its Android project is
**generated, not checked in**: `npm run prebuild` writes `android/` from `app.config.ts` and
`package.json`, and `android/` is git-ignored. Change native settings (permissions, SDK levels, the
package name, plugins) in `app.config.ts`. An edit made inside `android/` is erased by the next prebuild.

Copy `.env.example` to `.env` in the repository root and fill it from step 2:

| Variable | Emulator | Physical device |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `http://10.0.2.2:54321` | `http://<your LAN IP>:54321` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` from step 2 | same |
| `EXPO_PUBLIC_API_BASE_URL` | `http://10.0.2.2:8000` | `http://<your LAN IP>:8000` |
| `EXPO_PUBLIC_APP_ENV` | `development` | `development` |

Every `EXPO_PUBLIC_` value is baked into the app bundle when it is built, so anyone who installs the app can
read it. Only public values belong here, never a secret. The app checks them at startup and stops with a
message naming any that is missing or invalid. If your `.env` still uses the old names (`SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `API_BASE_URL`, `APP_ENV`), rename them and restart Metro with `npm start -- --clear`.

`127.0.0.1` will not work from an emulator or phone: it resolves to the device itself and every call fails
with `Network request failed`. `10.0.2.2` is the Android emulator's alias for the host machine. For a
physical device use the host's LAN address (`ipconfig` on Windows) and update it if it changes.

```bash
npm run android      # first run: generates android/, builds the development app, installs it on the
                     # running emulator or connected device, and starts Metro. Allow 10 to 40 minutes.
npm start            # every later run: Metro only. Open the installed ZaraiLink app.
```

Rebuild with `npm run android` only when a native change lands: `app.config.ts`, a plugin, or a native
dependency. JavaScript changes reload on their own. `npm run prebuild:clean` throws `android/` away and
regenerates it if the native project ever looks wrong.

The first launch of a development build shows a short welcome sheet and the developer menu. Close them.
Only development builds have the menu; release builds do not.

## Checks

| Command | What it does |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Jest (add `-- --coverage` for a coverage report) |
| `npm run doctor` | Expo's project checks: package versions match the SDK, app config is valid |
| `cd backend && uv run pytest` | API tests |
| `python scripts/check_reality.py` | The reality gate: no stubs, fake behaviour, swallowed errors, or growing debt |
| `cd backend && uv run python ../scripts/check_reality.py --tools ruff,ruff-format,mypy` | Linter and type-check ratchets |
| `npm run reality` | Reality gate plus the dead-code ratchet |

The ratchets record today's debt in `scripts/reality-baseline.json` and fail if any count rises. After
you reduce a count, run `python scripts/check_reality.py --update-baseline` (add `--tools ...`) to lock
in the improvement; it refuses to record an increase.

## Real-stack tests

Some backend tests need a real Auth and REST stack and skip themselves without one. With step 2 running:

```bash
cd backend
export LOCAL_SUPABASE_URL=http://127.0.0.1:54321
export LOCAL_SUPABASE_ANON_KEY=<ANON_KEY>
export LOCAL_SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
uv run pytest tests/integration -rxs
```

They refuse to run against anything that is not localhost.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `supabase start` fails immediately | Docker Desktop is not running |
| Backend cannot find its keys | It was started from the repository root; run it from `backend/` |
| App stops at startup with `Invalid app configuration` | `.env` is missing, still uses the old variable names, or has a value that is not a URL. The message names the field |
| App shows `Network request failed` | `EXPO_PUBLIC_API_BASE_URL` uses `127.0.0.1`; use `10.0.2.2` or the LAN address |
| `.env` change has no effect | Values are read when Metro starts; restart it with `npm start -- --clear` |
| `npm run android` fails while generating the project | Run `npm run prebuild:clean`; check `node -v` is 22.11 or newer |
| Taking a photo asks for camera permission | Expected: the Expo picker needs it (the old picker did not) |
| Sign-up email never arrives | Open the local mail inbox at `http://127.0.0.1:54324` |
| Metro crashes with `ENOENT` on Windows | The watcher; `metro.config.js` already excludes native build output |
