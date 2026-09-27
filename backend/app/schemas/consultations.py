from typing import Literal

from pydantic import BaseModel

ConsultationPriority = Literal["low", "medium", "high"]
ConsultationStatus = Literal[
    "requested", "accepted", "in_progress", "resolved", "closed", "rejected", "cancelled", "expired"
]


class ConsultationProfileRef(BaseModel):
    id: str
    full_name: str
    avatar_url: str | None = None


class CropRef(BaseModel):
    id: str
    name: str


class ConsultationListingRef(BaseModel):
    id: str
    title: str
    price: float
    unit: str


class Consultation(BaseModel):
    id: str
    user_id: str
    expert_id: str | None
    subject: str
    crop_id: str | None
    problem_description: str | None
    farm_id: str | None
    images: list[str]
    priority: ConsultationPriority
    status: ConsultationStatus
    created_at: str
    updated_at: str


class ConsultationWithRelations(Consultation):
    user: ConsultationProfileRef | None = None
    expert: ConsultationProfileRef | None = None
    crop: CropRef | None = None


class CreateConsultationRequest(BaseModel):
    expert_id: str
    subject: str
    crop_id: str | None = None
    problem_description: str = ""
    farm_id: str | None = None
    images: list[str] = []
    priority: ConsultationPriority = "medium"


class UpdateImagesRequest(BaseModel):
    images: list[str]


class UpdateStatusRequest(BaseModel):
    to: ConsultationStatus


class ConsultationMessage(BaseModel):
    id: str
    consultation_id: str
    sender_id: str
    body: str
    attachments: list[str]
    recommended_listing_id: str | None
    created_at: str


class ConsultationMessageWithListing(ConsultationMessage):
    recommended_listing: ConsultationListingRef | None = None


class SendConsultationMessageRequest(BaseModel):
    body: str
    attachments: list[str] = []
    recommended_listing_id: str | None = None
