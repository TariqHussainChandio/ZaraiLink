from dataclasses import dataclass
from typing import Literal

import httpx
from fastapi import Depends, Header, HTTPException

from .config import settings
from .supabase_client import get_user_scoped_client

Role = Literal["admin", "expert", "dealer", "farmer", "buyer"]


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None
    role: Role
    access_token: str


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


async def get_current_user(token: str = Depends(get_bearer_token)) -> AuthenticatedUser:
    """
    Authorization: Bearer <supabase_access_token>
            -> Supabase Auth verification (GET /auth/v1/user)
            -> authenticated Supabase user id
            -> profiles lookup, via a client authenticated as THAT SAME token (RLS-respecting,
               not service-role) so this reuses the exact "read your own profile" policy the
               mobile app already relies on, rather than a separate trust path
            -> server-side role + is_suspended
            -> AuthenticatedUser, or a 401/403 rejection

    role/is_suspended are NEVER taken from the request — only from this lookup.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={"Authorization": f"Bearer {token}", "apikey": settings.supabase_anon_key},
            )
        except httpx.HTTPError:
            raise HTTPException(status_code=401, detail="Could not verify credentials")

    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    auth_user = response.json()
    user_id = auth_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    supabase = get_user_scoped_client(token)
    profile_response = (
        supabase.table("profiles").select("role, is_suspended").eq("id", user_id).limit(1).execute()
    )
    profile_rows = profile_response.data or []
    if not profile_rows:
        raise HTTPException(status_code=401, detail="No profile for this account")

    profile = profile_rows[0]
    if profile.get("is_suspended"):
        raise HTTPException(status_code=403, detail="Account suspended")

    return AuthenticatedUser(
        id=user_id,
        email=auth_user.get("email"),
        role=profile["role"],
        access_token=token,
    )


require_authenticated_user = get_current_user


def require_role(*roles: Role):
    async def _dependency(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user

    return _dependency


require_admin = require_role("admin")
require_expert = require_role("expert")
require_dealer = require_role("dealer")
require_farmer = require_role("farmer")
require_buyer = require_role("buyer")
