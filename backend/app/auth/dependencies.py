from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from cachetools import TTLCache
from fastapi import Depends, Header, HTTPException

from app.auth.jwt_verifier import JWKSUnavailableError, TokenVerificationError, verify_access_token
from app.common.errors import AppHTTPException
from app.common.rows import as_rows
from app.database.supabase_client import get_user_scoped_client

Role = Literal["admin", "expert", "dealer", "farmer", "buyer"]
AccountStatus = Literal["pending", "approved", "rejected"]

# Roles an admin must approve before they may act as that role (SRDS §8, §11, §13; plan decision D10). The status is
# `profiles.account_status`, set at sign-up by handle_new_user and changed only by decide_account_status() and
# submit_application() (20261005080000_account_status.sql, 20261012080000_applications.sql).
APPROVAL_ROLES: frozenset[str] = frozenset({"dealer", "expert"})


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None
    role: Role
    access_token: str
    aal: str | None = None
    account_status: AccountStatus = "approved"


@dataclass(frozen=True)
class _ProfileState:
    role: Role
    is_suspended: bool
    account_status: AccountStatus = "approved"
    account_status_changed_at: datetime | None = None


# P4 (4A.3): role/suspension resolved from the profile once per request, then cached briefly —
# a suspension or role change now takes effect within one TTL window instead of being read fresh
# on literally every request forever. Deliberately small and in-process (no Redis; that's P5): a
# multi-instance deployment would need a shared cache, but there is only ever one backend process
# today. Never trust role/suspension from anywhere but this lookup.
_profile_cache: TTLCache[str, _ProfileState] = TTLCache(maxsize=4096, ttl=10)


def forget_profile(user_id: str) -> None:
    """Drops a user's cached profile state after an admin decision about them (suspension, role, approval), so their
    next request sees it instead of the old state for up to one TTL window. Covers the one backend process that exists
    today; the database policies apply every decision at once regardless."""
    _profile_cache.pop(user_id, None)


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
    response = (
        await supabase.table("profiles")
        .select("role, is_suspended, account_status, account_status_changed_at")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    rows = as_rows(response)
    if not rows:
        raise HTTPException(status_code=401, detail="No profile for this account")
    row = rows[0]
    changed_at = row.get("account_status_changed_at")
    return _ProfileState(
        role=row["role"],
        is_suspended=bool(row["is_suspended"]),
        account_status=row.get("account_status") or "approved",
        account_status_changed_at=datetime.fromisoformat(changed_at) if changed_at else None,
    )


async def _authenticate(token: str) -> AuthenticatedUser:
    """
    Authorization: Bearer <supabase_access_token>
            -> local JWT verification against Supabase's JWKS (auth/jwt_verifier.py) — P4 (4A.2),
               replaces the old per-request GET /auth/v1/user call
            -> verified Supabase user id
            -> profiles lookup (role, is_suspended, account_status), via a client authenticated as THAT
               SAME token (RLS-respecting, not service-role), cached briefly per user id (P4, 4A.3)
            -> AuthenticatedUser, or a 401/403 rejection

    role/is_suspended/account_status are NEVER taken from the request or the token — only from this lookup.
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
        # Only an approved profile is cached: a pending dealer or expert waiting on the app's Application Status
        # screen reaches the app the moment an admin approves them, and until then they call only a few routes.
        if profile.account_status == "approved":
            _profile_cache[claims.sub] = profile

    if profile.is_suspended:
        raise AppHTTPException(403, "Account suspended", "account_suspended")

    # SRDS §8: an approved dealer or expert logs in again before using their role. A session from before the decision
    # keeps its sign-in time through every refresh (the token's `amr`), so it is refused until a real sign-in.
    if (
        profile.role in APPROVAL_ROLES
        and profile.account_status == "approved"
        and profile.account_status_changed_at is not None
        and claims.signed_in_at is not None
        # `amr` is whole seconds; a sign-in in the same second as the decision counts as after it.
        and claims.signed_in_at < int(profile.account_status_changed_at.timestamp())
    ):
        raise AppHTTPException(403, "Your account was approved. Sign in again to continue.", "sign_in_again")

    return AuthenticatedUser(
        id=claims.sub,
        email=claims.email,
        role=profile.role,
        access_token=token,
        aal=claims.aal,
        account_status=profile.account_status,
    )


async def get_current_user(token: str = Depends(get_bearer_token)) -> AuthenticatedUser:
    """The signed-in caller, refused (403 `account_not_approved`) while a dealer or expert is not approved: until then
    they may use only the routes that depend on `get_current_user_any_status` (SRDS §8, §11; decision D10)."""
    user = await _authenticate(token)
    if user.role in APPROVAL_ROLES and user.account_status != "approved":
        raise AppHTTPException(403, "Account not approved", "account_not_approved")
    return user


async def get_current_user_any_status(token: str = Depends(get_bearer_token)) -> AuthenticatedUser:
    """The signed-in caller whatever their approval status. Only for what a pending or rejected dealer or expert still
    needs: their own profile, deleting their account, the expert application and resubmitting it."""
    return await _authenticate(token)


require_authenticated_user = get_current_user

# The dependencies that admit a pending or rejected dealer or expert. The authorization matrix reads this set to tell
# the routes a pending actor may call from the ones that must refuse them.
declared_any_status: set[Callable[..., Any]] = {get_current_user_any_status}


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


def require_role_any_status(*roles: Role):
    """`require_role` without the approval check, for the routes a pending dealer or expert needs to apply."""

    async def _dependency(user: AuthenticatedUser = Depends(get_current_user_any_status)) -> AuthenticatedUser:
        if user.role not in roles:
            raise AppHTTPException(403, "Insufficient role", "insufficient_role")
        return user

    declared_roles[_dependency] = roles
    declared_any_status.add(_dependency)
    return _dependency


require_admin = require_role("admin")
require_expert = require_role("expert")
require_dealer = require_role("dealer")
require_farmer = require_role("farmer")
require_buyer = require_role("buyer")
require_expert_any_status = require_role_any_status("expert")
# A3b: a pending or rejected dealer fills in and sends their application.
require_dealer_any_status = require_role_any_status("dealer")


async def require_admin_aal2(user: AuthenticatedUser = Depends(require_admin)) -> AuthenticatedUser:
    """P4 (4A.4): the small set of admin *write* endpoints (suspend/promote a user, resolve a
    report, verify an expert, redact a message) need a second factor verified this session, not
    just the admin role — matching the same requirement enforced at the RLS layer (see
    supabase/migrations/*_admin_mfa_enforcement.sql). Admin *reads* stay at aal1; only writes use
    this dependency instead of plain require_admin."""
    if user.aal != "aal2":
        raise AppHTTPException(403, "This action requires a verified second factor (MFA).", "mfa_required")
    return user
