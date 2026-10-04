from fastapi import APIRouter, Depends

from app.auth.dependencies import AuthenticatedUser, get_current_user_any_status
from app.common.profile import service
from app.common.profile.schemas import DeleteAccountRequest, ProfileUpdateRequest

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])


@router.patch("", status_code=204)
async def update_profile(
    request: ProfileUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user_any_status),
) -> None:
    # exclude_unset so an omitted field is left alone rather than overwritten to NULL — matches
    # the frontend's existing partial-update semantics (ProfileUpdateInput's all-optional fields).
    await service.update_profile(user, request.model_dump(exclude_unset=True))


@router.delete("/me", status_code=204)
async def delete_own_account(
    request: DeleteAccountRequest,
    user: AuthenticatedUser = Depends(get_current_user_any_status),
) -> None:
    await service.delete_own_account(user, request.password)


@router.post("/application/resubmit", status_code=204)
async def resubmit_application(user: AuthenticatedUser = Depends(get_current_user_any_status)) -> None:
    """A rejected dealer or expert sends their application back for review (D10). Open to a pending or rejected
    account by design: it is the one thing a rejected applicant does."""
    await service.resubmit_application(user)
