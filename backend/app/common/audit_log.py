from typing import Any

from app.auth.dependencies import AuthenticatedUser
from app.database.supabase_client import get_user_scoped_client


async def log_admin_action(
    user: AuthenticatedUser,
    action: str,
    target_entity: str,
    target_id: str | None,
    previous_state: dict[str, Any] | None = None,
    new_state: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """
    Replaces the frontend's former logAdminAction (see frontend/admin/services/adminService.ts). Kept
    as its own low-level module rather than inside admin/service.py so every domain
    that needs it (reference-data, listings, expert, admin itself, ...) can import it without a
    circular/forward dependency on the Admin domain, which is built later in the migration
    order — admin/service.py imports from here too once it exists, it doesn't duplicate this.

    Uses the caller's own user-scoped client, not service-role: every caller of this function
    has already passed a `require_admin` dependency upstream, and `audit_logs`' insert policy is
    admin-only — RLS already permits this write for that caller, so there's no reason to reach
    for a full-bypass client just to log the action they were already allowed to take.
    """
    client = await get_user_scoped_client(user.access_token)
    await (
        client.table("audit_logs")
        .insert(
            {
                "actor_id": user.id,
                "action": action,
                "target_entity": target_entity,
                "target_id": target_id,
                "previous_state": previous_state,
                "new_state": new_state,
                "metadata": metadata,
            }
        )
        .execute()
    )
