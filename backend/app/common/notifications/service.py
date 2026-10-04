import logging

import httpx
from fastapi import HTTPException
from postgrest.exceptions import APIError
from pydantic import ValidationError
from supabase import AuthError

from app.auth.dependencies import AuthenticatedUser
from app.common.email import send_email
from app.common.notifications import repository as repo
from app.common.notifications.emails import application_decision

logger = logging.getLogger(__name__)


async def fetch_notifications(user: AuthenticatedUser) -> list[dict]:
    return await repo.fetch_notifications(user.access_token, user.id)


async def fetch_unread_count(user: AuthenticatedUser) -> int:
    return await repo.fetch_unread_count(user.access_token, user.id)


async def mark_read(user: AuthenticatedUser, notification_id: str) -> None:
    notification = await repo.get_notification(user.access_token, notification_id)
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    await repo.mark_read(user.access_token, notification_id)


async def mark_all_read(user: AuthenticatedUser) -> None:
    await repo.mark_all_read(user.access_token, user.id)


async def send_application_decision(
    user: AuthenticatedUser, profile_id: str, role: str, decision: str, reason: str | None
) -> bool:
    """Emails the applicant the decision an admin just made (SRDS §8, §9, §11). True once the mail server accepted it;
    False when email is off here, the account has no address, or the server refused, so the admin can be told."""
    try:
        email, full_name = await repo.fetch_recipient(user.access_token, profile_id)
    except (APIError, AuthError, httpx.HTTPError, ValidationError) as exc:
        # The decision is already committed; a failed lookup only means no email, which the admin is told. A user who
        # deleted their account is soft-deleted in Auth, and the client cannot read that record (A3b verification, N2).
        logger.warning("decision email not sent: recipient lookup failed (%s)", type(exc).__name__)
        return False
    if not email:
        return False
    message = application_decision(role, decision, full_name, email, reason)
    return await send_email(email, message.subject, message.text, message.html)
