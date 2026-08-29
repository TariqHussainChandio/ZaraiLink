from fastapi import APIRouter, Depends

from ....core.auth import AuthenticatedUser, require_admin, require_expert
from ....schemas.expert import (
    DocumentUrlResponse,
    ExpertProfileInput,
    ReviewVerificationRequest,
    SubmitApplicationRequest,
)
from ....services import expert_service as service

router = APIRouter(prefix="/api/v1/expert", tags=["expert"])

# Route order matters here: literal paths (/application, /me, /admin, /admin/{id}/...) must be
# registered before the generic /{expert_id} catch-all, or FastAPI would try to match e.g.
# "admin" as an expert_id for that route instead.


@router.post("/application")
async def submit_application(
    request: SubmitApplicationRequest,
    user: AuthenticatedUser = Depends(require_expert),
) -> dict:
    return service.submit_application(user, request.profile, request.document_path)


@router.patch("/application")
async def update_profile(
    request: ExpertProfileInput,
    user: AuthenticatedUser = Depends(require_expert),
) -> dict:
    return service.update_profile(user, request)


@router.get("/me")
async def get_my_profile(user: AuthenticatedUser = Depends(require_expert)) -> dict | None:
    return service.fetch_my_profile(user)


@router.get("/admin")
async def list_experts_for_admin(
    status: str | None = None,
    user: AuthenticatedUser = Depends(require_admin),
) -> list[dict]:
    return service.fetch_experts_for_admin(user, status)


@router.patch("/admin/{expert_id}/verification", status_code=204)
async def review_verification(
    expert_id: str,
    request: ReviewVerificationRequest,
    user: AuthenticatedUser = Depends(require_admin),
) -> None:
    service.review_verification(user, expert_id, request.verification_id, request.decision, request.notes)


@router.get("/admin/{expert_id}/document-url", response_model=DocumentUrlResponse)
async def get_document_url(
    expert_id: str,
    user: AuthenticatedUser = Depends(require_admin),
) -> DocumentUrlResponse:
    return DocumentUrlResponse(url=service.get_document_url(user, expert_id))


@router.get("/admin/{expert_id}")
async def get_expert_for_admin(
    expert_id: str,
    user: AuthenticatedUser = Depends(require_admin),
) -> dict:
    return service.fetch_expert_for_admin_by_id(user, expert_id)


# Public: `experts`/`expert_specializations` grant `select` to `anon` — browsing experts and
# viewing one's profile doesn't require login (matches ExpertListScreen/ExpertProfileScreen).


@router.get("")
async def list_experts(specialization: str | None = None) -> list[dict]:
    return service.fetch_experts(specialization)


@router.get("/{expert_id}")
async def get_expert(expert_id: str) -> dict:
    return service.fetch_expert_by_id(expert_id)
