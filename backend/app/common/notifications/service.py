from fastapi import HTTPException

from ..core.auth import AuthenticatedUser
from ..repositories import notifications_repository as repo


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
