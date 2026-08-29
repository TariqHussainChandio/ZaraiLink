from fastapi import APIRouter, Depends

from ....core.auth import AuthenticatedUser, require_authenticated_user
from ....schemas.notifications import Notification, UnreadCountResponse
from ....services import notifications_service as service

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("", response_model=list[Notification])
async def list_notifications(user: AuthenticatedUser = Depends(require_authenticated_user)) -> list[dict]:
    return service.fetch_notifications(user)


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(user: AuthenticatedUser = Depends(require_authenticated_user)) -> UnreadCountResponse:
    return UnreadCountResponse(count=service.fetch_unread_count(user))


@router.patch("/{notification_id}/read", status_code=204)
async def mark_read(
    notification_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> None:
    service.mark_read(user, notification_id)


@router.patch("/read-all", status_code=204)
async def mark_all_read(user: AuthenticatedUser = Depends(require_authenticated_user)) -> None:
    service.mark_all_read(user)
