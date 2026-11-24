"""Expert API routes: the expert's application and documents, admin review, and the public directory."""

from fastapi import APIRouter, Depends

from app.auth.dependencies import (
    AuthenticatedUser,
    require_admin,
    require_expert_any_status,
)
from app.common.pagination import Page, paginate
from app.common.schemas import AccountDecision, ApplicationDocument, RegisterDocumentRequest, SignedUrl
from app.expert import service
from app.expert.schemas import (
    Expert,
    ExpertForAdmin,
    ExpertProfileInput,
    ReviewVerificationRequest,
)

router = APIRouter(prefix="/api/v1/expert", tags=["expert"])

# Route order matters here: literal paths (/application, /me, /admin, /admin/{id}/...) must be
# registered before the generic /{expert_id} catch-all, or FastAPI would try to match e.g.
# "admin" as an expert_id for that route instead.


@router.post("/application", response_model=Expert)
async def create_application(
    request: ExpertProfileInput,
    user: AuthenticatedUser = Depends(require_expert_any_status),
) -> dict:
    """Starts the expert's application with their professional details (a draft). Documents are attached next, and
    POST /profile/application/submit sends it for review (A3b)."""
    return await service.create_application(user, request)


# PATCH /application: update the caller's expert profile.
@router.patch("/application", response_model=Expert)
async def update_profile(
    request: ExpertProfileInput,
    user: AuthenticatedUser = Depends(require_expert_any_status),
) -> dict:
    return await service.update_profile(user, request)


# GET /me: the caller's own expert profile, whatever its status.
@router.get("/me", response_model=Expert | None)
async def get_my_profile(user: AuthenticatedUser = Depends(require_expert_any_status)) -> dict | None:
    return await service.fetch_my_profile(user)


# GET /application/documents: the caller's uploaded application documents.
@router.get("/application/documents", response_model=list[ApplicationDocument])
async def list_my_documents(user: AuthenticatedUser = Depends(require_expert_any_status)) -> list[dict]:
    return await service.fetch_my_documents(user)


@router.post("/application/documents", response_model=ApplicationDocument, status_code=201)
async def add_my_document(
    request: RegisterDocumentRequest, user: AuthenticatedUser = Depends(require_expert_any_status)
) -> dict:
    """Attaches a file the expert uploaded to `expert-documents/<their id>/...`."""
    return await service.add_my_document(user, request.storage_path, request.file_name, request.required_document_id)


# DELETE a document from the caller's application.
@router.delete("/application/documents/{document_id}", status_code=204)
async def remove_my_document(document_id: str, user: AuthenticatedUser = Depends(require_expert_any_status)) -> None:
    await service.remove_my_document(user, document_id)


# GET /admin: experts for the admin to review, filtered by status (admins only).
@router.get("/admin", response_model=list[ExpertForAdmin])
async def list_experts_for_admin(
    status: str | None = None,
    user: AuthenticatedUser = Depends(require_admin),
    page: Page = Depends(paginate),
) -> list[dict]:
    return page.finish(await service.fetch_experts_for_admin(user, status))


# PATCH: an admin approves or rejects an expert application.
@router.patch("/admin/{expert_id}/verification", response_model=AccountDecision)
async def review_verification(
    expert_id: str,
    request: ReviewVerificationRequest,
    user: AuthenticatedUser = Depends(require_admin),
) -> dict:
    return await service.review_verification(user, expert_id, request.decision, request.notes)


# GET: a short-lived signed link to one document (admins only).
@router.get("/admin/{expert_id}/documents/{document_id}/url", response_model=SignedUrl)
async def get_document_url(
    expert_id: str,
    document_id: str,
    user: AuthenticatedUser = Depends(require_admin),
) -> SignedUrl:
    return SignedUrl(url=await service.document_url_for_admin(user, expert_id, document_id))


# GET /admin/{id}: one expert with the admin details.
@router.get("/admin/{expert_id}", response_model=ExpertForAdmin)
async def get_expert_for_admin(
    expert_id: str,
    user: AuthenticatedUser = Depends(require_admin),
) -> dict:
    return await service.fetch_expert_for_admin_by_id(user, expert_id)


# Public: `experts`/`expert_specializations` grant `select` to `anon` — browsing experts and
# viewing one's profile doesn't require login (matches ExpertListScreen/ExpertProfileScreen).


# GET: the public expert directory, optionally by specialisation.
@router.get("", response_model=list[Expert])
async def list_experts(specialization: str | None = None, page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_experts(specialization))


# GET /{id}: one expert's public profile.
@router.get("/{expert_id}", response_model=Expert)
async def get_expert(expert_id: str) -> dict:
    return await service.fetch_expert_by_id(expert_id)
