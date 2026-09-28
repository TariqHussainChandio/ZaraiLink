# ZaraiLink

An agricultural marketplace for Pakistan: farmers, buyers, dealers, agricultural experts, and platform
admins on one mobile app, with an AI-assisted crop-disease advisory that always routes to a human expert.

> **Status: not production-ready.** The runtime baseline in [`docs/status/`](docs/status/) records what
> works and what does not, and [`docs/status/feature-register.md`](docs/status/feature-register.md) is the
> single source of truth for each capability. Read those before assuming a feature works.

## Stack

| Layer | Technology |
|---|---|
| Mobile app | React Native 0.86 (Android), TypeScript, React Navigation, Zustand, TanStack Query |
| API | FastAPI (Python 3.12) over the Supabase REST API |
| Data and auth | Supabase: Postgres with row-level security, Auth, Storage, Realtime |
| AI | MobileNetV2 image classifier served by the API |

## Repository layout

```
frontend/     React Native app: one folder per SRDS module (admin, farmer, dealer, buyer, expert, ai, inventory,
              common/<feature>) plus shared theme, navigation, services, state, hooks, utils
backend/      FastAPI service: the same modules (router, service, repository, schemas each) and its tests
supabase/     Migrations, seed data (reference data only), local stack config
scripts/      Quality gates (check_reality.py) and CI helpers
docs/         Architecture, database, setup, process, status
```

## Quick start (local, no accounts needed)

Prerequisites: Node 22 or newer, Python 3.12, [uv](https://docs.astral.sh/uv/), Docker Desktop, and for the
app itself Android Studio with an emulator. Full detail is in
[`docs/setup/DEVELOPMENT_SETUP.md`](docs/setup/DEVELOPMENT_SETUP.md).

```bash
# 1. JavaScript dependencies
npm ci

# 2. Local Supabase (Postgres, Auth, REST, mail catcher) in Docker; applies every migration
npx supabase gen signing-key --algorithm ES256 --workdir "$(mktemp -d)" | python -c "import json, sys; json.dump([json.load(sys.stdin)], sys.stdout)" > supabase/signing_keys.json   # once per clone
npx supabase start
npx supabase status -o env        # prints the local URL and keys used below

# 3. Backend
cd backend
uv sync --frozen                  # exact, hash-locked dependencies from uv.lock
cp .env.example .env              # then fill in the local values from step 2
python ../scripts/fetch_model_weights.py   # downloads model.pth from Supabase Storage (needs MODEL_WEIGHTS_URL, see the setup guide)
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
cd ..

# 4. App (Expo): copy .env.example to .env and fill the EXPO_PUBLIC_ values (emulator uses 10.0.2.2)
npm run android                   # first run generates android/, builds and installs the dev app (10-40 min)
npm start                         # later runs: Metro only; open the installed app
```

`android/` is generated from `app.config.ts` and is not checked in. Native changes go in `app.config.ts`.

Local data is disposable. Never seed dummy users, listings, or orders into a real Supabase project.

## Checks

```bash
npm run lint && npm run typecheck && npm test            # app
cd backend && uv run pytest                              # API
python scripts/check_reality.py                          # no stubs, fake behaviour, or growing debt
npx supabase test db                                    # database: every policy and grant, as real roles
```

CI runs all of these plus dependency, secret, and workflow scans on every pull request. `npm ci` also installs
fast git hooks that check staged files and the commit message before each commit (skip one with
`LEFTHOOK=0 git commit`, remove them with `npx lefthook uninstall`).

## Documentation

| | |
|---|---|
| [`docs/status/`](docs/status/) | What actually works today: baseline report and feature register |
| [`docs/architecture/`](docs/architecture/) | Authorization model, backend, notifications, AI advisory |
| [`docs/database/schema.md`](docs/database/schema.md) | Tables, policies, functions |
| [`docs/process/`](docs/process/) | How work is done here, including the rules for AI coding agents |
| [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md) | Contributing and reporting vulnerabilities |
| [`AGENTS.md`](AGENTS.md) | Rules every AI coding agent must follow in this repository |

## Licence

Apache License 2.0 — see [`LICENSE`](LICENSE).
