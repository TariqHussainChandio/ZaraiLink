from functools import lru_cache

import httpx._transports.default as _httpx_transport
from supabase import AsyncClient, AsyncClientOptions, create_async_client

from app.config.settings import settings

# Found by profiling the k6 benchmark (docs/architecture/adr/0001-...): every `httpx.AsyncClient`
# construction builds a fresh SSL context, and loading the CA bundle costs ~0.28s of *synchronous*
# CPU that blocks the event loop. One Supabase client builds several httpx clients, and the
# per-request user-scoped client is built on every repository call — ~2s of blocked loop per
# checkout, which is what serialized concurrent requests even after the calls became `await`ed.
# An SSLContext is safe to share across clients, so build it once. Patches the name httpx's
# transport module imports (private API, pinned httpx==0.28.1 — revisit on upgrade).
_httpx_transport.create_ssl_context = lru_cache(maxsize=None)(_httpx_transport.create_ssl_context)

_service_role_client: AsyncClient | None = None
_public_client: AsyncClient | None = None


async def init_shared_clients() -> None:
    """P5 (item 2): called once from main.py's lifespan startup. Building both singletons here —
    rather than lazily on first use — means a bad SUPABASE_URL/key fails at boot, not on whichever
    request happens to need it first. Cheap: constructing an `AsyncClient` with no persisted
    session does no network I/O (confirmed against the installed `supabase`/`gotrue` source —
    `get_session()` on an empty in-memory store returns `None` synchronously)."""
    global _service_role_client, _public_client
    _service_role_client = await create_async_client(settings.supabase_url, settings.supabase_service_role_key)
    _public_client = await create_async_client(settings.supabase_url, settings.supabase_anon_key)


async def close_shared_clients() -> None:
    """Called once from main.py's lifespan shutdown. `AsyncClient` has no single composite close —
    each of `.postgrest`/`.storage`/`.auth` owns its own internal `httpx.AsyncClient` and must be
    closed individually (confirmed against the installed library's `_async` client sources)."""
    for client in (_service_role_client, _public_client):
        if client is None:
            continue
        await client.postgrest.aclose()
        await client.storage.session.aclose()
        await client.auth.close()


def get_service_role_client() -> AsyncClient:
    """Bypasses RLS entirely. Reserved for the narrow, explicitly documented cases where that's
    actually required (see docs/architecture/backend-architecture.md) — never the default
    DB-access path. Every call site using this MUST derive any user/owner-identifying filter from
    a verified `AuthenticatedUser` (auth/dependencies.py), never from an untrusted request value."""
    if _service_role_client is None:
        raise RuntimeError("Supabase clients not initialized — the FastAPI lifespan did not run")
    return _service_role_client


def get_public_client() -> AsyncClient:
    """Unauthenticated PostgREST calls (the anon key, no user token attached) — only for reads
    the database itself already grants to `anon` (e.g. reference-data tables' `select: all`
    policy + `grant select ... to anon, authenticated`). Never use this for anything requiring
    a caller identity — use get_user_scoped_client for that, even for a public-role user."""
    if _public_client is None:
        raise RuntimeError("Supabase clients not initialized — the FastAPI lifespan did not run")
    return _public_client


async def get_user_scoped_client(access_token: str) -> AsyncClient:
    """The default repository-access path: a fresh client per request, authenticated as the
    calling user's own JWT via PostgREST's Authorization header — so RLS applies exactly as it
    does for the mobile app calling Supabase directly today. Not cached/reused across requests
    (each caller has a different token, and `postgrest.auth(token)` mutates shared state, which
    would be unsafe to share across concurrent requests from different users).

    The token goes in as the client's own Authorization header, not only through `postgrest.auth()`: Storage reads
    the same header, and without it a storage call (a signed link to an application document, A3b) ran as `anon`,
    which the private buckets' policies refuse."""
    options = AsyncClientOptions(headers={"Authorization": f"Bearer {access_token}"})
    client = await create_async_client(settings.supabase_url, settings.supabase_anon_key, options)
    client.postgrest.auth(access_token)
    return client


async def get_reauth_client() -> AsyncClient:
    """A fresh, throwaway client for re-authentication checks (P4, account deletion) —
    `sign_in_with_password` mutates a client's internal auth state, so this must never be the
    shared `get_public_client()` singleton (that would leak one request's session into another
    concurrent request using the same cached client). A new client per call, discarded after."""
    return await create_async_client(settings.supabase_url, settings.supabase_anon_key)
