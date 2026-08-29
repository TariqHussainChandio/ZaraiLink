from ..core.auth import AuthenticatedUser
from ..repositories import admin_repository as repo
from ..repositories import orders_repository as orders_repo
from .audit_log_service import log_admin_action


def fetch_platform_stats(user: AuthenticatedUser) -> dict:
    roles = repo.fetch_role_counts(user.access_token)
    users_by_role: dict[str, int] = {}
    for row in roles:
        users_by_role[row["role"]] = users_by_role.get(row["role"], 0) + 1

    return {
        "total_users": len(roles),
        "users_by_role": users_by_role,
        "total_listings": repo.count_listings(user.access_token),
        "total_orders": repo.count_orders(user.access_token),
    }


def fetch_all_profiles(user: AuthenticatedUser) -> list[dict]:
    return repo.fetch_all_profiles(user.access_token)


def set_profile_suspended(user: AuthenticatedUser, profile_id: str, is_suspended: bool) -> None:
    repo.set_profile_suspended(user.access_token, profile_id, is_suspended)
    log_admin_action(
        user,
        "suspend_user" if is_suspended else "reactivate_user",
        "profiles",
        profile_id,
        previous_state={"is_suspended": not is_suspended},
        new_state={"is_suspended": is_suspended},
    )


def update_user_role(user: AuthenticatedUser, profile_id: str, new_role: str) -> None:
    # Reads the real current role right before overwriting it, rather than trusting whatever
    # role the client's (possibly stale) cached profile object claims was "previous" — a small
    # correctness fix over the original frontend implementation, audit-log content only, not a
    # security boundary.
    previous_role = repo.fetch_profile_role(user.access_token, profile_id)
    repo.update_profile_role(user.access_token, profile_id, new_role)
    log_admin_action(
        user,
        "change_role",
        "profiles",
        profile_id,
        previous_state={"role": previous_role},
        new_state={"role": new_role},
    )


def fetch_reports(user: AuthenticatedUser, status: str | None) -> list[dict]:
    return repo.fetch_reports(user.access_token, status)


def resolve_report(user: AuthenticatedUser, report_id: str, notes: str | None) -> None:
    repo.resolve_report(user.access_token, report_id, "resolved", user.id, notes)
    log_admin_action(user, "resolve_report", "reports", report_id, new_state={"status": "resolved"}, metadata={"notes": notes})


def dismiss_report(user: AuthenticatedUser, report_id: str, notes: str | None) -> None:
    repo.resolve_report(user.access_token, report_id, "dismissed", user.id, notes)
    log_admin_action(user, "dismiss_report", "reports", report_id, new_state={"status": "dismissed"}, metadata={"notes": notes})


def fetch_audit_logs(user: AuthenticatedUser, target_entity: str | None, actor_id: str | None) -> list[dict]:
    return repo.fetch_audit_logs(user.access_token, target_entity, actor_id)


def fetch_all_orders(user: AuthenticatedUser) -> list[dict]:
    return orders_repo.fetch_all_orders(user.access_token)
