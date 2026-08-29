from collections import defaultdict

from ..core.auth import AuthenticatedUser
from ..repositories import analytics_repository as repo
from ..repositories import dealer_repository, farmer_repository, marketplace_repository
from ..repositories import consultations_repository as consultations_repo
from ..repositories import orders_repository as orders_repo
from ..repositories import reviews_repository as reviews_repo


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


def fetch_farmer_analytics(user: AuthenticatedUser) -> dict:
    farms = farmer_repository.fetch_farms(user.access_token, user.id)
    orders = orders_repo.fetch_orders_for_user(user.access_token, user.id, "seller")
    consultations = consultations_repo.fetch_for_user(user.access_token, user.id)
    listing_ids = repo.fetch_own_listing_ids(user.access_token, user.id)

    view_counts = marketplace_repository.fetch_listing_view_counts(user.access_token, listing_ids)
    total_listing_views = sum(view_counts.values())

    crop_count = sum(len(farmer_repository.fetch_farm_crops(user.access_token, farm["id"])) for farm in farms)

    # "Sales"/"popular products" reflect completed orders only — a pending/cancelled order
    # isn't a real sale yet.
    completed_orders = [o for o in orders if o["status"] == "completed"]
    product_stats: dict[str, dict] = {}
    _accumulate_product_stats(completed_orders, product_stats)

    return {
        "totalListingViews": total_listing_views,
        "totalOrders": len(orders),
        "totalSales": sum(o["total"] for o in completed_orders),
        "popularProducts": _top_products(product_stats),
        "farmCount": len(farms),
        "cropCount": crop_count,
        "openConsultations": sum(1 for c in consultations if c["status"] in ("requested", "accepted", "in_progress")),
        "resolvedConsultations": sum(1 for c in consultations if c["status"] in ("resolved", "closed")),
    }


def fetch_dealer_analytics(user: AuthenticatedUser) -> dict:
    orders = orders_repo.fetch_orders_for_user(user.access_token, user.id, "seller")
    inventory = dealer_repository.fetch_inventory(user.access_token, user.id)
    stores = dealer_repository.fetch_stores(user.access_token, user.id)
    suppliers = dealer_repository.fetch_suppliers(user.access_token, user.id)
    sale_tx = repo.fetch_dealer_sale_transactions(user.access_token, user.id)

    completed_orders = [o for o in orders if o["status"] == "completed"]
    product_stats: dict[str, dict] = {}
    _accumulate_product_stats(completed_orders, product_stats)

    # `inventory_transactions.quantity` stores the signed resulting delta — a `sale` always
    # decreases stock, so these rows are negative; abs() turns "stock went down by 4" into
    # "4 units moved", which is what a movement chart should show.
    movement_by_month: dict[str, int] = defaultdict(int)
    for row in sale_tx:
        movement_by_month[_month_key(row["created_at"])] += abs(row["quantity"])
    inventory_movement = [
        {"month": month, "value": value} for month, value in sorted(movement_by_month.items())[-6:]
    ]

    return {
        "totalSales": sum(o["total"] for o in completed_orders),
        "totalOrders": len(orders),
        "inventoryMovement": inventory_movement,
        "lowStockCount": sum(1 for i in inventory if i["stock_quantity"] <= i["min_stock_threshold"]),
        "bestSellers": _top_products(product_stats),
        "storeCount": len(stores),
        "supplierCount": len(suppliers),
    }


def fetch_expert_analytics(user: AuthenticatedUser) -> dict:
    consultations = consultations_repo.fetch_for_expert(user.access_token, user.id)
    reviews = reviews_repo.fetch_reviews_for_expert(user.id)

    completed = [c for c in consultations if c["status"] in ("resolved", "closed")]
    average_rating = (sum(r["rating"] for r in reviews) / len(reviews)) if reviews else 0

    return {
        "totalConsultations": len(consultations),
        "completedConsultations": len(completed),
        "averageRating": average_rating,
        "reviewCount": len(reviews),
        "consultationsByMonth": _group_by_month([c["created_at"] for c in consultations]),
    }


def fetch_admin_analytics(user: AuthenticatedUser) -> dict:
    profiles = repo.fetch_all_profiles_summary(user.access_token)
    listings = repo.fetch_all_listings_status(user.access_token)
    orders = repo.fetch_all_orders_summary(user.access_token)
    payments = repo.fetch_all_payments_summary(user.access_token)
    reports = repo.fetch_all_reports_status(user.access_token)
    experts = repo.fetch_all_experts_status(user.access_token)
    consultations = repo.fetch_all_consultations_status(user.access_token)

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
