from fastapi import APIRouter

from .endpoints.admin import router as admin_router
from .endpoints.analytics import router as analytics_router
from .endpoints.consultations import router as consultations_router
from .endpoints.dealer import router as dealer_router
from .endpoints.disease import router as disease_router
from .endpoints.expert import router as expert_router
from .endpoints.farmer import router as farmer_router
from .endpoints.marketplace import router as marketplace_router
from .endpoints.messaging import router as messaging_router
from .endpoints.notifications import router as notifications_router
from .endpoints.orders import router as orders_router
from .endpoints.payments import router as payments_router
from .endpoints.profile import router as profile_router
from .endpoints.reference_data import router as reference_data_router
from .endpoints.reviews import router as reviews_router

# Single aggregated router for the v1 API surface — main.py mounts this one router instead of
# importing and including all 14 endpoint routers itself.
api_router = APIRouter()

api_router.include_router(admin_router)
api_router.include_router(analytics_router)
api_router.include_router(consultations_router)
api_router.include_router(dealer_router)
api_router.include_router(disease_router)
api_router.include_router(expert_router)
api_router.include_router(farmer_router)
api_router.include_router(marketplace_router)
api_router.include_router(messaging_router)
api_router.include_router(notifications_router)
api_router.include_router(orders_router)
api_router.include_router(payments_router)
api_router.include_router(profile_router)
api_router.include_router(reference_data_router)
api_router.include_router(reviews_router)
