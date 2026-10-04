from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.common.schemas import Location

Specialization = Literal[
    "crop_management",
    "plant_diseases",
    "pest_management",
    "fertilizer_management",
    "irrigation",
    "soil_management",
    "crop_nutrition",
    "general_agriculture",
]
VerificationStatus = Literal["pending", "approved", "rejected", "suspended"]


class ExpertProfileInput(BaseModel):
    qualifications: str
    degree: str
    experience: str
    professional_description: str
    contact: str
    country: str | None = None
    province: str | None = None
    city: str | None = None
    specializations: list[Specialization]


class SubmitApplicationRequest(BaseModel):
    profile: ExpertProfileInput
    document_path: str | None = None


class ReviewVerificationRequest(BaseModel):
    """An admin's decision on a pending expert application (SRDS §11, §12). Suspension is no longer a decision: it
    is the account's suspension (PATCH /admin/users/{id}/suspend), like every other role's. A rejection carries the
    reason the expert reads on their Application Status screen."""

    decision: Literal["approved", "rejected"]
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _rejection_has_reason(self) -> "ReviewVerificationRequest":
        if self.decision == "rejected" and len((self.notes or "").strip()) < 10:
            raise ValueError("A rejection needs a reason of at least 10 characters")
        return self


class DocumentUrlResponse(BaseModel):
    url: str | None


# ---- response models (P7 7A)


class ExpertProfileRef(BaseModel):
    id: str
    full_name: str
    avatar_url: str | None = None


class ExpertSpecializationRef(BaseModel):
    specialization: Specialization


class ExpertVerification(BaseModel):
    id: str
    notes: str | None = None
    decision: VerificationStatus | None = None
    created_at: str
    decision_at: str | None = None
    document_url: str | None = None


class Expert(BaseModel):
    id: str
    qualifications: str | None = None
    degree: str | None = None
    experience: str | None = None
    professional_description: str | None = None
    location: Location | None = None
    contact: str | None = None
    verification_status: VerificationStatus
    created_at: str
    updated_at: str
    profile: ExpertProfileRef | None = None
    expert_specializations: list[ExpertSpecializationRef] = []


class ExpertForAdmin(Expert):
    """The admin reads add the verification history."""

    expert_verifications: list[ExpertVerification] = []
