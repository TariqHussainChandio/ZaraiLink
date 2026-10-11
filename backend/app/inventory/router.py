"""The dealer Inventory Management System API (B2, B3, B5): one router over the sub-lane routers.

Every route depends on `require_dealer`, which admits only an approved, unsuspended dealer (B0; SRDS §16, §50); there
is no admin route here (BR-03/04, §15). Each query then runs with the dealer's own token, so row-level security keeps
them to their own rows.
"""

from fastapi import APIRouter

from app.inventory import alerts, dashboard, exports, movements, products, purchasing, reports, stock, sync

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])

for sub_router in (
    dashboard.router,
    products.router,
    stock.router,
    movements.router,
    purchasing.router,
    alerts.router,
    sync.router,
    reports.router,
    exports.router,
):
    router.include_router(sub_router)
