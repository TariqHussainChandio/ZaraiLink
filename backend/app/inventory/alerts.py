"""Alerts and settings (B2 sub-lane; SRDS §17-§18): which products are low or out of stock, and the dealer's alert
preferences. The lists use the same rule as the low-stock notification (notify_inventory_stock_low) and the buyer-facing
availability word (listing_availability): the stock at the default location, the one the marketplace sells from (D8),
against the product's reorder threshold.
"""

from fastapi import APIRouter, Depends

from app.auth.dependencies import AuthenticatedUser, require_dealer
from app.inventory import repository as repo
from app.inventory.products import product_view
from app.inventory.schemas import AlertSettings, AlertSettingsInput, StockAlert

router = APIRouter()


# --- service ----------------------------------------------------------------------------------------------------------


def stock_alert(view: dict, default_location_id: str | None) -> dict | None:
    """The alert for one ProductView, or None when it is stocked above its threshold."""
    quantity = view["default_location_quantity"]
    threshold = float(view["reorder_threshold"])
    if quantity <= 0:
        status = "out_of_stock"
    elif quantity <= threshold:
        status = "low_stock"
    else:
        return None
    return {
        "product_id": view["id"],
        "sku": view["sku"],
        "name": view["name"],
        "unit": view["unit"],
        "location_id": default_location_id,
        "quantity": quantity,
        "reorder_threshold": threshold,
        "status": status,
    }


def alerts_for(views: list[dict], default_location_id: str | None) -> list[dict]:
    alerts = [stock_alert(view, default_location_id) for view in views]
    # Out of stock first (it stops marketplace sales), then the lowest quantity.
    return sorted(
        (a for a in alerts if a is not None), key=lambda a: (a["status"] != "out_of_stock", a["quantity"], a["name"])
    )


async def list_alerts(user: AuthenticatedUser, status: str | None = None) -> list[dict]:
    # Every active product is weighed, not a page of them: an alert list that skips products is wrong, not short.
    rows = await repo.fetch_products(user.access_token, include_inactive=False, paged=False)
    default = await repo.fetch_default_location(user.access_token)
    default_id = default["id"] if default else None
    alerts = alerts_for([product_view(row, default_id) for row in rows], default_id)
    return [a for a in alerts if status is None or a["status"] == status]


async def get_settings(user: AuthenticatedUser) -> dict:
    # A dealer who never saved settings sees the table's defaults; a read writes nothing.
    settings = await repo.fetch_alert_settings(user.access_token)
    if settings is not None:
        return settings
    return {"dealer_id": user.id, **AlertSettingsInput().model_dump(), "updated_at": None}


async def save_settings(user: AuthenticatedUser, fields: dict) -> dict:
    return await repo.upsert_alert_settings(user.access_token, user.id, fields)


# --- routes -----------------------------------------------------------------------------------------------------------


@router.get("/alerts", response_model=list[StockAlert])
async def get_alerts(user: AuthenticatedUser = Depends(require_dealer)) -> list[dict]:
    return await list_alerts(user)


@router.get("/alerts/low-stock", response_model=list[StockAlert])
async def get_low_stock(user: AuthenticatedUser = Depends(require_dealer)) -> list[dict]:
    return await list_alerts(user, "low_stock")


@router.get("/alerts/out-of-stock", response_model=list[StockAlert])
async def get_out_of_stock(user: AuthenticatedUser = Depends(require_dealer)) -> list[dict]:
    return await list_alerts(user, "out_of_stock")


@router.get("/alerts/settings", response_model=AlertSettings)
async def get_alert_settings(user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await get_settings(user)


@router.put("/alerts/settings", response_model=AlertSettings)
async def put_alert_settings(request: AlertSettingsInput, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await save_settings(user, request.model_dump())
