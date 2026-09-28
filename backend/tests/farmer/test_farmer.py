from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.farmer import service
from app.farmer.schemas import FarmUpdateInput
from app.main import app

client = TestClient(app)

FARMER = AuthenticatedUser(id="farmer-1", email="f@x.com", role="farmer", access_token="tok")
BUYER = AuthenticatedUser(id="buyer-1", email="b@x.com", role="buyer", access_token="tok2")


@pytest.mark.asyncio
async def test_update_farm_only_touches_location_when_a_location_field_was_provided():
    with patch("app.farmer.service.repo.update_farm", return_value={"id": "farm-1"}) as mock_update:
        await service.update_farm(FARMER, "farm-1", FarmUpdateInput(name="New Name"))
    fields = mock_update.call_args[0][2]
    assert "location" not in fields
    assert fields == {"name": "New Name"}


@pytest.mark.asyncio
async def test_update_farm_rebuilds_location_when_any_location_field_provided():
    with patch("app.farmer.service.repo.update_farm", return_value={"id": "farm-1"}) as mock_update:
        await service.update_farm(FARMER, "farm-1", FarmUpdateInput(city="City Nine"))
    fields = mock_update.call_args[0][2]
    assert fields["location"] == {"country": None, "province": None, "city": "City Nine"}


def test_list_farms_without_authorization_header_is_rejected():
    response = client.get("/api/v1/farmer/farms")
    assert response.status_code == 401


def test_list_farms_rejects_a_non_farmer_role():
    # Overrides get_current_user (the token-verification dependency) to return a real,
    # already-authenticated buyer — so this actually exercises require_farmer's own role check
    # for this specific route, not just "some 4xx happened."
    app.dependency_overrides[get_current_user] = lambda: BUYER
    try:
        response = client.get("/api/v1/farmer/farms")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 403


def test_list_farms_allows_a_farmer_role():
    app.dependency_overrides[get_current_user] = lambda: FARMER
    try:
        with patch("app.farmer.router.service.fetch_farms", return_value=[]):
            response = client.get("/api/v1/farmer/farms")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 200
