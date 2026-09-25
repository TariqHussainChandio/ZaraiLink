from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.auth import AuthenticatedUser, get_current_user
from app.main import app

client = TestClient(app)

ADMIN = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok")
FARMER = AuthenticatedUser(id="farmer-1", email="f@x.com", role="farmer", access_token="tok2")


def test_list_listings_is_public():
    with patch("app.api.v1.endpoints.marketplace.service.fetch_listings", return_value=[]):
        response = client.get("/api/v1/marketplace/listings")
    assert response.status_code == 200


def test_list_listings_passes_owner_id_filter_through_to_the_service():
    with patch("app.api.v1.endpoints.marketplace.service.fetch_listings", return_value=[]) as mock_fetch:
        response = client.get("/api/v1/marketplace/listings", params={"owner_id": "farmer-1"})
    assert response.status_code == 200
    mock_fetch.assert_called_once_with(None, None, None, None, None, None, None, 0, "farmer-1")


def test_moderation_route_matched_before_generic_listing_id_route():
    app.dependency_overrides[get_current_user] = lambda: ADMIN
    try:
        with patch(
            "app.api.v1.endpoints.marketplace.service.fetch_all_listings_for_moderation", return_value=[]
        ) as mock_fetch:
            response = client.get("/api/v1/marketplace/listings/moderation")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 200
    mock_fetch.assert_called_once()


def test_moderation_route_rejects_non_admin():
    app.dependency_overrides[get_current_user] = lambda: FARMER
    try:
        response = client.get("/api/v1/marketplace/listings/moderation")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 403


def test_update_listing_status_rejects_non_admin_even_though_rls_would_allow_the_owner():
    # `listings_owner_write` RLS itself would let the owner change status too — but this route
    # is deliberately kept admin-only (matches the only callers this function has ever had:
    # the moderation screens, always with an audit log entry), preserved intentionally, not
    # loosened just because RLS alone wouldn't stop it.
    app.dependency_overrides[get_current_user] = lambda: FARMER
    try:
        response = client.patch("/api/v1/marketplace/listings/listing-1/status", json={"status": "inactive"})
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 403


def test_create_category_requires_admin():
    response = client.post("/api/v1/marketplace/categories", json={"name": "Seeds", "slug": "seeds"})
    assert response.status_code == 401


def test_create_listing_without_authorization_header_is_rejected():
    response = client.post(
        "/api/v1/marketplace/listings",
        json={"title": "Wheat", "price": 100, "unit": "kg", "quantity": 50},
    )
    assert response.status_code == 401
