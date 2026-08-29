from fastapi import APIRouter, Depends

from ....core.auth import AuthenticatedUser, require_authenticated_user
from ....schemas.consultations import (
    Consultation,
    ConsultationMessageWithListing,
    ConsultationWithRelations,
    CreateConsultationRequest,
    SendConsultationMessageRequest,
    UpdateImagesRequest,
    UpdateStatusRequest,
)
from ....services import consultations_service as service

router = APIRouter(prefix="/api/v1/consultations", tags=["consultations"])


@router.post("", response_model=Consultation)
async def create_request(
    request: CreateConsultationRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict:
    fields = {
        "expert_id": request.expert_id,
        "subject": request.subject,
        "crop_id": request.crop_id,
        "problem_description": request.problem_description or None,
        "farm_id": request.farm_id,
        "images": request.images,
        "priority": request.priority,
    }
    return service.create_request(user, fields)


@router.get("/mine", response_model=list[ConsultationWithRelations])
async def list_for_user(user: AuthenticatedUser = Depends(require_authenticated_user)) -> list[dict]:
    return service.fetch_for_user(user)


@router.get("/assigned", response_model=list[ConsultationWithRelations])
async def list_for_expert(user: AuthenticatedUser = Depends(require_authenticated_user)) -> list[dict]:
    return service.fetch_for_expert(user)


@router.get("/{consultation_id}", response_model=ConsultationWithRelations)
async def get_consultation(
    consultation_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> dict:
    return service.fetch_by_id(user, consultation_id)


@router.patch("/{consultation_id}/images", status_code=204)
async def update_images(
    consultation_id: str,
    request: UpdateImagesRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> None:
    service.update_images(user, consultation_id, request.images)


@router.patch("/{consultation_id}/status", status_code=204)
async def update_status(
    consultation_id: str,
    request: UpdateStatusRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> None:
    service.update_status(user, consultation_id, request.to)


@router.get("/{consultation_id}/messages", response_model=list[ConsultationMessageWithListing])
async def list_messages(
    consultation_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> list[dict]:
    return service.fetch_messages(user, consultation_id)


@router.post("/{consultation_id}/messages", response_model=ConsultationMessageWithListing)
async def send_message(
    consultation_id: str,
    request: SendConsultationMessageRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict:
    return service.send_message(
        user, consultation_id, request.body, request.attachments, request.recommended_listing_id
    )
