from supabase import Client, create_client

from .config import settings

_service_role_client: Client | None = None
_public_client: Client | None = None


def get_service_role_client() -> Client:
    """Bypasses RLS entirely. Reserved for the narrow, explicitly documented cases where that's
    actually required (see docs/architecture/backend-architecture.md) — never the default
    DB-access path. Every call site using this MUST derive any user/owner-identifying filter from
    a verified `AuthenticatedUser` (core/auth.py), never from an untrusted request value."""
    global _service_role_client
    if _service_role_client is None:
        _service_role_client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _service_role_client


def get_public_client() -> Client:
    """Unauthenticated PostgREST calls (the anon key, no user token attached) — only for reads
    the database itself already grants to `anon` (e.g. reference-data tables' `select: all`
    policy + `grant select ... to anon, authenticated`). Never use this for anything requiring
    a caller identity — use get_user_scoped_client for that, even for a public-role user."""
    global _public_client
    if _public_client is None:
        _public_client = create_client(settings.supabase_url, settings.supabase_anon_key)
    return _public_client


def get_user_scoped_client(access_token: str) -> Client:
    """The default repository-access path: a fresh client per request, authenticated as the
    calling user's own JWT via PostgREST's Authorization header — so RLS applies exactly as it
    does for the mobile app calling Supabase directly today. Not cached/reused across requests
    (each caller has a different token)."""
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    client.postgrest.auth(access_token)
    return client
