from pydantic import BaseModel


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


class CreateCaseRequest(BaseModel):
    crop_id: str | None = None
    image_url: str


class CropRef(BaseModel):
    id: str
    name: str


class DiseaseCaseResponse(BaseModel):
    id: str
    user_id: str
    crop_id: str | None
    image_url: str
    created_at: str


class DiseaseCaseWithPredictionResponse(DiseaseCaseResponse):
    crop: CropRef | None = None
    prediction: PredictResponse | None = None
