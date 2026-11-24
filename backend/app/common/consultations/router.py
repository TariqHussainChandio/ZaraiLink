"""Consultation routes: request an expert, chat, assess, change status and admin moderation."""

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import AuthenticatedUser, require_admin, require_authenticated_user, require_farmer
from app.common.consultations import service
from app.common.consultations.schemas import (
    Consultation,
    ConsultationAssessment,
    ConsultationAssessmentInput,
    ConsultationDetail,
    ConsultationMessageWithListing,
    ConsultationStatus,
    ConsultationWithRelations,
    CreateConsultationRequest,
    ModerateConsultationRequest,
    SendConsultationMessageRequest,
    UpdateImagesRequest,
    UpdateStatusRequest,
)
from app.common.pagination import Page, paginate

router = APIRouter(prefix="/api/v1/consultations", tags=["consultations"])


# Only a farmer asks an expert (D20, 2026-11-22): buyers and dealers have no expert advisory. The database refuses the
# same insert for anyone else (consultations_insert_requester), so a call that skips this API is refused too.
@router.post("", response_model=Consultation)
async def create_request(
    request: CreateConsultationRequest,
    user: AuthenticatedUser = Depends(require_farmer),
) -> dict:
    fields = {
        "expert_id": request.expert_id,
        "subject": request.subject,
        "crop_id": request.crop_id,
        "problem_description": request.problem_description or None,
        "farm_id": request.farm_id,
        "images": request.images,
        "priority": request.priority,
        "disease_case_id": request.disease_case_id,
    }
    return await service.create_request(user, fields)


# Lists the signed-in user's own consultation requests.
@router.get("/mine", response_model=list[ConsultationWithRelations])
async def list_for_user(
    user: AuthenticatedUser = Depends(require_authenticated_user), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_for_user(user))


# Lists the consultations assigned to the signed-in expert.
@router.get("/assigned", response_model=list[ConsultationWithRelations])
async def list_for_expert(
    user: AuthenticatedUser = Depends(require_authenticated_user), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_for_expert(user))


# Returns one consultation by id, with its AI case report.
@router.get("/{consultation_id}", response_model=ConsultationDetail)
async def get_consultation(consultation_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)) -> dict:
    return await service.fetch_by_id(user, consultation_id)


# Replaces the photo list of a consultation.
@router.patch("/{consultation_id}/images", status_code=204)
async def update_images(
    consultation_id: str,
    request: UpdateImagesRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> None:
    await service.update_images(user, consultation_id, request.images)


# Moves a consultation to a new status.
@router.patch("/{consultation_id}/status", status_code=204)
async def update_status(
    consultation_id: str,
    request: UpdateStatusRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> None:
    await service.update_status(user, consultation_id, request.to)


# Lists the messages of a consultation.
@router.get("/{consultation_id}/messages", response_model=list[ConsultationMessageWithListing])
async def list_messages(
    consultation_id: str,
    user: AuthenticatedUser = Depends(require_authenticated_user),
    page: Page = Depends(paginate),
) -> list[dict]:
    return page.finish(await service.fetch_messages(user, consultation_id))


# Sends a message in a consultation.
@router.post("/{consultation_id}/messages", response_model=ConsultationMessageWithListing)
async def send_message(
    consultation_id: str,
    request: SendConsultationMessageRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict:
    return await service.send_message(
        user, consultation_id, request.body, request.attachments, request.recommended_listing_id
    )


# Lists the expert assessments of a consultation.
@router.get("/{consultation_id}/assessments", response_model=list[ConsultationAssessment])
async def list_assessments(
    consultation_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> list[dict]:
    # Newest first: the latest assessment is the expert's current answer (SRDS §36).
    return await service.fetch_assessments(user, consultation_id)


# Adds an expert assessment to a consultation.
@router.post("/{consultation_id}/assessments", response_model=ConsultationAssessment, status_code=201)
async def create_assessment(
    consultation_id: str,
    request: ConsultationAssessmentInput,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict:
    fields = {
        "verdict": request.verdict,
        "diagnosis": (request.diagnosis or "").strip() or None,
        "recommendations": (request.recommendations or "").strip() or None,
    }
    return await service.create_assessment(user, consultation_id, fields)


# Admin oversight of consultations (SRDS §14): a second router so the admin's routes sit under /api/v1/admin with the
# rest of the admin surface, while the code stays with the consultation module that owns the table. Reads and the
# moderation write need the admin role (no second factor, D19).
admin_router = APIRouter(prefix="/api/v1/admin/consultations", tags=["admin"])


# Admin: lists consultations, filtered by status and age.
@admin_router.get("", response_model=list[ConsultationWithRelations])
async def admin_list(
    status: ConsultationStatus | None = None,
    # At most a century: further back than year 1 overflows the date arithmetic and answered 500 (found by the
    # schemathesis smoke test with 739942); past the cap the caller now gets a 422.
    older_than_days: int | None = Query(default=None, ge=0, le=36500),
    user: AuthenticatedUser = Depends(require_admin),
    page: Page = Depends(paginate),
) -> list[dict]:
    return page.finish(await service.fetch_for_admin(user, status, older_than_days))


# Admin: returns one consultation.
@admin_router.get("/{consultation_id}", response_model=ConsultationDetail)
async def admin_get(consultation_id: str, user: AuthenticatedUser = Depends(require_admin)) -> dict:
    return await service.fetch_by_id(user, consultation_id)


# Admin: closes or cancels a consultation, with a reason.
@admin_router.patch("/{consultation_id}/moderate", response_model=ConsultationDetail)
async def admin_moderate(
    consultation_id: str,
    request: ModerateConsultationRequest,
    user: AuthenticatedUser = Depends(require_admin),
) -> dict:
    return await service.moderate(user, consultation_id, request.action, request.reason)
