"""`Idempotency-Key` for the dealer's hand-recorded stock writes and purchase create (B2 verification F8).

A client that retries Stock In after a dropped connection would otherwise record the delivery twice, and the ledger
would then explain stock that never arrived (SRDS §24-§25). The mechanism is the one checkout and payment initiation
use (common/idempotency.py): the key is claimed before the work runs, a replay returns the first response and writes
nothing, a key reused with a different body is refused, and a failure releases the key so the retry runs the work.
The key is optional: without one the route behaves as before.
"""

from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import Header
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

from app.auth.dependencies import AuthenticatedUser
from app.common import idempotency


async def idempotency_key(key: str | None = Header(default=None, alias="Idempotency-Key")) -> str | None:
    """The optional header, as a dependency the routes share (8 to 128 characters, checked by idempotency.begin)."""
    return key


async def run_once(
    user: AuthenticatedUser,
    key: str | None,
    endpoint: str,
    request: BaseModel,
    status: int,
    work: Callable[[], Awaitable[Any]],
) -> Any:
    """Runs `work` once per (dealer, key, endpoint). `endpoint` scopes the key, so the same key on two routes is two
    unrelated requests, as idempotency_keys' unique index has it."""
    claim = await idempotency.begin(user, key, endpoint, idempotency.fingerprint(request))
    if claim is not None and claim.replay is not None:
        return claim.replay
    finished = False
    try:
        result = await work()
        if claim is not None:
            await claim.complete(status, jsonable_encoder(result))
        finished = True
        return result
    finally:
        if claim is not None and not finished:
            await claim.abandon()
