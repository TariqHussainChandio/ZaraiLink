from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.dealer import service
from app.main import app

client = TestClient(app)

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")
FARMER = AuthenticatedUser(id="farmer-1", email="f@x.com", role="farmer", access_token="tok2")

ITEM = {"id": "inv-1", "dealer_id": DEALER.id, "stock_quantity": 10}


# Since B3 the legacy adjust is served by the IMS (inventory/service.legacy_adjust_stock): one movement through the
# atomic record_movement function at the default location. The Supabase calls are the faked edge here; the same path
# runs against the real database in test_smoke_inventory_api.py.
INV_REPO = "app.inventory.repository"
SHOP = {"id": "shop", "is_default": True, "is_active": True}


def _product(quantity: float) -> dict:
    return {
        "id": "inv-1",
        "dealer_id": DEALER.id,
        "sku": "S",
        "name": "Urea",
        "unit": "bag",
        "cost_price": None,
        "selling_price": None,
        "reorder_threshold": 0,
        "is_active": True,
        "created_at": "2026-10-11T08:00:00+00:00",
        "updated_at": "2026-10-11T08:00:00+00:00",
        "stock": [{"location_id": "shop", "quantity": quantity}],
        "listings": [],
    }


@pytest.mark.asyncio
async def test_adjust_stock_delegates_to_the_atomic_rpc():
    # The read-check-write happens inside `public.record_movement` (row-locked, validated against a real database by
    # pgTAP and the smoke tests); this checks the service passes one movement through with the right arguments.
    with (
        patch(f"{INV_REPO}.fetch_product", side_effect=[_product(10), _product(15)]),
        patch(f"{INV_REPO}.fetch_default_location", return_value=SHOP),
        patch(f"{INV_REPO}.record_movement", return_value="m1") as mock_rpc,
        patch(f"{INV_REPO}.fetch_row", return_value={"id": "m1"}),
    ):
        result = await service.adjust_stock_as_user(DEALER, "inv-1", "addition", 5, None)

    mock_rpc.assert_called_once_with(DEALER.access_token, "inv-1", "shop", "in", "RESTOCK", 5.0, None)
    assert result["stock_quantity"] == 15


@pytest.mark.asyncio
async def test_adjust_stock_rejects_going_negative():
    # `public.record_movement` raises SQLSTATE P0001 when the change would take stock below zero; the service must
    # translate that into a 422, not an unhandled 500.
    negative_stock_error = APIError({"message": "Only 10 in stock at this location", "code": "P0001"})
    with (
        patch(f"{INV_REPO}.fetch_product", return_value=_product(10)),
        patch(f"{INV_REPO}.fetch_default_location", return_value=SHOP),
        patch(f"{INV_REPO}.record_movement", side_effect=negative_stock_error),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await service.adjust_stock_as_user(DEALER, "inv-1", "sale", 999, None)
    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "Only 10 in stock at this location"


@pytest.mark.asyncio
async def test_adjust_stock_rejects_missing_inventory_item():
    # A product that does not exist, or is not the caller's (row-level security hides it), is a 404, and nothing is
    # recorded.
    with (
        patch(f"{INV_REPO}.fetch_product", return_value=None),
        patch(f"{INV_REPO}.record_movement") as mock_rpc,
    ):
        with pytest.raises(HTTPException) as exc_info:
            await service.adjust_stock_as_user(DEALER, "missing", "sale", 1, None)
    assert exc_info.value.status_code == 404
    mock_rpc.assert_not_called()


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
        with patch("app.dealer.router.service.fetch_inventory", return_value=[]):
            response = client.get("/api/v1/dealer/inventory")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 200


def test_inventory_listings_route_matched_before_generic_id_route():
    app.dependency_overrides[get_current_user] = lambda: DEALER
    try:
        with patch("app.dealer.router.service.fetch_dealer_listings", return_value=[]) as mock_fetch:
            response = client.get("/api/v1/dealer/inventory/listings")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 200
    mock_fetch.assert_called_once()
