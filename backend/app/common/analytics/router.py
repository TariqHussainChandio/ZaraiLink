from fastapi import APIRouter, Depends

from app.auth.dependencies import AuthenticatedUser, require_admin, require_dealer, require_expert, require_farmer
from app.common.analytics import service
from app.common.analytics.schemas import AdminAnalytics, DealerAnalytics, ExpertAnalytics, FarmerAnalytics

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("/farmer", response_model=FarmerAnalytics)
async def get_farmer_analytics(user: AuthenticatedUser = Depends(require_farmer)) -> dict:
    return await service.fetch_farmer_analytics(user)


@router.get("/dealer", response_model=DealerAnalytics)
async def get_dealer_analytics(user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await service.fetch_dealer_analytics(user)


@router.get("/expert", response_model=ExpertAnalytics)
async def get_expert_analytics(user: AuthenticatedUser = Depends(require_expert)) -> dict:
    return await service.fetch_expert_analytics(user)


@router.get("/admin", response_model=AdminAnalytics)
async def get_admin_analytics(user: AuthenticatedUser = Depends(require_admin)) -> dict:
    return await service.fetch_admin_analytics(user)
