from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from cachetools import TTLCache
from fastapi import Depends, Header, HTTPException

from app.auth.jwt_verifier import JWKSUnavailableError, TokenVerificationError, verify_access_token
from app.common.errors import AppHTTPException
from app.common.rows import as_rows
from app.database.supabase_client import get_user_scoped_client

Role = Literal["admin", "expert", "dealer", "farmer", "buyer"]


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None
    role: Role
    access_token: str
    aal: str | None = None


@dataclass(frozen=True)
class _ProfileState:
    role: Role
    is_suspended: bool


# P4 (4A.3): role/suspension resolved from the profile once per request, then cached briefly —
# a suspension or role change now takes effect within one TTL window instead of being read fresh
# on literally every request forever. Deliberately small and in-process (no Redis; that's P5): a
# multi-instance deployment would need a shared cache, but there is only ever one backend process
# today. Never trust role/suspension from anywhere but this lookup.
_profile_cache: TTLCache[str, _ProfileState] = TTLCache(maxsize=4096, ttl=10)


async def get_bearer_token(authorization: str | None = Header(default=None)) -> str:
    # `authorization` is Optional (default None) specifically so a missing header reaches this
    # function body and gets our own 401, rather than FastAPI's built-in request-validation 422
    # for a required-but-absent header — "missing token -> 401" is a documented acceptance
    # criterion, not just "some 4xx."
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    return token


async def _fetch_profile_state(token: str, user_id: str) -> _ProfileState:
    supabase = await get_user_scoped_client(token)
    response = await supabase.table("profiles").select("role, is_suspended").eq("id", user_id).limit(1).execute()
    rows = as_rows(response)
    if not rows:
        raise HTTPException(status_code=401, detail="No profile for this account")
    return _ProfileState(role=rows[0]["role"], is_suspended=bool(rows[0]["is_suspended"]))


async def get_current_user(token: str = Depends(get_bearer_token)) -> AuthenticatedUser:
    """
    Authorization: Bearer <supabase_access_token>
            -> local JWT verification against Supabase's JWKS (auth/jwt_verifier.py) — P4 (4A.2),
               replaces the old per-request GET /auth/v1/user call
            -> verified Supabase user id
            -> profiles lookup (role, is_suspended), via a client authenticated as THAT SAME
               token (RLS-respecting, not service-role), cached briefly per user id (P4, 4A.3)
            -> AuthenticatedUser, or a 401/403 rejection

    role/is_suspended are NEVER taken from the request or the token — only from this lookup.
    A JWKS-fetch failure (Supabase unreachable) is a 503: this is our/Supabase's outage, not
    evidence the caller's credentials are bad, so it must not be conflated with a 401.
    """
    try:
        claims = verify_access_token(token)
    except JWKSUnavailableError as exc:
        raise AppHTTPException(503, "Could not verify credentials", "auth_unavailable") from exc
    except TokenVerificationError as exc:
        raise AppHTTPException(401, "Invalid or expired token", "token_invalid") from exc

    profile = _profile_cache.get(claims.sub)
    if profile is None:
        # Cache-stampede judgment call (P5, item 2): concurrent first-requests for the same
        # never-cached user can now genuinely overlap (async, non-blocking), each triggering its
        # own profile lookup — deliberately not guarded with a per-key lock. The blast radius is
        # bounded (a few duplicate cheap single-row selects, once per user per 10s TTL window), and
        # a lock registry would need its own cleanup (a dict of locks that only grows) for a
        # low-cost, self-limiting problem. Revisit only if this shows up as a real signal.
        profile = await _fetch_profile_state(token, claims.sub)
        _profile_cache[claims.sub] = profile

    if profile.is_suspended:
        raise AppHTTPException(403, "Account suspended", "account_suspended")

    return AuthenticatedUser(id=claims.sub, email=claims.email, role=profile.role, access_token=token, aal=claims.aal)


require_authenticated_user = get_current_user


# Every dependency `require_role` has built, mapped to the roles it admits. Lets the authorization matrix
# (tests/integration/smoke/test_smoke_authorization_matrix.py) read each route's declared requirement
# off FastAPI's dependency tree instead of keeping a parallel, driftable list of expectations.
declared_roles: dict[Callable[..., Any], tuple[Role, ...]] = {}


def require_role(*roles: Role):
    async def _dependency(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if user.role not in roles:
            raise AppHTTPException(403, "Insufficient role", "insufficient_role")
        return user

    declared_roles[_dependency] = roles
    return _dependency


require_admin = require_role("admin")
require_expert = require_role("expert")
require_dealer = require_role("dealer")
require_farmer = require_role("farmer")
require_buyer = require_role("buyer")


async def require_admin_aal2(user: AuthenticatedUser = Depends(require_admin)) -> AuthenticatedUser:
    """P4 (4A.4): the small set of admin *write* endpoints (suspend/promote a user, resolve a
    report, verify an expert, redact a message) need a second factor verified this session, not
    just the admin role — matching the same requirement enforced at the RLS layer (see
    supabase/migrations/*_admin_mfa_enforcement.sql). Admin *reads* stay at aal1; only writes use
    this dependency instead of plain require_admin."""
    if user.aal != "aal2":
        raise AppHTTPException(403, "This action requires a verified second factor (MFA).", "mfa_required")
    return user
