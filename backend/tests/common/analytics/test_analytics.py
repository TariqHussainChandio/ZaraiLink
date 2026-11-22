from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.common.analytics import service
from app.main import app

client = TestClient(app)

FARMER = AuthenticatedUser(id="farmer-1", email="f@x.com", role="farmer", access_token="tok")
DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok2")


@pytest.mark.asyncio
async def test_farmer_analytics_counts_only_completed_orders_as_sales():
    orders = [
        {"status": "completed", "total": 100, "order_items": []},
        {"status": "pending", "total": 999, "order_items": []},  # must NOT count toward sales
    ]
    with patch("app.farmer.service.repo.fetch_farms", return_value=[]):
        with patch("app.common.orders.service.repo.fetch_orders_for_user", return_value=orders):
            with patch("app.common.consultations.service.repo.fetch_for_user", return_value=[]):
                with patch("app.common.analytics.service.repo.fetch_own_listings", return_value=[]):
                    with patch(
                        "app.common.marketplace.service.repo.fetch_listing_view_counts",
                        return_value={},
                    ):
                        result = await service.fetch_farmer_analytics(FARMER)

    assert result["totalSales"] == 100
    assert result["totalOrders"] == 2
    assert result["pendingOrders"] == 1
    assert result["activeListings"] == 0


@pytest.mark.asyncio
async def test_farmer_analytics_counts_only_active_listings_and_pending_orders():
    listings = [
        {"id": "l1", "status": "active"},
        {"id": "l2", "status": "inactive"},
        {"id": "l3", "status": "sold"},
        {"id": "l4", "status": "active"},
    ]
    orders = [
        {"status": "pending", "total": 1, "order_items": []},
        {"status": "accepted", "total": 1, "order_items": []},
    ]
    with (
        patch("app.farmer.service.repo.fetch_farms", return_value=[]),
        patch("app.common.orders.service.repo.fetch_orders_for_user", return_value=orders),
        patch("app.common.consultations.service.repo.fetch_for_user", return_value=[]),
        patch("app.common.analytics.service.repo.fetch_own_listings", return_value=listings),
        patch("app.common.marketplace.service.repo.fetch_listing_view_counts", return_value={}) as views,
    ):
        result = await service.fetch_farmer_analytics(FARMER)

    assert result["activeListings"] == 2
    assert result["pendingOrders"] == 1
    views.assert_awaited_once_with("tok", ["l1", "l2", "l3", "l4"])


@pytest.mark.asyncio
async def test_dealer_analytics_takes_absolute_value_of_signed_sale_transactions():
    # Since B3 the sales are the dealer's ZARAILINK_ORDER movements, read through the inventory service. A sale is stock
    # going out, so its quantity may arrive signed; the chart counts units moved, positive either way.
    sales = [
        {"quantity": -4, "created_at": "2026-01-15T00:00:00Z", "product_id": "p"},
        {"quantity": 2, "created_at": "2026-01-20T00:00:00Z", "product_id": "p"},
    ]

    async def movements(_token, **kwargs):
        return sales if kwargs.get("sources") == ["ZARAILINK_ORDER"] else []

    with (
        patch("app.common.orders.service.repo.fetch_orders_for_user", return_value=[]),
        patch("app.inventory.repository.fetch_products", return_value=[]),
        patch("app.inventory.repository.fetch_default_location", return_value=None),
        patch("app.inventory.repository.fetch_all_movements", side_effect=movements) as fetch,
        patch("app.inventory.repository.list_rows", return_value=[]),
        patch("app.common.analytics.service.repo.fetch_own_listings", return_value=[]),
    ):
        result = await service.fetch_dealer_analytics(DEALER)

    assert result["inventoryMovement"] == [{"month": "2026-01", "value": 6}]
    assert any(c.kwargs.get("sources") == ["ZARAILINK_ORDER"] for c in fetch.call_args_list)


def test_farmer_analytics_route_rejects_non_farmer_role():
    app.dependency_overrides[get_current_user] = lambda: DEALER
    try:
        response = client.get("/api/v1/analytics/farmer")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 403


def test_group_by_month_caps_to_six_most_recent_months():
    dates = [f"2026-{month:02d}-01T00:00:00Z" for month in range(1, 9)]  # 8 months
    result = service._group_by_month(dates)
    assert len(result) == 6
    assert result[0]["month"] == "2026-03"
    assert result[-1]["month"] == "2026-08"
