"""P5 (item 6): `Idempotency-Key` support for order checkout and payment initiation.

Flow: `begin()` claims (user, key, endpoint) by inserting a row before any work runs. A fresh claim
returns a `Claim` the caller completes with the response, or abandons if the work failed (so a retry
can run again). If the claim already exists, the stored response is replayed; if that first request has
not finished yet, the caller gets a 409 rather than running the work a second time — this is what stops
two concurrent retries from both creating an order.

A stored SHA-256 of the request body ties a key to what it was first used for: reusing it with a different
body is a client bug and gets a 422, never a replay of an unrelated response.

Runs as the calling user through RLS (`idempotency_keys_owner_all`); no service-role access.
Rows older than 24 h are swept lazily on each claim, since no scheduler exists in this stack.
"""

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException
from postgrest.exceptions import APIError
from pydantic import BaseModel

from app.auth.dependencies import AuthenticatedUser
from app.common.errors import AppHTTPException
from app.common.rows import as_rows
from app.database.supabase_client import get_user_scoped_client

_TTL = timedelta(hours=24)


@dataclass
class Claim:
    user: AuthenticatedUser
    key: str
    endpoint: str
    replay: Any = None

    async def complete(self, status: int, body: Any) -> None:
        client = await get_user_scoped_client(self.user.access_token)
        await (
            client.table("idempotency_keys")
            .update({"response_status": status, "response_body": body})
            .eq("user_id", self.user.id)
            .eq("key", self.key)
            .eq("endpoint", self.endpoint)
            .execute()
        )

    async def abandon(self) -> None:
        client = await get_user_scoped_client(self.user.access_token)
        await (
            client.table("idempotency_keys")
            .delete()
            .eq("user_id", self.user.id)
            .eq("key", self.key)
            .eq("endpoint", self.endpoint)
            .execute()
        )


def fingerprint(request: BaseModel) -> str:
    """Stable hash of a request body: field order and whitespace cannot change it."""
    canonical = request.model_dump_json(exclude_unset=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def begin(user: AuthenticatedUser, key: str | None, endpoint: str, request_hash: str) -> Claim | None:
    """Returns None when the caller sent no key (the endpoint then behaves exactly as before)."""
    if key is None:
        return None
    if not 8 <= len(key) <= 128:
        raise HTTPException(status_code=422, detail="Idempotency-Key must be 8 to 128 characters.")

    client = await get_user_scoped_client(user.access_token)
    cutoff = (datetime.now(UTC) - _TTL).isoformat()
    await client.table("idempotency_keys").delete().lt("created_at", cutoff).execute()

    try:
        await (
            client.table("idempotency_keys")
            .insert({"user_id": user.id, "key": key, "endpoint": endpoint, "request_hash": request_hash})
            .execute()
        )
    except APIError as exc:
        if exc.code != "23505":
            raise
        existing = await (
            client.table("idempotency_keys")
            .select("response_body, request_hash")
            .eq("user_id", user.id)
            .eq("key", key)
            .eq("endpoint", endpoint)
            .limit(1)
            .execute()
        )
        rows = as_rows(existing)
        if rows and rows[0]["request_hash"] not in (None, request_hash):
            raise AppHTTPException(
                422, "This Idempotency-Key was already used with a different request.", "idempotency_key_reused"
            ) from exc
        if not rows or rows[0]["response_body"] is None:
            raise AppHTTPException(
                409,
                "A request with this Idempotency-Key is still in progress.",
                "idempotency_in_progress",
                headers={"Retry-After": "1"},
            ) from exc
        return Claim(user, key, endpoint, replay=rows[0]["response_body"])
    return Claim(user, key, endpoint)
