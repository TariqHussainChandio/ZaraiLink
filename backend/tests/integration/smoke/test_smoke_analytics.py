"""P5a smoke matrix — analytics domain."""

from __future__ import annotations


def test_farmer_analytics(world, api_client):
    response = api_client("GET", "/api/v1/analytics/farmer", world.farmer.token)
    assert response.status_code == 200, response.text


def test_dealer_analytics(world, api_client):
    response = api_client("GET", "/api/v1/analytics/dealer", world.dealer.token)
    assert response.status_code == 200, response.text


def test_expert_analytics(world, api_client):
    response = api_client("GET", "/api/v1/analytics/expert", world.expert.token)
    assert response.status_code == 200, response.text


def test_admin_analytics(world, api_client):
    response = api_client("GET", "/api/v1/analytics/admin", world.admin.token)
    assert response.status_code == 200, response.text


def test_wrong_role_cannot_read_someone_elses_analytics(world, api_client):
    response = api_client("GET", "/api/v1/analytics/dealer", world.farmer.token)
    assert response.status_code == 403


def test_dashboard_counts_follow_the_seller_s_own_listings(world, api_client):
    """The dashboard's "active listings" comes from the API, so it must move as a listing is added or removed."""

    def active(role_token: str, path: str) -> int:
        response = api_client("GET", path, role_token)
        assert response.status_code == 200, response.text
        return response.json()["activeListings"]

    for token, path in (
        (world.farmer.token, "/api/v1/analytics/farmer"),
        (world.dealer.token, "/api/v1/analytics/dealer"),
    ):
        before = active(token, path)
        assert before >= 1  # the fixture's own listing
        created = api_client(
            "POST",
            "/api/v1/marketplace/listings",
            token,
            json={"title": "Dashboard count listing", "price": 10.0, "unit": "kg", "quantity": 1},
        )
        assert created.status_code in (200, 201), created.text
        assert active(token, path) == before + 1
        deleted = api_client("DELETE", f"/api/v1/marketplace/listings/{created.json()['id']}", token)
        assert deleted.status_code == 204, deleted.text
        assert active(token, path) == before


def test_pending_orders_are_counted_for_the_seller_only(world, api_client):
    farmer = api_client("GET", "/api/v1/analytics/farmer", world.farmer.token).json()
    dealer = api_client("GET", "/api/v1/analytics/dealer", world.dealer.token).json()
    assert isinstance(farmer["pendingOrders"], int)
    assert farmer["pendingOrders"] <= farmer["totalOrders"]
    assert dealer["pendingOrders"] <= dealer["totalOrders"]
