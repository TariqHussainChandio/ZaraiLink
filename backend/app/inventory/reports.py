"""Inventory reports and analytics (B5 sub-lane; SRDS §17, §18, §25): stock summary, valuation, movements by source,
low and out of stock, supplier purchases, the marketplace and local sales split, the movement analytics, and the
reconciliation.

Every read runs with the dealer's own token, so row-level security keeps a report to the dealer's own rows (BR-03/04,
§15). The figures are computed here from the ledger rows in the period: a dealer's movements over a year are a few
thousand rows, read in PostgREST pages (repository.REPORT_PAGE), and the same functions feed the CSV exports
(exports.py), so a downloaded file always matches what the screen shows.

A period is a range of whole UTC days, `from` and `to` inclusive, the last 30 days by default (the same days as the
dashboard trend and the ledger filter). Stock on hand and alerts are as of the moment the report is made; the period
says which movements are counted beside them.
"""

import asyncio
from collections import defaultdict
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, timedelta
from typing import get_args

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import AuthenticatedUser, require_dealer
from app.common.errors import AppHTTPException
from app.inventory import repository as repo
from app.inventory.alerts import alerts_for
from app.inventory.movements import day_start
from app.inventory.products import product_view
from app.inventory.schemas import (
    AnalyticsReport,
    LowOutOfStockReport,
    MovementsBySourceReport,
    MovementSource,
    ReconciliationReport,
    SalesSplitReport,
    StockSummaryReport,
    SupplierPurchasesReport,
    ValuationReport,
)

DEFAULT_DAYS = 30
# A year and a day covers any calendar year; a longer range is refused rather than read row by row.
MAX_DAYS = 366
MOVERS = 5
MARKETPLACE = "ZARAILINK_ORDER"
LOCAL = "LOCAL_SALE"
# A transfer moves stock between the dealer's own places, not into or out of the business (as in the dashboard trend).
TRANSFER = "TRANSFER"
MOVEMENT_COLUMNS = "product_id,location_id,direction,source,quantity,created_at"

router = APIRouter()


# --- the period and the shared reads ----------------------------------------------------------------------------------


def report_period(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    to = date_to or datetime.now(UTC).date()
    start = date_from or to - timedelta(days=DEFAULT_DAYS - 1)
    if start > to:
        raise AppHTTPException(422, "The start date is after the end date", "validation_failed")
    if (to - start).days + 1 > MAX_DAYS:
        raise AppHTTPException(422, f"A report covers at most {MAX_DAYS} days", "validation_failed")
    return start, to


def _days(start: date, to: date) -> list[date]:
    return [start + timedelta(days=offset) for offset in range((to - start).days + 1)]


def _envelope(start: date, to: date) -> dict:
    return {"from": start, "to": to, "generated_at": datetime.now(UTC).isoformat()}


def _day_of(movement: dict) -> str:
    return datetime.fromisoformat(movement["created_at"]).astimezone(UTC).date().isoformat()


async def _movements(user: AuthenticatedUser, start: date, to: date) -> list[dict]:
    # `to` is a whole day, so the bound is the start of the next one.
    return await repo.fetch_all_movements(
        user.access_token, day_start(start), day_start(to + timedelta(days=1)), MOVEMENT_COLUMNS
    )


async def _products(user: AuthenticatedUser) -> tuple[dict[str, dict], str | None]:
    """Every product as a ProductView keyed by id, and the default location (the one the marketplace sells from, D8)."""
    rows, default = await asyncio.gather(
        repo.fetch_all_products(user.access_token), repo.fetch_default_location(user.access_token)
    )
    default_id = default["id"] if default else None
    return {row["id"]: product_view(row, default_id) for row in rows}, default_id


def _label(products: dict[str, dict], product_id: str) -> dict:
    product = products.get(product_id) or {}
    return {"product_id": product_id, "sku": product.get("sku", ""), "name": product.get("name", "")}


def _flows(movements: list[dict], key: Callable[[dict], object], skip_transfers: bool) -> dict:
    """Units in and out per `key` of a movement."""
    totals: dict = defaultdict(lambda: {"in": 0.0, "out": 0.0})
    for movement in movements:
        if skip_transfers and movement["source"] == TRANSFER:
            continue
        totals[key(movement)][movement["direction"]] += float(movement["quantity"])
    return totals


def _sold(movement: dict) -> float:
    """A sale's units, net: an `in` row under a sales source gives units back, so it counts against the sales."""
    quantity = float(movement["quantity"])
    return quantity if movement["direction"] == "out" else -quantity


# --- the reports ------------------------------------------------------------------------------------------------------


async def stock_summary(user: AuthenticatedUser, start: date, to: date) -> dict:
    (products, _), locations, movements = await asyncio.gather(
        _products(user), repo.fetch_all_names(user.access_token, "inventory_locations"), _movements(user, start, to)
    )
    location_names = {row["id"]: row["name"] for row in locations}
    flows = _flows(movements, lambda m: (m["product_id"], m["location_id"]), skip_transfers=False)
    rows = []
    for product in products.values():
        for stock in product["stock"]:
            flow = flows.get((product["id"], stock["location_id"]), {"in": 0.0, "out": 0.0})
            rows.append(
                {
                    **_label(products, product["id"]),
                    "unit": product["unit"],
                    "location_id": stock["location_id"],
                    "location_name": location_names.get(stock["location_id"], ""),
                    "quantity": stock["quantity"],
                    "period_in": flow["in"],
                    "period_out": flow["out"],
                }
            )
    rows.sort(key=lambda r: (r["name"], r["location_name"]))
    return {**_envelope(start, to), "rows": rows, "total_quantity": sum(r["quantity"] for r in rows)}


async def valuation(user: AuthenticatedUser, start: date, to: date) -> dict:
    """Stock on hand at cost price (SRDS §18 inventory value, the dashboard's rule) per product, with the total."""
    (products, _), movements = await asyncio.gather(_products(user), _movements(user, start, to))
    flows = _flows(movements, lambda m: m["product_id"], skip_transfers=True)
    rows = []
    for product in products.values():
        quantity = product["total_quantity"]
        # An inactive product is listed only while it still holds stock, which still has a value.
        if not product["is_active"] and quantity == 0:
            continue
        cost = product.get("cost_price")
        flow = flows.get(product["id"], {"in": 0.0, "out": 0.0})
        rows.append(
            {
                **_label(products, product["id"]),
                "unit": product["unit"],
                "quantity": quantity,
                "cost_price": float(cost) if cost is not None else None,
                "value": round(quantity * float(cost), 2) if cost is not None else None,
                "period_in": flow["in"],
                "period_out": flow["out"],
            }
        )
    return {
        **_envelope(start, to),
        "rows": rows,
        "total_value": round(sum(r["value"] for r in rows if r["value"] is not None), 2),
        "products_without_cost": sum(1 for r in rows if r["value"] is None and r["quantity"] != 0),
    }


async def movements_by_source(user: AuthenticatedUser, start: date, to: date) -> dict:
    """Totals per SRDS §24 source, every source listed (zero when unused) so a chart keeps the same bars."""
    movements = await _movements(user, start, to)
    flows = _flows(movements, lambda m: m["source"], skip_transfers=False)
    counts: dict[str, int] = defaultdict(int)
    for movement in movements:
        counts[movement["source"]] += 1
    rows = []
    for source in get_args(MovementSource):
        flow = flows.get(source, {"in": 0.0, "out": 0.0})
        net = flow["in"] - flow["out"]
        rows.append({"source": source, "in": flow["in"], "out": flow["out"], "net": net, "movements": counts[source]})
    return {**_envelope(start, to), "rows": rows}


async def low_out_of_stock(user: AuthenticatedUser, start: date, to: date) -> dict:
    """The alert list (alerts.py: the default location against the reorder threshold, as the low-stock notification
    and the marketplace availability read it) with how fast each product went out in the period."""
    (products, default_id), movements = await asyncio.gather(_products(user), _movements(user, start, to))
    active = [view for view in products.values() if view["is_active"]]
    flows = _flows(movements, lambda m: m["product_id"], skip_transfers=True)
    days = (to - start).days + 1
    rows = []
    for alert in alerts_for(active, default_id):
        period_out = flows.get(alert["product_id"], {"out": 0.0})["out"]
        daily_out = period_out / days
        if alert["quantity"] <= 0:
            cover: float | None = 0.0
        elif daily_out > 0:
            cover = round(alert["quantity"] / daily_out, 1)
        else:
            cover = None
        rows.append({**alert, "period_out": period_out, "daily_out": round(daily_out, 3), "days_of_cover": cover})
    return {
        **_envelope(start, to),
        "rows": rows,
        "low_stock": sum(1 for r in rows if r["status"] == "low_stock"),
        "out_of_stock": sum(1 for r in rows if r["status"] == "out_of_stock"),
    }


async def supplier_purchases(user: AuthenticatedUser, start: date, to: date) -> dict:
    """Purchases received in the period (SRDS §17 suppliers), by supplier: how many, how many units, the cost."""
    purchases, suppliers = await asyncio.gather(
        repo.fetch_received_purchases(user.access_token, day_start(start), day_start(to + timedelta(days=1))),
        repo.fetch_all_names(user.access_token, "inventory_suppliers"),
    )
    names = {row["id"]: row["name"] for row in suppliers}
    groups: dict = defaultdict(lambda: {"purchases": 0, "quantity": 0.0, "cost": 0.0, "lines_without_cost": 0})
    for purchase in purchases:
        group = groups[purchase.get("supplier_id")]
        group["purchases"] += 1
        for item in purchase.get("items") or []:
            quantity = float(item["quantity"])
            group["quantity"] += quantity
            if item.get("unit_cost") is None:
                group["lines_without_cost"] += 1
            else:
                group["cost"] += quantity * float(item["unit_cost"])
    rows = [
        {
            "supplier_id": supplier_id,
            # A purchase may have no supplier, or one since deleted (on delete set null).
            "supplier_name": names.get(supplier_id, "") if supplier_id else "No supplier",
            **group,
            "cost": round(group["cost"], 2),
        }
        for supplier_id, group in groups.items()
    ]
    rows.sort(key=lambda r: (-r["cost"], r["supplier_name"]))
    return {
        **_envelope(start, to),
        "rows": rows,
        "total_purchases": sum(r["purchases"] for r in rows),
        "total_quantity": sum(r["quantity"] for r in rows),
        "total_cost": round(sum(r["cost"] for r in rows), 2),
    }


async def sales_split(user: AuthenticatedUser, start: date, to: date) -> dict:
    """Marketplace orders against local sales (SRDS §25 keeps the two sources apart) per day and per product."""
    (products, _), movements = await asyncio.gather(_products(user), _movements(user, start, to))
    by_day: dict = defaultdict(lambda: {"marketplace": 0.0, "local": 0.0})
    by_product: dict = defaultdict(lambda: {"marketplace": 0.0, "local": 0.0})
    for movement in movements:
        if movement["source"] not in (MARKETPLACE, LOCAL):
            continue
        channel = "marketplace" if movement["source"] == MARKETPLACE else "local"
        by_day[_day_of(movement)][channel] += _sold(movement)
        by_product[movement["product_id"]][channel] += _sold(movement)
    days = [{"date": day.isoformat(), **by_day[day.isoformat()]} for day in _days(start, to)]
    product_rows = [
        {**_label(products, product_id), **split, "total": split["marketplace"] + split["local"]}
        for product_id, split in by_product.items()
    ]
    product_rows.sort(key=lambda r: (-r["total"], r["name"]))
    return {
        **_envelope(start, to),
        "by_day": days,
        "by_product": product_rows,
        "marketplace_total": sum(r["marketplace"] for r in product_rows),
        "local_total": sum(r["local"] for r in product_rows),
    }


async def analytics(user: AuthenticatedUser, start: date, to: date) -> dict:
    """The daily in/out trend, the fastest and slowest movers among active products (units out per day, any outward
    source but transfers), and the best sellers (net units sold through either sales source)."""
    (products, _), movements = await asyncio.gather(_products(user), _movements(user, start, to))
    days = (to - start).days + 1
    daily = _flows(movements, _day_of, skip_transfers=True)
    trend = [
        {"date": day.isoformat(), **daily.get(day.isoformat(), {"in": 0.0, "out": 0.0})} for day in _days(start, to)
    ]
    outflow = _flows(movements, lambda m: m["product_id"], skip_transfers=True)
    movers = [
        {
            **_label(products, view["id"]),
            "out_quantity": outflow.get(view["id"], {"out": 0.0})["out"],
            "daily_out": round(outflow.get(view["id"], {"out": 0.0})["out"] / days, 3),
        }
        for view in products.values()
        if view["is_active"]
    ]
    # A product that sold nothing is no fast mover; it is exactly what the slow list is for.
    fast = sorted((m for m in movers if m["out_quantity"] > 0), key=lambda m: (-m["out_quantity"], m["name"]))
    slow = sorted(movers, key=lambda m: (m["out_quantity"], m["name"]))
    sold: dict[str, float] = defaultdict(float)
    for movement in movements:
        if movement["source"] in (MARKETPLACE, LOCAL):
            sold[movement["product_id"]] += _sold(movement)
    best = sorted(
        ({**_label(products, pid), "quantity": qty} for pid, qty in sold.items() if qty > 0),
        key=lambda r: (-r["quantity"], r["name"]),
    )
    return {
        **_envelope(start, to),
        "trend": trend,
        "fast_movers": fast[:MOVERS],
        "slow_movers": slow[:MOVERS],
        "best_sellers": best[:MOVERS],
    }


async def reconciliation(user: AuthenticatedUser) -> dict:
    """inventory_reconciliation() per product (SRDS §25), named, the unbalanced ones first: those are what the dealer
    has to look into (a sync event still pending, SRDS §53.39, or a stock row changed outside the stock functions)."""
    rows, (products, _) = await asyncio.gather(repo.fetch_reconciliation(user.access_token), _products(user))
    named = [{**row, **_label(products, row["product_id"])} for row in rows]
    named.sort(key=lambda r: (r["balanced"], r["name"]))
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "unbalanced": sum(1 for r in named if not r["balanced"]),
        "rows": named,
    }


async def _reconciliation_report(user: AuthenticatedUser, _start: date, _to: date) -> dict:
    # The ledger must add up to the stock on hand, which is cumulative, so a period cannot narrow it.
    return await reconciliation(user)


# Every report by its name, with one signature, for the exports.
REPORTS: dict[str, Callable[[AuthenticatedUser, date, date], Awaitable[dict]]] = {
    "stock-summary": stock_summary,
    "valuation": valuation,
    "movements-by-source": movements_by_source,
    "low-out-of-stock": low_out_of_stock,
    "supplier-purchases": supplier_purchases,
    "sales-split": sales_split,
    "analytics": analytics,
    "reconciliation": _reconciliation_report,
}


# --- routes -----------------------------------------------------------------------------------------------------------


async def period_query(
    date_from: date | None = Query(None, alias="from", description="First UTC day, inclusive (default: `to` - 29)"),
    date_to: date | None = Query(None, alias="to", description="Last UTC day, inclusive (default: today)"),
) -> tuple[date, date]:
    """`from` and `to` of every report route, resolved to the period (report_period)."""
    return report_period(date_from, date_to)


@router.get("/reports/stock-summary", response_model=StockSummaryReport)
async def get_stock_summary(
    user: AuthenticatedUser = Depends(require_dealer), period: tuple[date, date] = Depends(period_query)
) -> dict:
    return await stock_summary(user, *period)


@router.get("/reports/valuation", response_model=ValuationReport)
async def get_valuation(
    user: AuthenticatedUser = Depends(require_dealer), period: tuple[date, date] = Depends(period_query)
) -> dict:
    return await valuation(user, *period)


@router.get("/reports/movements-by-source", response_model=MovementsBySourceReport)
async def get_movements_by_source(
    user: AuthenticatedUser = Depends(require_dealer), period: tuple[date, date] = Depends(period_query)
) -> dict:
    return await movements_by_source(user, *period)


@router.get("/reports/low-out-of-stock", response_model=LowOutOfStockReport)
async def get_low_out_of_stock(
    user: AuthenticatedUser = Depends(require_dealer), period: tuple[date, date] = Depends(period_query)
) -> dict:
    return await low_out_of_stock(user, *period)


@router.get("/reports/supplier-purchases", response_model=SupplierPurchasesReport)
async def get_supplier_purchases(
    user: AuthenticatedUser = Depends(require_dealer), period: tuple[date, date] = Depends(period_query)
) -> dict:
    return await supplier_purchases(user, *period)


@router.get("/reports/sales-split", response_model=SalesSplitReport)
async def get_sales_split(
    user: AuthenticatedUser = Depends(require_dealer), period: tuple[date, date] = Depends(period_query)
) -> dict:
    return await sales_split(user, *period)


@router.get("/reports/analytics", response_model=AnalyticsReport)
async def get_analytics(
    user: AuthenticatedUser = Depends(require_dealer), period: tuple[date, date] = Depends(period_query)
) -> dict:
    return await analytics(user, *period)


@router.get("/reports/reconciliation", response_model=ReconciliationReport)
async def get_reconciliation_report(user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await reconciliation(user)
