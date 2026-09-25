from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.core.auth import AuthenticatedUser, get_current_user
from app.main import app
from app.services import dealer_service as service

client = TestClient(app)

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")
FARMER = AuthenticatedUser(id="farmer-1", email="f@x.com", role="farmer", access_token="tok2")

ITEM = {"id": "inv-1", "dealer_id": DEALER.id, "stock_quantity": 10}


@pytest.mark.asyncio
async def test_adjust_stock_delegates_to_the_atomic_rpc():
    # The read-check-write itself happens inside `public.adjust_stock` (a Postgres function,
    # validated separately against a real local database — not provable via a mock); this only
    # checks the service passes the call through with the right arguments and returns its result.
    with patch("app.services.dealer_service.repo.adjust_stock", return_value={"stock_quantity": 15}) as mock_rpc:
        result = await service.adjust_stock(DEALER.access_token, "inv-1", "addition", 5, DEALER.id, None)

    mock_rpc.assert_called_once_with(DEALER.access_token, "inv-1", "addition", 5, DEALER.id, None)
    assert result == {"stock_quantity": 15}


@pytest.mark.asyncio
async def test_adjust_stock_rejects_going_negative():
    # `public.adjust_stock` raises with SQLSTATE P0001 when the requested change would take
    # stock below zero — the service must translate that into a 422, not an unhandled 500.
    negative_stock_error = APIError({"message": "Stock quantity cannot go below zero", "code": "P0001"})
    with patch("app.services.dealer_service.repo.adjust_stock", side_effect=negative_stock_error):
        with pytest.raises(HTTPException) as exc_info:
            await service.adjust_stock(DEALER.access_token, "inv-1", "sale", 999, DEALER.id, None)
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_adjust_stock_rejects_missing_inventory_item():
    # `public.adjust_stock` raises with SQLSTATE P0002 when no such inventory row exists.
    not_found_error = APIError({"message": "Inventory item not found", "code": "P0002"})
    with patch("app.services.dealer_service.repo.adjust_stock", side_effect=not_found_error):
        with pytest.raises(HTTPException) as exc_info:
            await service.adjust_stock(DEALER.access_token, "missing", "sale", 1, DEALER.id, None)
    assert exc_info.value.status_code == 404


def test_list_inventory_rejects_non_dealer_role():
    app.dependency_overrides[get_current_user] = lambda: FARMER
    try:
        response = client.get("/api/v1/dealer/inventory")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 403


def test_list_inventory_allows_dealer_role():
    app.dependency_overrides[get_current_user] = lambda: DEALER
    try:
        with patch("app.api.v1.endpoints.dealer.service.fetch_inventory", return_value=[]):
            response = client.get("/api/v1/dealer/inventory")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 200


def test_inventory_listings_route_matched_before_generic_id_route():
    app.dependency_overrides[get_current_user] = lambda: DEALER
    try:
        with patch("app.api.v1.endpoints.dealer.service.fetch_dealer_listings", return_value=[]) as mock_fetch:
            response = client.get("/api/v1/dealer/inventory/listings")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 200
    mock_fetch.assert_called_once()
