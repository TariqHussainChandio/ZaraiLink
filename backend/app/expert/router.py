from fastapi import APIRouter, Depends

from app.auth.dependencies import (
    AuthenticatedUser,
    require_admin,
    require_admin_aal2,
    require_expert_any_status,
)
from app.common.pagination import Page, paginate
from app.expert import service
from app.expert.schemas import (
    DocumentUrlResponse,
    Expert,
    ExpertForAdmin,
    ExpertProfileInput,
    ReviewVerificationRequest,
    SubmitApplicationRequest,
)

router = APIRouter(prefix="/api/v1/expert", tags=["expert"])

# Route order matters here: literal paths (/application, /me, /admin, /admin/{id}/...) must be
# registered before the generic /{expert_id} catch-all, or FastAPI would try to match e.g.
# "admin" as an expert_id for that route instead.


@router.post("/application", response_model=Expert)
async def submit_application(
    request: SubmitApplicationRequest,
    user: AuthenticatedUser = Depends(require_expert_any_status),
) -> dict:
    return await service.submit_application(user, request.profile, request.document_path)


@router.patch("/application", response_model=Expert)
async def update_profile(
    request: ExpertProfileInput,
    user: AuthenticatedUser = Depends(require_expert_any_status),
) -> dict:
    return await service.update_profile(user, request)


@router.get("/me", response_model=Expert | None)
async def get_my_profile(user: AuthenticatedUser = Depends(require_expert_any_status)) -> dict | None:
    return await service.fetch_my_profile(user)


@router.get("/admin", response_model=list[ExpertForAdmin])
async def list_experts_for_admin(
    status: str | None = None,
    user: AuthenticatedUser = Depends(require_admin),
    page: Page = Depends(paginate),
) -> list[dict]:
    return page.finish(await service.fetch_experts_for_admin(user, status))


@router.patch("/admin/{expert_id}/verification", status_code=204)
async def review_verification(
    expert_id: str,
    request: ReviewVerificationRequest,
    user: AuthenticatedUser = Depends(require_admin_aal2),
) -> None:
    await service.review_verification(user, expert_id, request.decision, request.notes)


@router.get("/admin/{expert_id}/document-url", response_model=DocumentUrlResponse)
async def get_document_url(
    expert_id: str,
    user: AuthenticatedUser = Depends(require_admin),
) -> DocumentUrlResponse:
    return DocumentUrlResponse(url=await service.get_document_url(user, expert_id))


@router.get("/admin/{expert_id}", response_model=ExpertForAdmin)
async def get_expert_for_admin(
    expert_id: str,
    user: AuthenticatedUser = Depends(require_admin),
) -> dict:
    return await service.fetch_expert_for_admin_by_id(user, expert_id)


# Public: `experts`/`expert_specializations` grant `select` to `anon` — browsing experts and
# viewing one's profile doesn't require login (matches ExpertListScreen/ExpertProfileScreen).


@router.get("", response_model=list[Expert])
async def list_experts(specialization: str | None = None, page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_experts(specialization))


@router.get("/{expert_id}", response_model=Expert)
async def get_expert(expert_id: str) -> dict:
    return await service.fetch_expert_by_id(expert_id)
