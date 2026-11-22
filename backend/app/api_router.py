from fastapi import APIRouter

from app.admin.router import router as admin_router
from app.ai.router import router as disease_router
from app.common.analytics.router import router as analytics_router
from app.common.consultations.router import admin_router as admin_consultations_router
from app.common.consultations.router import router as consultations_router
from app.common.marketplace.router import router as marketplace_router
from app.common.messaging.router import router as messaging_router
from app.common.notifications.router import router as notifications_router
from app.common.orders.router import admin_router as admin_orders_router
from app.common.orders.router import router as orders_router
from app.common.payments.router import router as payments_router
from app.common.profile.router import router as profile_router
from app.common.reference_data.router import router as reference_data_router
from app.common.reviews.router import router as reviews_router
from app.dealer.router import router as dealer_router
from app.expert.router import router as expert_router
from app.farmer.router import router as farmer_router
from app.inventory.router import router as inventory_router

# Single aggregated router for the v1 API surface — main.py mounts this one router instead of
# importing and including all 14 endpoint routers itself.
api_router = APIRouter()

api_router.include_router(admin_router)
api_router.include_router(admin_orders_router)
api_router.include_router(admin_consultations_router)
api_router.include_router(analytics_router)
api_router.include_router(consultations_router)
api_router.include_router(dealer_router)
api_router.include_router(disease_router)
api_router.include_router(expert_router)
api_router.include_router(farmer_router)
api_router.include_router(inventory_router)
api_router.include_router(marketplace_router)
api_router.include_router(messaging_router)
api_router.include_router(notifications_router)
api_router.include_router(orders_router)
api_router.include_router(payments_router)
api_router.include_router(profile_router)
api_router.include_router(reference_data_router)
api_router.include_router(reviews_router)
