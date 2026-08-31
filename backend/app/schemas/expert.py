from typing import Literal

from pydantic import BaseModel

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
    verification_id: str
    decision: VerificationStatus
    notes: str | None = None


class DocumentUrlResponse(BaseModel):
    url: str | None
