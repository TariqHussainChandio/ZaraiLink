from fastapi import APIRouter, Depends

from ....core.auth import AuthenticatedUser, require_admin, require_dealer, require_expert, require_farmer
from ....schemas.analytics import AdminAnalytics, DealerAnalytics, ExpertAnalytics, FarmerAnalytics
from ....services import analytics_service as service

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
