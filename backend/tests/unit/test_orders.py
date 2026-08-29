from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from app.core.auth import AuthenticatedUser, get_current_user
from app.main import app
from app.services import orders_service as service

client = TestClient(app)

BUYER = AuthenticatedUser(id="buyer-1", email="b@x.com", role="buyer", access_token="tok")
SELLER_A = "seller-a"
SELLER_B = "seller-b"

LISTINGS = [
    {"id": "l-1", "status": "active", "quantity": 100, "price": 50.0, "owner_id": SELLER_A},
    {"id": "l-2", "status": "active", "quantity": 100, "price": 20.0, "owner_id": SELLER_A},
    {"id": "l-3", "status": "active", "quantity": 100, "price": 10.0, "owner_id": SELLER_B},
]
AVAILABILITY = [{"listing_id": l["id"], "available": l["quantity"]} for l in LISTINGS]


def _mock_checkout_reads():
    return patch.multiple(
        "app.services.orders_service.repo",
        fetch_listings_for_checkout=lambda *a, **k: LISTINGS,
        get_available_stock=lambda *a, **k: AVAILABILITY,
    )


# --- checkout: server-authoritative pricing & grouping -----------------------------------


def test_checkout_prices_from_the_listing_not_the_client():
    # Cart items carry ONLY listing_id/quantity — there is no price field the client could
    # supply at all, closing the gap where the original frontend priced orders from a
    # client-cached cart value.
    cart_items = [{"listing_id": "l-1", "quantity": 2}]

    with _mock_checkout_reads():
        with patch("app.services.orders_service.repo.insert_order", return_value={"id": "order-1"}) as mock_insert:
            with patch("app.services.orders_service.repo.insert_order_items") as mock_items:
                with patch("app.services.orders_service.repo.insert_order_status_history"):
                    service.checkout(BUYER, cart_items, {})

    # subtotal = listing price (50.0) * quantity (2) = 100.0 — computed server-side.
    mock_insert.assert_called_once_with(BUYER.access_token, BUYER.id, SELLER_A, 100.0, 0)
    items_arg = mock_items.call_args[0][2]
    assert items_arg[0]["unit_price"] == 50.0


def test_checkout_splits_multi_seller_cart_into_separate_orders():
    cart_items = [
        {"listing_id": "l-1", "quantity": 1},  # seller A
        {"listing_id": "l-3", "quantity": 1},  # seller B
    ]

    with _mock_checkout_reads():
        with patch(
            "app.services.orders_service.repo.insert_order", side_effect=[{"id": "order-a"}, {"id": "order-b"}]
        ) as mock_insert:
            with patch("app.services.orders_service.repo.insert_order_items"):
                with patch("app.services.orders_service.repo.insert_order_status_history"):
                    orders = service.checkout(BUYER, cart_items, {})

    assert len(orders) == 2
    seller_ids = {call.args[2] for call in mock_insert.call_args_list}
    assert seller_ids == {SELLER_A, SELLER_B}


def test_checkout_rejects_inactive_listing():
    inactive_listings = [{**LISTINGS[0], "status": "inactive"}]
    with patch("app.services.orders_service.repo.fetch_listings_for_checkout", return_value=inactive_listings):
        with patch("app.services.orders_service.repo.get_available_stock", return_value=[]):
            with pytest.raises(HTTPException) as exc_info:
                service.checkout(BUYER, [{"listing_id": "l-1", "quantity": 1}], {})
    assert exc_info.value.status_code == 422


def test_checkout_rejects_over_available_stock():
    low_stock = [{"listing_id": "l-1", "available": 1}]
    with patch("app.services.orders_service.repo.fetch_listings_for_checkout", return_value=LISTINGS):
        with patch("app.services.orders_service.repo.get_available_stock", return_value=low_stock):
            with pytest.raises(HTTPException) as exc_info:
                service.checkout(BUYER, [{"listing_id": "l-1", "quantity": 5}], {})
    assert exc_info.value.status_code == 422


# --- status transitions: server-authoritative current state ------------------------------


def test_update_status_ignores_any_client_notion_of_current_state():
    # The request schema (UpdateOrderStatusRequest) only has a `to` field — there is no `from`
    # for the client to assert at all; the service always re-reads the real status itself.
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "pending"}
    with patch("app.services.orders_service.repo.fetch_order_by_id", return_value=order):
        with patch("app.services.orders_service.repo.update_order_status") as mock_update:
            with patch("app.services.orders_service.repo.insert_order_status_history") as mock_history:
                service.update_order_status(BUYER, "o-1", "cancelled")
    mock_update.assert_called_once_with(BUYER.access_token, "o-1", "cancelled")
    mock_history.assert_called_once_with(BUYER.access_token, "o-1", "pending", "cancelled", BUYER.id)


def test_update_status_rejects_non_participant():
    stranger = AuthenticatedUser(id="stranger-1", email="s@x.com", role="buyer", access_token="tok2")
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "pending"}
    with patch("app.services.orders_service.repo.fetch_order_by_id", return_value=order):
        with pytest.raises(HTTPException) as exc_info:
            service.update_order_status(stranger, "o-1", "cancelled")
    assert exc_info.value.status_code == 403


def test_update_status_rejects_illegal_transition():
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "completed"}
    with patch("app.services.orders_service.repo.fetch_order_by_id", return_value=order):
        with pytest.raises(HTTPException) as exc_info:
            service.update_order_status(BUYER, "o-1", "pending")
    assert exc_info.value.status_code == 422


def test_confirming_an_order_reduces_linked_dealer_inventory():
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "pending"}
    order_items = [{"listing_id": "l-1", "quantity": 3}]
    inventory = {"id": "inv-1", "stock_quantity": 10}

    with patch("app.services.orders_service.repo.fetch_order_by_id", return_value=order):
        with patch("app.services.orders_service.repo.fetch_order_items_for_inventory", return_value=order_items):
            with patch(
                "app.services.orders_service.dealer_repository.fetch_inventory_by_listing_id", return_value=inventory
            ):
                with patch("app.services.orders_service.dealer_service.adjust_stock") as mock_adjust:
                    with patch("app.services.orders_service.repo.update_order_status"):
                        with patch("app.services.orders_service.repo.insert_order_status_history"):
                            service.update_order_status(BUYER, "o-1", "confirmed")

    mock_adjust.assert_called_once_with(BUYER.access_token, "inv-1", "sale", 3, BUYER.id, "Order o-1")


def test_confirming_an_order_rejects_when_stock_insufficient():
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "pending"}
    order_items = [{"listing_id": "l-1", "quantity": 99}]
    inventory = {"id": "inv-1", "stock_quantity": 5}

    with patch("app.services.orders_service.repo.fetch_order_by_id", return_value=order):
        with patch("app.services.orders_service.repo.fetch_order_items_for_inventory", return_value=order_items):
            with patch(
                "app.services.orders_service.dealer_repository.fetch_inventory_by_listing_id", return_value=inventory
            ):
                with pytest.raises(HTTPException) as exc_info:
                    service.update_order_status(BUYER, "o-1", "confirmed")
    assert exc_info.value.status_code == 422


# --- router-level ---------------------------------------------------------------------


def test_checkout_without_authorization_header_is_rejected():
    response = client.post("/api/v1/orders/checkout", json={"cart_items": []})
    assert response.status_code == 401


def test_update_status_request_schema_has_no_from_field():
    from app.schemas.orders import UpdateOrderStatusRequest

    assert "from" not in UpdateOrderStatusRequest.model_fields
    assert set(UpdateOrderStatusRequest.model_fields) == {"to"}
