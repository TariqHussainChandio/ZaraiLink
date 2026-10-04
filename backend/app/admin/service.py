import asyncio

from app.admin import repository as repo
from app.auth.dependencies import AuthenticatedUser, forget_profile
from app.common import account_status
from app.common.audit_log import log_admin_action
from app.common.errors import AppHTTPException
from app.common.notifications import service as notifications
from app.common.orders import service as orders_service
from app.dealer import service as dealer_service


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


async def fetch_all_profiles(
    user: AuthenticatedUser, role: str | None = None, account_status: str | None = None
) -> list[dict]:
    return await repo.fetch_all_profiles(user.access_token, role, account_status)


async def set_profile_suspended(user: AuthenticatedUser, profile_id: str, is_suspended: bool) -> None:
    await repo.set_profile_suspended(user.access_token, profile_id, is_suspended)
    forget_profile(profile_id)
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
    forget_profile(profile_id)
    await log_admin_action(
        user,
        "change_role",
        "profiles",
        profile_id,
        previous_state={"role": previous_role},
        new_state={"role": new_role},
    )


async def decide_dealer_application(
    user: AuthenticatedUser, profile_id: str, decision: account_status.Decision, reason: str | None
) -> dict:
    """A dealer's application from User Management. Experts are decided from their verification route, which shows
    their application; this route refuses them so each role has one place where it is reviewed."""
    role = await repo.fetch_profile_role(user.access_token, profile_id)
    if role is None:
        raise AppHTTPException(404, "No such account", "not_found")
    if role != "dealer":
        raise AppHTTPException(409, "Only a dealer is decided here; experts are reviewed in Approvals", "conflict")
    result = await account_status.decide(user, profile_id, decision, reason)
    # After the commit: the email reports a decision that has happened (SRDS §8, §9), and the admin is told whether
    # it went out.
    result["email_delivered"] = await notifications.send_application_decision(user, profile_id, role, decision, reason)
    return result


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


# --- dealer applications (A3b; SRDS §8, §12). The dealer's tables belong to the dealer module, reached through its
# service; the decision stays on decide_dealer_application() above.


async def fetch_dealer_applications(user: AuthenticatedUser, status: str) -> list[dict]:
    return await dealer_service.fetch_applications_for_admin(user, status)


async def fetch_dealer_application(user: AuthenticatedUser, dealer_id: str) -> dict:
    return await dealer_service.fetch_application_for_admin(user, dealer_id)


async def dealer_document_url(user: AuthenticatedUser, dealer_id: str, document_id: str) -> str:
    return await dealer_service.document_url_for_admin(user, dealer_id, document_id)


# --- required documents (A3b; SRDS §7)


async def fetch_required_documents(user: AuthenticatedUser) -> list[dict]:
    return await repo.fetch_required_documents(user.access_token)


async def create_required_document(user: AuthenticatedUser, fields: dict) -> dict:
    return await repo.create_required_document(user.access_token, fields)


async def update_required_document(user: AuthenticatedUser, document_id: str, fields: dict) -> dict:
    if not fields:
        raise AppHTTPException(422, "Nothing to change", "validation_failed")
    return await repo.update_required_document(user.access_token, document_id, fields)
