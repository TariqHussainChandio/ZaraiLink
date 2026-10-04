from typing import Literal

from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser, forget_profile
from app.common.errors import AppHTTPException
from app.common.rows import as_rows
from app.database.supabase_client import get_user_scoped_client

Decision = Literal["approved", "rejected"]


async def decide(user: AuthenticatedUser, profile_id: str, decision: Decision, reason: str | None) -> dict:
    """Decides a pending dealer or expert application (SRDS §8, §11, §12) through the database's one decision path,
    decide_account_status() (20261005080000_account_status.sql). That function checks the admin's second factor, the
    target's role and status and the rejection reason, and writes the audit row in the same transaction (BR-15), so
    this caller writes no audit row of its own: a decision and its audit record cannot come apart.

    Kept in the common core because two modules decide applications (admin for dealers, expert for experts) and
    neither may reach into the other. Returns the role and the previous and new status."""
    client = await get_user_scoped_client(user.access_token)
    try:
        response = await client.rpc(
            "decide_account_status", {"_user_id": profile_id, "_decision": decision, "_reason": reason}
        ).execute()
    except APIError as exc:
        if exc.code == "P0002":
            raise AppHTTPException(404, "No such account", "not_found") from exc
        if exc.code == "23514":
            # The function's own message says which rule failed (not pending, not reviewed, no reason, not applied).
            raise AppHTTPException(
                409, exc.message or "This application cannot be decided", "invalid_transition"
            ) from exc
        raise
    forget_profile(profile_id)
    rows = as_rows(response)
    return rows[0] if rows else {}
