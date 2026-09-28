import asyncio

from app.admin import repository as repo
from app.auth.dependencies import AuthenticatedUser
from app.common.audit_log import log_admin_action
from app.common.orders import service as orders_service


async def fetch_platform_stats(user: AuthenticatedUser) -> dict:
    roles, total_listings, total_orders = await asyncio.gather(
        repo.fetch_role_counts(user.access_token),
        repo.count_listings(user.access_token),
        repo.count_orders(user.access_token),
    )
    users_by_role: dict[str, int] = {}
    for row in roles:
        users_by_role[row["role"]] = users_by_role.get(row["role"], 0) + 1

    return {
        "total_users": len(roles),
        "users_by_role": users_by_role,
        "total_listings": total_listings,
        "total_orders": total_orders,
    }


async def fetch_all_profiles(user: AuthenticatedUser) -> list[dict]:
    return await repo.fetch_all_profiles(user.access_token)


async def set_profile_suspended(user: AuthenticatedUser, profile_id: str, is_suspended: bool) -> None:
    await repo.set_profile_suspended(user.access_token, profile_id, is_suspended)
    await log_admin_action(
        user,
        "suspend_user" if is_suspended else "reactivate_user",
        "profiles",
        profile_id,
        previous_state={"is_suspended": not is_suspended},
        new_state={"is_suspended": is_suspended},
    )


async def update_user_role(user: AuthenticatedUser, profile_id: str, new_role: str) -> None:
    # Reads the real current role right before overwriting it, rather than trusting whatever
    # role the client's (possibly stale) cached profile object claims was "previous" — a small
    # correctness fix over the original frontend implementation, audit-log content only, not a
    # security boundary.
    previous_role = await repo.fetch_profile_role(user.access_token, profile_id)
    await repo.update_profile_role(user.access_token, profile_id, new_role)
    await log_admin_action(
        user,
        "change_role",
        "profiles",
        profile_id,
        previous_state={"role": previous_role},
        new_state={"role": new_role},
    )


async def fetch_reports(user: AuthenticatedUser, status: str | None) -> list[dict]:
    return await repo.fetch_reports(user.access_token, status)


async def resolve_report(user: AuthenticatedUser, report_id: str, notes: str | None) -> None:
    await repo.resolve_report(user.access_token, report_id, "resolved", user.id, notes)
    await log_admin_action(
        user, "resolve_report", "reports", report_id, new_state={"status": "resolved"}, metadata={"notes": notes}
    )


async def dismiss_report(user: AuthenticatedUser, report_id: str, notes: str | None) -> None:
    await repo.resolve_report(user.access_token, report_id, "dismissed", user.id, notes)
    await log_admin_action(
        user, "dismiss_report", "reports", report_id, new_state={"status": "dismissed"}, metadata={"notes": notes}
    )


async def fetch_audit_logs(user: AuthenticatedUser, target_entity: str | None, actor_id: str | None) -> list[dict]:
    return await repo.fetch_audit_logs(user.access_token, target_entity, actor_id)


async def fetch_all_orders(user: AuthenticatedUser) -> list[dict]:
    return await orders_service.fetch_all_orders(user)
