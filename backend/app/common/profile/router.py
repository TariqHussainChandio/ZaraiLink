from fastapi import APIRouter, Depends

from app.auth.dependencies import AuthenticatedUser, get_current_user_any_status
from app.common.profile import service
from app.common.profile.schemas import DeleteAccountRequest, ProfileUpdateRequest
from app.common.schemas import RequiredDocument

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


@router.get("/application/required-documents", response_model=list[RequiredDocument])
async def list_required_documents(user: AuthenticatedUser = Depends(get_current_user_any_status)) -> list[dict]:
    """The documents the caller's role is asked for (SRDS §7, §10), as an admin last set them; empty for a role
    that does not apply."""
    return await service.fetch_required_documents(user)


@router.post("/application/submit", status_code=204)
async def submit_application(user: AuthenticatedUser = Depends(get_current_user_any_status)) -> None:
    """A dealer or expert sends their application for review, the first time or after a rejection (SRDS §8, §11;
    D10). The database checks it is complete first (submit_application()); `application_incomplete` names what is
    missing. Open to a pending or rejected account by design: it is how one becomes approved."""
    await service.submit_application(user)
