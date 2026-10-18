from typing import Literal

from pydantic import BaseModel, Field

# SRDS §34 / plan A6: below this confidence the report says the result is uncertain and leans harder on the expert
# route (BR-13). 0.60 is the plan's band edge, not a calibrated figure; recalibrate it when the model is retrained.
LOW_CONFIDENCE_THRESHOLD = 0.60

ReviewStatus = Literal["pending_review", "reviewed"]
CaseStatus = Literal["pending", "predicted", "failed"]


class DiseaseKnowledge(BaseModel):
    """One row of `disease_knowledge`: the advisory text for one model class (SRDS §34-§35)."""

    class_label: str
    crop: str
    disease: str
    is_healthy: bool
    symptoms: list[str] = []
    treatment: list[str] = []
    precautions: list[str] = []
    advisory: str
    review_status: ReviewStatus
    reviewed_at: str | None = None
    updated_at: str


class DiseaseReport(BaseModel):
    """The AI report contract (plan A6): what the farmer and the assigned expert see for one prediction.

    The text comes from `disease_knowledge`, never from code, so an agronomist's review changes what is shown without a
    release. `review_status` says whether that text has been reviewed yet, and `disclaimer` is on every report
    because BR-13 makes every AI result advisory and routes it to an expert."""

    predicted_disease: str
    class_label: str
    crop: str
    disease: str
    confidence_score: float
    confidence_band: Literal["confident", "low"]
    is_healthy: bool
    symptoms: list[str] = []
    treatment: list[str] = []
    precautions: list[str] = []
    advisory: str
    review_status: ReviewStatus
    disclaimer: str
    model_version: str | None = None
    created_at: str


class PredictRequest(BaseModel):
    disease_case_id: str


class PredictionRecord(BaseModel):
    """A stored `disease_predictions` row, kept as history."""

    id: str
    disease_case_id: str
    predicted_disease: str
    confidence_score: float
    description: str | None = None
    recommended_actions: list[str] = []
    model_version: str | None = None
    created_at: str


class PredictResponse(PredictionRecord):
    # The flat fields above stay for the app's current result screen until the frontend ai lane moves to `report`.
    report: DiseaseReport


# Security fix C2 (SSRF): the client used to hand the backend an arbitrary `image_url` that
# predict() fetched server-side. It now hands only a path inside the disease-images bucket,
# shaped exactly like the frontend's own upload path (`<uploader-id>/<timestamp>-<rand>.<ext>`),
# never a URL — the server resolves it through the Storage API, so it never makes an outbound
# request to a client-chosen host. The pattern rejects `..`, a leading `/`, and anything that
# isn't a single folder segment plus a plain filename; disease_service.create_case additionally
# checks the folder segment equals the caller's own user id (a regex alone can't express that).
class CreateCaseRequest(BaseModel):
    crop_id: str | None = None
    storage_path: str = Field(pattern=r"^[A-Za-z0-9-]+/[A-Za-z0-9][A-Za-z0-9._-]*$", max_length=255)


class CropRef(BaseModel):
    id: str
    name: str


class DiseaseCaseResponse(BaseModel):
    id: str
    user_id: str
    crop_id: str | None
    # A signed, time-limited URL minted fresh on every response (see disease_service), never the
    # stored path itself — the bucket is private, so this is the only way a client ever displays
    # the image. None when the photo object is gone from storage; the case still loads.
    image_signed_url: str | None
    created_at: str


class DiseaseCaseWithPredictionResponse(DiseaseCaseResponse):
    crop: CropRef | None = None
    prediction: PredictionRecord | None = None
    # The case's own processing state (pending, then predicted or failed), written only by the backend.
    status: CaseStatus = "pending"
    failure_reason: str | None = None
    report: DiseaseReport | None = None
