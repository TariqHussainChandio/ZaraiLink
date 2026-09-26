from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    disease_case_id: str


class PredictResponse(BaseModel):
    id: str
    disease_case_id: str
    predicted_disease: str
    confidence_score: float
    description: str | None = None
    recommended_actions: list[str] = []
    model_version: str | None = None
    created_at: str


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
    # the image.
    image_signed_url: str
    created_at: str


class DiseaseCaseWithPredictionResponse(DiseaseCaseResponse):
    crop: CropRef | None = None
    prediction: PredictResponse | None = None
