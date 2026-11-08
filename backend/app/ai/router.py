from fastapi import APIRouter, Depends, Request

from app.ai import service as disease_service
from app.ai.schemas import (
    CreateCaseRequest,
    DiseaseCaseResponse,
    DiseaseCaseWithPredictionResponse,
    PredictRequest,
    PredictResponse,
    SupportedCrop,
    SupportedCropsResponse,
)
from app.auth.dependencies import AuthenticatedUser, require_authenticated_user
from app.middleware.rate_limit import limiter

router = APIRouter(prefix="/api/v1/disease", tags=["disease"])


# Any signed-in user may read the list (it is reference data); the dependency only keeps it off the open internet.
@router.get("/crops", response_model=SupportedCropsResponse, dependencies=[Depends(require_authenticated_user)])
async def list_supported_crops() -> SupportedCropsResponse:
    return SupportedCropsResponse(crops=[SupportedCrop(**crop) for crop in disease_service.supported_crops()])


@router.post("/cases", response_model=DiseaseCaseResponse)
async def create_case(
    request: CreateCaseRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> DiseaseCaseResponse:
    case = await disease_service.create_case(user, request.crop_id, request.storage_path)
    return DiseaseCaseResponse(**case)


@router.get("/cases/{disease_case_id}", response_model=DiseaseCaseWithPredictionResponse)
async def get_case(
    disease_case_id: str,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> DiseaseCaseWithPredictionResponse:
    case = await disease_service.get_case_for_user(user, disease_case_id)
    return DiseaseCaseWithPredictionResponse(**case)


@router.post("/predict", response_model=PredictResponse)
@limiter.limit("10/minute")
async def predict_disease(
    request: Request,
    body: PredictRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> PredictResponse:
    prediction = await disease_service.predict(user, body.disease_case_id, body.chosen_crop)
    return PredictResponse(**prediction)
