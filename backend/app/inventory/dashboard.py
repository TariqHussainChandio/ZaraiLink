"""The inventory dashboard (B2 sub-lane; SRDS §18): total products, stock units, low and out of stock, inventory value,
recent movements, adjustments and restocks, alerts, and the stock trend, in one read.
"""

import asyncio
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import cast

from fastapi import APIRouter, Depends

from app.auth.dependencies import AuthenticatedUser, require_dealer
from app.inventory import repository as repo
from app.inventory.alerts import alerts_for
from app.inventory.movements import day_start
from app.inventory.products import product_view
from app.inventory.schemas import Dashboard

TREND_DAYS = 30
RECENT = 10
RECENT_SHORT = 5

router = APIRouter()


# --- service ----------------------------------------------------------------------------------------------------------


def daily_trend(movements: list[dict], days: int = TREND_DAYS) -> list[dict]:
    """Units in and out per UTC day for the last `days` days, today included, with empty days as zero so a chart has
    no gaps. Transfers are left out by the caller: they move stock between the dealer's own places, not in or out."""
    today = datetime.now(UTC).date()
    first = today - timedelta(days=days - 1)
    totals: dict[str, dict[str, float]] = defaultdict(lambda: {"in": 0.0, "out": 0.0})
    for movement in movements:
        day = datetime.fromisoformat(movement["created_at"]).astimezone(UTC).date()
        if day >= first:
            totals[day.isoformat()][movement["direction"]] += float(movement["quantity"])
    points = []
    for offset in range(days):
        key = (first + timedelta(days=offset)).isoformat()
        points.append({"date": key, "in": totals[key]["in"], "out": totals[key]["out"]})
    return points


async def trend_movements(user: AuthenticatedUser, days: int = TREND_DAYS) -> list[dict]:
    """Every non-transfer movement of the last `days` days. Every page is read: one capped read (PostgREST returns at
    most 1000 rows, or only the request's page when the route is paginated) would make a busy dealer's trend silently
    wrong."""
    today = datetime.now(UTC).date()
    rows = await repo.fetch_all_movements(
        user.access_token,
        since=day_start(today - timedelta(days=days - 1)),
        before=day_start(today + timedelta(days=1)),
        columns="direction,quantity,created_at,source",
    )
    return [row for row in rows if row["source"] != "TRANSFER"]


async def build_dashboard(user: AuthenticatedUser) -> dict:
    token = user.access_token
    # Eight reads in parallel; asyncio.gather is typed only up to six awaitables, so the results are named and typed
    # one by one below.
    results = await asyncio.gather(
        repo.fetch_products(token, include_inactive=False, paged=False),
        repo.fetch_default_location(token),
        repo.fetch_movements(token, limit=RECENT),
        repo.fetch_movements(token, sources=["MANUAL_ADJUSTMENT"], limit=RECENT_SHORT),
        # A restock is stock arriving, by hand or from a received purchase (SRDS §24 RESTOCK and PURCHASE).
        repo.fetch_movements(token, sources=["RESTOCK", "PURCHASE"], limit=RECENT_SHORT),
        repo.fetch_purchases(token, limit=RECENT_SHORT),
        trend_movements(user),
        repo.count_sync_failures(token),
    )
    rows = cast(list[dict], results[0])
    default = cast(dict | None, results[1])
    recent = cast(list[dict], results[2])
    adjustments = cast(list[dict], results[3])
    restocks = cast(list[dict], results[4])
    purchases = cast(list[dict], results[5])
    trend_rows = cast(list[dict], results[6])
    sync_failures = cast(int, results[7])
    default_id = default["id"] if default else None
    views = [product_view(row, default_id) for row in rows]
    alerts = alerts_for(views, default_id)
    return {
        "totals": {
            "products": len(views),
            "stock_units": sum(v["total_quantity"] for v in views),
            "low_stock": sum(1 for a in alerts if a["status"] == "low_stock"),
            "out_of_stock": sum(1 for a in alerts if a["status"] == "out_of_stock"),
            "inventory_value": round(
                sum(v["total_quantity"] * float(v["cost_price"]) for v in views if v.get("cost_price") is not None), 2
            ),
        },
        "recent_movements": recent,
        "recent_adjustments": adjustments,
        "recent_restocks": restocks,
        "recent_purchases": purchases,
        "alerts": alerts,
        "trend": daily_trend(trend_rows),
        # Dispatch events the IMS could not apply (SRDS §53.39): the dealer retries them from the sync panel.
        "sync_failures": sync_failures,
    }


# --- routes -----------------------------------------------------------------------------------------------------------


@router.get("/dashboard", response_model=Dashboard)
async def get_dashboard(user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await build_dashboard(user)
