from typing import Literal

from pydantic import BaseModel

from app.ai.schemas import DiseaseReport

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
    # The farmer's own AI disease case this consultation asks about (SRDS §34): the expert reviews that result.
    disease_case_id: str | None = None
    # Why an admin closed or cancelled this consultation (SRDS §14). Only an admin writes it, and only together with
    # that status change (guard_consultations_update, 20261023080000_admin_moderation.sql); None otherwise.
    moderation_reason: str | None = None
    created_at: str
    updated_at: str


class ConsultationWithRelations(Consultation):
    user: ConsultationProfileRef | None = None
    expert: ConsultationProfileRef | None = None
    crop: CropRef | None = None


class AiCaseSummary(BaseModel):
    """The AI result attached to a consultation (SRDS §34-§35). Advisory only (BR-13): the expert's own answer is a
    separate `ConsultationAssessment`, never written into this report."""

    case_id: str
    image_url: str | None = None
    report: DiseaseReport


class ConsultationDetail(ConsultationWithRelations):
    # Only the single-consultation read carries the report: it costs a signed URL and a second query, too much for
    # every row of a list. None when no case is attached or the AI side could not be read (SRDS §53.39).
    ai_report: AiCaseSummary | None = None


class CreateConsultationRequest(BaseModel):
    expert_id: str
    subject: str
    crop_id: str | None = None
    problem_description: str = ""
    farm_id: str | None = None
    images: list[str] = []
    priority: ConsultationPriority = "medium"
    # Optional: the requester's own disease case. The database refuses someone else's case (42501).
    disease_case_id: str | None = None


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


# The expert's answer to the AI result (SRDS §35-§36, BR-13): agree with it, correct it, add a diagnosis it missed, or
# ask the farmer for more information.
AssessmentVerdict = Literal["agree", "correct", "additional_diagnosis", "request_information"]


class ConsultationAssessment(BaseModel):
    """The Expert Assessment, stored apart from the AI report and always labelled as the expert's. Append-only: a later
    assessment supersedes an earlier one, nothing is edited."""

    id: str
    consultation_id: str
    expert_id: str
    verdict: AssessmentVerdict
    diagnosis: str | None
    recommendations: str | None
    created_at: str


class ConsultationAssessmentInput(BaseModel):
    verdict: AssessmentVerdict
    # Required by the database for "correct" and "additional_diagnosis" (check constraint, answered as a 422).
    diagnosis: str | None = None
    recommendations: str | None = None


# Admin moderation (SRDS §14): an admin may close or cancel a consultation that is still open, always with a reason the
# participants can read. The database maps the action to the status and refuses it without a reason (23514).
ModerationAction = Literal["close", "cancel"]


class ModerateConsultationRequest(BaseModel):
    action: ModerationAction
    reason: str
