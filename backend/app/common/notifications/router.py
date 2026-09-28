from fastapi import APIRouter, Depends

from app.auth.dependencies import AuthenticatedUser, require_authenticated_user
from app.common.notifications import service
from app.common.notifications.schemas import Notification, UnreadCountResponse
from app.common.pagination import Page, paginate

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("", response_model=list[Notification])
async def list_notifications(
    user: AuthenticatedUser = Depends(require_authenticated_user), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_notifications(user))


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(user: AuthenticatedUser = Depends(require_authenticated_user)) -> UnreadCountResponse:
    return UnreadCountResponse(count=await service.fetch_unread_count(user))


@router.patch("/{notification_id}/read", status_code=204)
async def mark_read(notification_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)) -> None:
    await service.mark_read(user, notification_id)


@router.patch("/read-all", status_code=204)
async def mark_all_read(user: AuthenticatedUser = Depends(require_authenticated_user)) -> None:
    await service.mark_all_read(user)
