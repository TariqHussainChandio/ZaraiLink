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
