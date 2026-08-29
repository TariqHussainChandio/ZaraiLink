from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.auth import AuthenticatedUser, get_current_user
from app.main import app
from app.services import analytics_service as service

client = TestClient(app)

FARMER = AuthenticatedUser(id="farmer-1", email="f@x.com", role="farmer", access_token="tok")
DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok2")


def test_farmer_analytics_counts_only_completed_orders_as_sales():
    orders = [
        {"status": "completed", "total": 100, "order_items": []},
        {"status": "pending", "total": 999, "order_items": []},  # must NOT count toward sales
    ]
    with patch("app.services.analytics_service.farmer_repository.fetch_farms", return_value=[]):
        with patch("app.services.analytics_service.orders_repo.fetch_orders_for_user", return_value=orders):
            with patch("app.services.analytics_service.consultations_repo.fetch_for_user", return_value=[]):
                with patch("app.services.analytics_service.repo.fetch_own_listing_ids", return_value=[]):
                    with patch(
                        "app.services.analytics_service.marketplace_repository.fetch_listing_view_counts",
                        return_value={},
                    ):
                        result = service.fetch_farmer_analytics(FARMER)

    assert result["totalSales"] == 100
    assert result["totalOrders"] == 2


def test_dealer_analytics_takes_absolute_value_of_signed_sale_transactions():
    sale_tx = [{"quantity": -4, "created_at": "2026-01-15T00:00:00Z"}, {"quantity": -2, "created_at": "2026-01-20T00:00:00Z"}]
    with patch("app.services.analytics_service.orders_repo.fetch_orders_for_user", return_value=[]):
        with patch("app.services.analytics_service.dealer_repository.fetch_inventory", return_value=[]):
            with patch("app.services.analytics_service.dealer_repository.fetch_stores", return_value=[]):
                with patch("app.services.analytics_service.dealer_repository.fetch_suppliers", return_value=[]):
                    with patch(
                        "app.services.analytics_service.repo.fetch_dealer_sale_transactions", return_value=sale_tx
                    ):
                        result = service.fetch_dealer_analytics(DEALER)

    assert result["inventoryMovement"] == [{"month": "2026-01", "value": 6}]


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
