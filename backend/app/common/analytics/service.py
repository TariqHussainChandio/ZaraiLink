import asyncio
from collections import defaultdict

from app.auth.dependencies import AuthenticatedUser
from app.common.analytics import repository as repo
from app.common.consultations import service as consultations_service
from app.common.marketplace import service as marketplace_service
from app.common.orders import service as orders_service
from app.common.reviews import service as reviews_service
from app.dealer import service as dealer_service
from app.farmer import service as farmer_service


def _month_key(iso: str) -> str:
    return iso[:7]  # "YYYY-MM"


def _group_by_month(dates: list[str]) -> list[dict]:
    """Buckets ISO timestamps by month, sorted ascending, capped to the most recent 6 months."""
    counts: dict[str, int] = defaultdict(int)
    for d in dates:
        counts[_month_key(d)] += 1
    months = sorted(counts.items())[-6:]
    return [{"month": month, "value": value} for month, value in months]


def _accumulate_product_stats(orders: list[dict], acc: dict[str, dict]) -> None:
    """Units/revenue per listing from an order's line items, keyed by listing id."""
    for order in orders:
        for item in order.get("order_items", []):
            listing_id = item.get("listing_id")
            if not listing_id:
                continue
            entry = acc.setdefault(
                listing_id,
                {
                    "listingId": listing_id,
                    "title": (item.get("listing") or {}).get("title", "Listing"),
                    "unitsSold": 0,
                    "revenue": 0,
                },
            )
            entry["unitsSold"] += item["quantity"]
            entry["revenue"] += item["quantity"] * item["unit_price"]


def _top_products(acc: dict[str, dict], limit: int = 5) -> list[dict]:
    return sorted(acc.values(), key=lambda p: p["unitsSold"], reverse=True)[:limit]


def _count_active(listings: list[dict]) -> int:
    return sum(1 for row in listings if row["status"] == "active")


def _count_pending(orders: list[dict]) -> int:
    """Orders the seller still has to act on (the dashboard's "Pending Orders")."""
    return sum(1 for order in orders if order["status"] == "pending")


async def fetch_farmer_analytics(user: AuthenticatedUser) -> dict:
    # Each read below is independent of the others (none depends on another's result), so they
    # run concurrently rather than as four sequential round trips.
    farms, orders, consultations, listings = await asyncio.gather(
        farmer_service.fetch_farms(user),
        orders_service.read_orders_for_user(user, "seller"),
        consultations_service.fetch_for_user(user),
        repo.fetch_own_listings(user.access_token, user.id),
    )
    listing_ids = [row["id"] for row in listings]

    view_counts, *crop_lists = await asyncio.gather(
        marketplace_service.fetch_listing_view_counts(user, listing_ids),
        *(farmer_service.fetch_farm_crops(user, farm["id"]) for farm in farms),
    )
    total_listing_views = sum(view_counts.values())
    crop_count = sum(len(crops) for crops in crop_lists)

    # "Sales"/"popular products" reflect completed orders only — a pending/cancelled order
    # isn't a real sale yet.
    completed_orders = [o for o in orders if o["status"] == "completed"]
    product_stats: dict[str, dict] = {}
    _accumulate_product_stats(completed_orders, product_stats)

    return {
        "totalListingViews": total_listing_views,
        "activeListings": _count_active(listings),
        "pendingOrders": _count_pending(orders),
        "totalOrders": len(orders),
        "totalSales": sum(o["total"] for o in completed_orders),
        "popularProducts": _top_products(product_stats),
        "farmCount": len(farms),
        "cropCount": crop_count,
        "openConsultations": sum(1 for c in consultations if c["status"] in ("requested", "accepted", "in_progress")),
        "resolvedConsultations": sum(1 for c in consultations if c["status"] in ("resolved", "closed")),
    }


async def fetch_dealer_analytics(user: AuthenticatedUser) -> dict:
    orders, inventory, stores, suppliers, sale_tx, listings = await asyncio.gather(
        orders_service.read_orders_for_user(user, "seller"),
        dealer_service.fetch_inventory(user),
        dealer_service.fetch_stores(user),
        dealer_service.fetch_suppliers(user),
        repo.fetch_dealer_sale_transactions(user.access_token, user.id),
        repo.fetch_own_listings(user.access_token, user.id),
    )

    completed_orders = [o for o in orders if o["status"] == "completed"]
    product_stats: dict[str, dict] = {}
    _accumulate_product_stats(completed_orders, product_stats)

    # `inventory_transactions.quantity` stores the signed resulting delta — a `sale` always
    # decreases stock, so these rows are negative; abs() turns "stock went down by 4" into
    # "4 units moved", which is what a movement chart should show.
    movement_by_month: dict[str, int] = defaultdict(int)
    for row in sale_tx:
        movement_by_month[_month_key(row["created_at"])] += abs(row["quantity"])
    inventory_movement = [{"month": month, "value": value} for month, value in sorted(movement_by_month.items())[-6:]]

    return {
        "totalSales": sum(o["total"] for o in completed_orders),
        "totalOrders": len(orders),
        "activeListings": _count_active(listings),
        "pendingOrders": _count_pending(orders),
        "inventoryMovement": inventory_movement,
        "lowStockCount": sum(1 for i in inventory if i["stock_quantity"] <= i["min_stock_threshold"]),
        "bestSellers": _top_products(product_stats),
        "storeCount": len(stores),
        "supplierCount": len(suppliers),
    }


async def fetch_expert_analytics(user: AuthenticatedUser) -> dict:
    consultations, reviews = await asyncio.gather(
        consultations_service.fetch_for_expert(user),
        reviews_service.fetch_reviews_for_expert(user.id),
    )

    completed = [c for c in consultations if c["status"] in ("resolved", "closed")]
    average_rating = (sum(r["rating"] for r in reviews) / len(reviews)) if reviews else 0

    return {
        "totalConsultations": len(consultations),
        "completedConsultations": len(completed),
        "averageRating": average_rating,
        "reviewCount": len(reviews),
        "consultationsByMonth": _group_by_month([c["created_at"] for c in consultations]),
    }


async def fetch_admin_analytics(user: AuthenticatedUser) -> dict:
    profiles, listings, orders, payments, reports, experts, consultations = await asyncio.gather(
        repo.fetch_all_profiles_summary(user.access_token),
        repo.fetch_all_listings_status(user.access_token),
        repo.fetch_all_orders_summary(user.access_token),
        repo.fetch_all_payments_summary(user.access_token),
        repo.fetch_all_reports_status(user.access_token),
        repo.fetch_all_experts_status(user.access_token),
        repo.fetch_all_consultations_status(user.access_token),
    )

    users_by_role: dict[str, int] = defaultdict(int)
    for row in profiles:
        users_by_role[row["role"]] += 1

    payments_by_status: dict[str, int] = defaultdict(int)
    payments_total = 0.0
    for row in payments:
        payments_by_status[row["status"]] += 1
        if row["status"] == "successful":
            payments_total += row["amount"]

    reports_by_status: dict[str, int] = defaultdict(int)
    for row in reports:
        reports_by_status[row["status"]] += 1

    resolved_consultations = sum(1 for c in consultations if c["status"] in ("resolved", "closed"))

    return {
        "userGrowth": _group_by_month([p["created_at"] for p in profiles]),
        "usersByRole": dict(users_by_role),
        "totalListings": len(listings),
        "activeListings": sum(1 for l in listings if l["status"] == "active"),
        "orderVolume": _group_by_month([o["created_at"] for o in orders]),
        "totalOrders": len(orders),
        "paymentsByStatus": dict(payments_by_status),
        "paymentsTotal": payments_total,
        "reportsByStatus": dict(reports_by_status),
        "pendingExpertVerifications": sum(1 for e in experts if e["verification_status"] == "pending"),
        "approvedExperts": sum(1 for e in experts if e["verification_status"] == "approved"),
        "consultationResolutionRate": (resolved_consultations / len(consultations)) if consultations else 0,
    }
