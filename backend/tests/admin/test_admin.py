from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.admin import service
from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.main import app

client = TestClient(app)

ADMIN = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok")
FARMER = AuthenticatedUser(id="farmer-1", email="f@x.com", role="farmer", access_token="tok2")


@pytest.mark.asyncio
async def test_update_user_role_logs_the_real_previous_role_not_a_client_supplied_one():
    with patch("app.admin.service.repo.fetch_profile_role", return_value="farmer") as mock_fetch:
        with patch("app.admin.service.repo.update_profile_role") as mock_update:
            with patch("app.admin.service.log_admin_action") as mock_log:
                await service.update_user_role(ADMIN, "user-1", "dealer")

    mock_fetch.assert_called_once_with(ADMIN.access_token, "user-1")
    mock_update.assert_called_once_with(ADMIN.access_token, "user-1", "dealer")
    mock_log.assert_called_once_with(
        ADMIN, "change_role", "profiles", "user-1", previous_state={"role": "farmer"}, new_state={"role": "dealer"}
    )


@pytest.mark.asyncio
async def test_fetch_all_orders_returns_every_order_not_scoped_to_the_caller():
    orders = [{"id": "o-1", "buyer_id": "buyer-1", "seller_id": "seller-1"}]
    with patch("app.common.orders.service.repo.fetch_all_orders", return_value=orders) as mock_fetch:
        result = await service.fetch_all_orders(ADMIN)

    mock_fetch.assert_called_once_with(ADMIN.access_token)
    assert result == orders


def test_platform_stats_route_rejects_non_admin():
    app.dependency_overrides[get_current_user] = lambda: FARMER
    try:
        response = client.get("/api/v1/admin/stats")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 403


def test_platform_stats_route_allows_admin():
    app.dependency_overrides[get_current_user] = lambda: ADMIN
    try:
        with patch(
            "app.admin.router.service.fetch_platform_stats",
            return_value={"total_users": 0, "users_by_role": {}, "total_listings": 0, "total_orders": 0},
        ):
            response = client.get("/api/v1/admin/stats")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 200


def test_every_admin_route_rejects_an_unauthenticated_caller():
    # Every single route in this router must be require_admin — sample every one of them with
    # no Authorization header at all and confirm none slip through as 200.
    checks = [
        ("GET", "/api/v1/admin/stats"),
        ("GET", "/api/v1/admin/users"),
        ("PATCH", "/api/v1/admin/users/u-1/suspend"),
        ("PATCH", "/api/v1/admin/users/u-1/role"),
        ("GET", "/api/v1/admin/reports"),
        ("PATCH", "/api/v1/admin/reports/r-1/resolve"),
        ("PATCH", "/api/v1/admin/reports/r-1/dismiss"),
        ("GET", "/api/v1/admin/audit-logs"),
        ("GET", "/api/v1/admin/orders"),
    ]
    for method, path in checks:
        response = client.request(method, path, json={} if method == "PATCH" else None)
        assert response.status_code == 401, f"{method} {path} did not reject an unauthenticated caller"


def test_platform_orders_route_rejects_non_admin():
    app.dependency_overrides[get_current_user] = lambda: FARMER
    try:
        response = client.get("/api/v1/admin/orders")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 403


def test_platform_orders_route_returns_orders_for_admin():
    app.dependency_overrides[get_current_user] = lambda: ADMIN
    try:
        with patch("app.admin.router.service.fetch_all_orders", return_value=[]):
            response = client.get("/api/v1/admin/orders")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 200
    assert response.json() == []
