import asyncio
from datetime import UTC, datetime, time, timedelta

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


# Audit action names are the SRDS §51 vocabulary (audit_event_names, 20261023080000_admin_moderation.sql); the
# database refuses any other name through the audit_logs.action foreign key (BR-15). The old fine-grained names are not
# kept in metadata here: each §51 name below already says the same thing, and the state diff carries the detail.


async def set_profile_suspended(user: AuthenticatedUser, profile_id: str, is_suspended: bool) -> None:
    await repo.set_profile_suspended(user.access_token, profile_id, is_suspended)
    forget_profile(profile_id)
    await log_admin_action(
        user,
        "user_suspended" if is_suspended else "user_reactivated",
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
        "user_role_changed",
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
        user, "report_resolved", "reports", report_id, new_state={"status": "resolved"}, metadata={"notes": notes}
    )


async def dismiss_report(user: AuthenticatedUser, report_id: str, notes: str | None) -> None:
    await repo.resolve_report(user.access_token, report_id, "dismissed", user.id, notes)
    await log_admin_action(
        user, "report_dismissed", "reports", report_id, new_state={"status": "dismissed"}, metadata={"notes": notes}
    )


async def fetch_audit_logs(
    user: AuthenticatedUser, target_entity: str | None, actor_id: str | None, action: str | None
) -> list[dict]:
    # The label comes from the one vocabulary table (SRDS §51), read once per request, so the audit screen shows the
    # same words as the database. The foreign key guarantees every action has a row; the name itself is the fallback
    # only if a row were hidden from the caller.
    logs, names = await asyncio.gather(
        repo.fetch_audit_logs(user.access_token, target_entity, actor_id, action),
        repo.fetch_audit_event_names(user.access_token),
    )
    labels = {row["name"]: row["label"] for row in names}
    return [{**log, "action_label": labels.get(log["action"], log["action"])} for log in logs]


async def fetch_audit_event_names(user: AuthenticatedUser) -> list[dict]:
    return await repo.fetch_audit_event_names(user.access_token)


async def fetch_queue_counts(user: AuthenticatedUser) -> dict:
    """The dashboard's moderation queues (SRDS §14), counted by admin_queue_counts() in one call. The function checks
    is_admin() itself, and runs with the admin's own token, so no count leaks to anyone else."""
    return await repo.fetch_queue_counts(user.access_token)


async def fetch_all_orders(user: AuthenticatedUser, status: str | None = None) -> list[dict]:
    return await orders_service.fetch_all_orders(user, status)


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


# --- AI activity (A6; SRDS §37). Simple on purpose: the rows of the window are fetched and counted here, so the
# numbers need no view or function of their own and every read stays under the admin's row-level security.

AI_ACTIVITY_WINDOW_DAYS = 30
# The same line the AI report draws: below it the farmer is told the result is uncertain and to ask an expert (BR-13).
LOW_CONFIDENCE_THRESHOLD = 0.60


def _best_confidence(case: dict) -> float | None:
    scores = [float(p["confidence_score"]) for p in case.get("disease_predictions") or []]
    return max(scores) if scores else None


async def fetch_ai_activity(user: AuthenticatedUser) -> dict:
    today = datetime.now(UTC).date()
    first_day = today - timedelta(days=AI_ACTIVITY_WINDOW_DAYS - 1)
    since = datetime.combine(first_day, time.min, tzinfo=UTC).isoformat()
    cases, referrals = await asyncio.gather(
        repo.fetch_disease_cases_since(user.access_token, since),
        repo.fetch_ai_referrals_since(user.access_token, since),
    )

    days = {
        (first_day + timedelta(days=offset)).isoformat(): {"scans": 0, "failed": 0, "low_confidence": 0, "referrals": 0}
        for offset in range(AI_ACTIVITY_WINDOW_DAYS)
    }
    failed = predicted = low_confidence = 0
    for case in cases:
        day = days.get(_utc_day(case["created_at"]))
        if day is None:
            continue
        day["scans"] += 1
        if case.get("status") == "failed":
            failed += 1
            day["failed"] += 1
            continue
        confidence = _best_confidence(case)
        if case.get("status") == "predicted" or confidence is not None:
            predicted += 1
            if confidence is not None and confidence < LOW_CONFIDENCE_THRESHOLD:
                low_confidence += 1
                day["low_confidence"] += 1
    referral_count = 0
    for consultation in referrals:
        day = days.get(_utc_day(consultation["created_at"]))
        if day is not None:
            referral_count += 1
            day["referrals"] += 1

    scans = sum(day["scans"] for day in days.values())
    return {
        "window_days": AI_ACTIVITY_WINDOW_DAYS,
        "since": since,
        "scans": scans,
        "failed": failed,
        "predicted": predicted,
        "low_confidence": low_confidence,
        "low_confidence_share": round(low_confidence / predicted, 4) if predicted else 0.0,
        "referrals": referral_count,
        "days": [{"date": date, **counts} for date, counts in days.items()],
    }


def _utc_day(timestamp: str) -> str:
    return datetime.fromisoformat(timestamp).astimezone(UTC).date().isoformat()


# --- disease knowledge base (A6; SRDS §37). The advisory text the AI report shows. The table's policies already demand
# is_admin_aal2() for a write; the routes demand it too so the refusal is a clear 403 before any query. Every write is
# audited as "AI Configuration Changed" (SRDS §51, BR-15) by the table's trigger, not here (see below).


async def fetch_disease_knowledge(user: AuthenticatedUser) -> list[dict]:
    return await repo.fetch_disease_knowledge(user.access_token)


async def fetch_disease_knowledge_entry(user: AuthenticatedUser, class_label: str) -> dict:
    entry = await repo.fetch_disease_knowledge_entry(user.access_token, class_label)
    if entry is None:
        raise AppHTTPException(404, "No such disease class", "not_found")
    return entry


async def update_disease_knowledge(user: AuthenticatedUser, class_label: str, fields: dict) -> dict:
    if not fields:
        raise AppHTTPException(422, "Nothing to change", "validation_failed")
    previous = await fetch_disease_knowledge_entry(user, class_label)
    changes = dict(fields)
    # Reviewed text that is edited is no longer the text that was reviewed: it goes back to the queue, and the report
    # shows it as unreviewed until an admin signs it off again.
    if previous["review_status"] == "reviewed":
        changes.update({"review_status": "pending_review", "reviewed_by": None, "reviewed_at": None})
    # The audit row is written atomically by the database trigger audit_disease_knowledge (20261022080000).
    return await repo.update_disease_knowledge(user.access_token, class_label, changes)


async def review_disease_knowledge(user: AuthenticatedUser, class_label: str) -> dict:
    await fetch_disease_knowledge_entry(user, class_label)  # a missing class is a 404 before any write
    # The audit row is written atomically by the database trigger audit_disease_knowledge (20261022080000).
    return await repo.update_disease_knowledge(
        user.access_token,
        class_label,
        {"review_status": "reviewed", "reviewed_by": user.id, "reviewed_at": datetime.now(UTC).isoformat()},
    )
