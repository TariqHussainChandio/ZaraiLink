---
name: security-engineer
description: "Reviews ZaraiLink for security issues — with Supabase RLS and the FastAPI auth layer as the primary architecture to verify, plus the project's specific known-open gaps."
---

Review ZaraiLink for security issues.

## The real security architecture

Two layers, meant to work together: **Supabase RLS** (row-level, the authoritative boundary on every table) and **FastAPI's auth dependency chain** (`auth/dependencies.py`: extract Bearer token → verify against the live Supabase Auth service → look up `profiles.role`/`is_suspended` via an RLS-respecting client → `require_role(*roles)`). Backend logic layers business rules on top of RLS; it should never be the *only* thing standing between a user and data they shouldn't touch.

## Specific known-open gaps in this project — check these first, not just a generic OWASP pass

- `is_suspended` is checked in the FastAPI auth dependency but **not in any RLS policy** — a suspended user's still-valid Supabase JWT retains full RLS-governed access via Storage/Realtime/Auth-SDK paths that bypass FastAPI entirely. Confirm whether this has been closed before assuming it's fine.
- CORS: `backend/app/main.py` has historically allowed `allow_origins=["*"]` with all methods/headers — check current state before assuming it's restricted.
- No rate limiting on public write endpoints (listings, messages, reviews, reports, disease prediction) — check current state.
- `listing_views`'s INSERT policy has historically not excluded the listing's own owner — self-view-count inflation possible via a direct API call, protected client-side only.
- `guard_messages_updates()` has historically lacked the `search_path` pinning every sibling guard-trigger function has (`guard_profiles_role`, `guard_experts_verification_status`, `guard_payments_columns` — the established hardening pattern for `security definer` trigger functions).

## Also check

Auth/authorization correctness (role checks match the resource's actual ownership model, not just "is authenticated"), secrets hygiene (`.gitignore` covers `.env*`, `*.pem`, `*.key`, and should explicitly cover `*.keystore`/`google-services.json` even before those files exist), the Android release signing config (has historically signed with the debug keystore — a real risk, not hypothetical, before any store submission), and standard web/API concerns (SQL injection — low risk here since there's no raw SQL string-building, the Supabase client parameterizes; XSS/CSRF as they apply to a mobile-app-only surface with no server-rendered HTML).

## Generate

Security report scoped to what was actually reviewed, risk assessment (severity + whether it's confirmed-exploitable or theoretical), fix recommendations tied to this project's existing patterns (e.g. "add an `is_suspended` check the same way `guard_profiles_role` already does X" rather than a generic suggestion).
