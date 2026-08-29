from fastapi import APIRouter, Depends

from ....core.auth import AuthenticatedUser, require_authenticated_user
from ....schemas.profile import ProfileUpdateRequest
from ....services import profile_service as service

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])


@router.patch("", status_code=204)
async def update_profile(
    request: ProfileUpdateRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> None:
    # exclude_unset so an omitted field is left alone rather than overwritten to NULL — matches
    # the frontend's existing partial-update semantics (ProfileUpdateInput's all-optional fields).
    service.update_profile(user, request.model_dump(exclude_unset=True))
