# ZaraiLink Development Setup

## Project

ZaraiLink is a React Native mobile application for an agricultural marketplace.

## Technology Stack

- React Native 0.86.2
- React 19.2.3
- TypeScript
- React Navigation
- Zustand
- TanStack React Query
- Supabase
- FastAPI backend
- PostgreSQL through Supabase

## Requirements

- Node.js >= 22.11.0
- npm
- Java/JDK compatible with React Native 0.86.2
- Android Studio
- Android SDK
- Git
- Supabase CLI
- Python 3.x for backend development

## Clone

git clone https://github.com/TariqHussainChandio/ZaraiLink.git
cd ZaraiLink

## Install React Native Dependencies

npm ci

## Environment

Copy:

.env.example

to:

.env

Then configure the required environment variables.

`API_BASE_URL` must point at the backend's LAN address, not `127.0.0.1` / `localhost` — the app
runs on an Android emulator or a physical device, neither of which shares the host machine's
loopback interface, so `127.0.0.1` there resolves to the device itself and every backend call
fails with `TypeError: Network request failed`. Find the host machine's LAN IP (`ipconfig` on
Windows, Wi-Fi adapter's IPv4 address) and use `http://<that-ip>:8000`, e.g.
`API_BASE_URL=http://192.168.18.96:8000`. This works for both the emulator and a physical device
on the same Wi-Fi network; it must be updated if that IP changes (e.g. after reconnecting to
Wi-Fi). The backend must also be started with `--host 0.0.0.0` (see below) so it accepts
connections on that interface.

## Supabase

Supabase configuration and migrations are stored in:

supabase/

Do not commit private API keys.

## Backend

Backend requirements are stored in:

backend/requirements.txt

Create a Python virtual environment:

python -m venv .venv

Activate on Windows:

.venv\Scripts\Activate.ps1

Install:

pip install -r backend/requirements.txt

Copy `backend/.env.example` to `backend/.env` and add both `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`. The anon key backs the default, RLS-respecting request-scoped
client (`get_user_scoped_client`, see `docs/architecture/backend-architecture.md`) used for
almost every DB call; the service-role key is reserved for the few documented cases that
genuinely need to bypass RLS (audit logging, notifications, disease inference, the
`available_stock` RPC).

## Run the backend locally

From the repo root, with the virtual environment active:

uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

`--host 0.0.0.0` is required (not just `--reload`'s default `127.0.0.1`) so the app running on an
Android emulator or a physical device on the same Wi-Fi can reach the backend — see the
`API_BASE_URL` note below. If Windows Firewall prompts on first run, allow access on private
networks.

`backend/app/ml/checkpoints/model.pth` ships as a placeholder until real MobileNetV2 weights (trained in
Google Colab, see `docs/architecture/ai-disease-advisory.md`) are dropped in at that same path —
until then, `POST /api/v1/disease/predict` responds with `503`.

## Start Metro

npm start

## Android

npm run android

## Testing

npm test

## Lint

npm run lint

## TypeScript

npx tsc --noEmit
