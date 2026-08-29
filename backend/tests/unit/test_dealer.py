from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from app.core.auth import AuthenticatedUser, get_current_user
from app.main import app
from app.services import dealer_service as service

client = TestClient(app)

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")
FARMER = AuthenticatedUser(id="farmer-1", email="f@x.com", role="farmer", access_token="tok2")

ITEM = {"id": "inv-1", "dealer_id": DEALER.id, "stock_quantity": 10}


def test_adjust_stock_addition_increases_by_quantity():
    with patch("app.services.dealer_service.repo.fetch_inventory_by_id", return_value=ITEM):
        with patch("app.services.dealer_service.repo.insert_inventory_transaction") as mock_tx:
            with patch(
                "app.services.dealer_service.repo.set_stock_quantity", return_value={"stock_quantity": 15}
            ) as mock_set:
                service.adjust_stock(DEALER.access_token, "inv-1", "addition", 5, DEALER.id, None)

    mock_set.assert_called_once_with(DEALER.access_token, "inv-1", 15)
    tx_args = mock_tx.call_args[0]
    assert tx_args[2] == "addition"
    assert tx_args[3] == 5  # delta, matches quantity for an increase type


def test_adjust_stock_sale_decreases_by_quantity():
    with patch("app.services.dealer_service.repo.fetch_inventory_by_id", return_value=ITEM):
        with patch("app.services.dealer_service.repo.insert_inventory_transaction") as mock_tx:
            with patch(
                "app.services.dealer_service.repo.set_stock_quantity", return_value={"stock_quantity": 6}
            ) as mock_set:
                service.adjust_stock(DEALER.access_token, "inv-1", "sale", 4, DEALER.id, None)

    mock_set.assert_called_once_with(DEALER.access_token, "inv-1", 6)
    assert mock_tx.call_args[0][3] == -4  # negative delta for a decrease type


def test_adjust_stock_correction_sets_absolute_value():
    with patch("app.services.dealer_service.repo.fetch_inventory_by_id", return_value=ITEM):
        with patch("app.services.dealer_service.repo.insert_inventory_transaction") as mock_tx:
            with patch(
                "app.services.dealer_service.repo.set_stock_quantity", return_value={"stock_quantity": 3}
            ) as mock_set:
                service.adjust_stock(DEALER.access_token, "inv-1", "correction", 3, DEALER.id, None)

    mock_set.assert_called_once_with(DEALER.access_token, "inv-1", 3)
    assert mock_tx.call_args[0][3] == 3 - 10  # delta relative to the current stock of 10


def test_adjust_stock_rejects_going_negative():
    with patch("app.services.dealer_service.repo.fetch_inventory_by_id", return_value=ITEM):
        with pytest.raises(HTTPException) as exc_info:
            service.adjust_stock(DEALER.access_token, "inv-1", "sale", 999, DEALER.id, None)
    assert exc_info.value.status_code == 422


def test_adjust_stock_rejects_missing_inventory_item():
    with patch("app.services.dealer_service.repo.fetch_inventory_by_id", return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            service.adjust_stock(DEALER.access_token, "missing", "sale", 1, DEALER.id, None)
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
