from fastapi import APIRouter, Depends, Request

from app.ai import service as disease_service
from app.ai.schemas import (
    CreateCaseRequest,
    DiseaseCaseResponse,
    DiseaseCaseWithPredictionResponse,
    DiseaseKnowledge,
    PredictRequest,
    PredictResponse,
)
from app.auth.dependencies import AuthenticatedUser, require_authenticated_user, require_farmer
from app.middleware.rate_limit import limiter

router = APIRouter(prefix="/api/v1/disease", tags=["disease"])


# D11: the AI advisory is a farmer tool, so creating a case and running the model are farmer-only. The database's
# insert policy says the same (caller_role() = 'farmer'), but the backend writes with the service role, so the API
# must enforce it itself.
@router.post("/cases", response_model=DiseaseCaseResponse)
async def create_case(
    request: CreateCaseRequest,
    user: AuthenticatedUser = Depends(require_farmer),
) -> DiseaseCaseResponse:
    case = await disease_service.create_case(user, request.crop_id, request.storage_path)
    return DiseaseCaseResponse(**case)


# Any signed-in user may ask; row-level security answers. The owner, an admin, or the expert assigned through a
# consultation sees the case (BR-13: the result routes to an expert); everyone else gets the same 404 as a missing id.
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
    user: AuthenticatedUser = Depends(require_farmer),
) -> PredictResponse:
    prediction = await disease_service.predict(user, body.disease_case_id)
    return PredictResponse(**prediction)


# The advisory text per model class (SRDS §34-§35); reference content any signed-in user may read.
@router.get("/knowledge", response_model=list[DiseaseKnowledge])
async def list_knowledge(
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> list[DiseaseKnowledge]:
    rows = await disease_service.list_knowledge(user)
    return [DiseaseKnowledge(**row) for row in rows]
