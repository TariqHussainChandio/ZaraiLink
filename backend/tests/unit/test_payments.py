from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from app.core.auth import AuthenticatedUser
from app.main import app
from app.services import payments_service as service

client = TestClient(app)

BUYER = AuthenticatedUser(id="buyer-1", email="b@x.com", role="buyer", access_token="tok")
SELLER = AuthenticatedUser(id="seller-1", email="s@x.com", role="dealer", access_token="tok2")
STRANGER = AuthenticatedUser(id="stranger-1", email="x@x.com", role="buyer", access_token="tok3")

ORDER = {"id": "order-1", "buyer_id": BUYER.id, "seller_id": SELLER.id, "status": "pending", "total": 999.99}


def test_initiate_payment_uses_order_total_never_a_client_supplied_amount():
    # InitiatePaymentRequest (schemas/payments.py) has no `amount` field at all — this test
    # additionally confirms the service call actually receives the order's own total.
    with patch("app.services.payments_service.repo.get_order_for_payment", return_value=ORDER):
        with patch("app.services.payments_service.repo.insert_payment", return_value={"id": "p-1"}) as mock_insert:
            service.initiate_payment(BUYER, "order-1", "cod")
    mock_insert.assert_called_once_with(BUYER.access_token, "order-1", BUYER.id, 999.99, "cod")


def test_initiate_payment_rejects_a_non_buyer_of_the_order():
    with patch("app.services.payments_service.repo.get_order_for_payment", return_value=ORDER):
        with pytest.raises(HTTPException) as exc_info:
            service.initiate_payment(STRANGER, "order-1", "cod")
    assert exc_info.value.status_code == 404


def test_initiate_payment_request_schema_has_no_amount_field():
    from app.schemas.payments import InitiatePaymentRequest

    assert "amount" not in InitiatePaymentRequest.model_fields


def test_mark_received_rejects_non_seller():
    payment = {"id": "p-1", "order_id": "order-1", "method": "cod"}
    with patch("app.services.payments_service.repo.fetch_payment_by_id", return_value=payment):
        with patch("app.services.payments_service.repo.get_order_for_payment", return_value=ORDER):
            with pytest.raises(HTTPException) as exc_info:
                service.mark_payment_received(BUYER, "p-1")  # buyer is not the seller
    assert exc_info.value.status_code == 403


def test_mark_failed_auto_transitions_pending_order_to_payment_failed():
    payment = {"id": "p-1", "order_id": "order-1", "method": "cod"}
    with patch("app.services.payments_service.repo.fetch_payment_by_id", return_value=payment):
        with patch("app.services.payments_service.repo.get_order_for_payment", return_value=ORDER):
            with patch("app.services.payments_service.repo.update_payment_status", return_value={"id": "p-1"}):
                with patch("app.services.payments_service.repo.insert_payment_transaction"):
                    with patch("app.services.payments_service.orders_service.update_order_status") as mock_transition:
                        service.mark_payment_failed(SELLER, "p-1", "buyer refused COD")
    mock_transition.assert_called_once_with(SELLER, "order-1", "payment_failed")


def test_mark_failed_does_not_auto_transition_an_order_already_processing():
    processing_order = {**ORDER, "status": "processing"}
    payment = {"id": "p-1", "order_id": "order-1", "method": "cod"}
    with patch("app.services.payments_service.repo.fetch_payment_by_id", return_value=payment):
        with patch("app.services.payments_service.repo.get_order_for_payment", return_value=processing_order):
            with patch("app.services.payments_service.repo.update_payment_status", return_value={"id": "p-1"}):
                with patch("app.services.payments_service.repo.insert_payment_transaction"):
                    with patch("app.services.payments_service.orders_service.update_order_status") as mock_transition:
                        service.mark_payment_failed(SELLER, "p-1", None)
    mock_transition.assert_not_called()


def test_initiate_payment_without_authorization_header_is_rejected():
    response = client.post("/api/v1/payments", json={"order_id": "order-1", "method": "cod"})
    assert response.status_code == 401
