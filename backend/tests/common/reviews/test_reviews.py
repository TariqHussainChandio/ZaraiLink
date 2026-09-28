from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth.dependencies import AuthenticatedUser
from app.common.reviews import service
from app.main import app

client = TestClient(app)

BUYER = AuthenticatedUser(id="buyer-1", email="b@x.com", role="buyer", access_token="tok")
OTHER_BUYER = AuthenticatedUser(id="buyer-2", email="b2@x.com", role="buyer", access_token="tok2")

COMPLETED_ORDER = {
    "id": "order-1",
    "seller_id": "seller-1",
    "buyer_id": BUYER.id,
    "status": "completed",
    "order_items": [{"listing_id": "listing-1"}, {"listing_id": "listing-2"}],
}


@pytest.mark.asyncio
async def test_create_review_rejects_non_owner_of_order():
    with patch("app.common.reviews.service.repo.get_order_for_review", return_value=COMPLETED_ORDER):
        with pytest.raises(HTTPException) as exc_info:
            await service.create_review(OTHER_BUYER, "order-1", None, 5, "great")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_create_review_rejects_incomplete_order():
    incomplete = {**COMPLETED_ORDER, "status": "pending"}
    with patch("app.common.reviews.service.repo.get_order_for_review", return_value=incomplete):
        with pytest.raises(HTTPException) as exc_info:
            await service.create_review(BUYER, "order-1", None, 5, "great")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_create_review_rejects_listing_not_in_order():
    with patch("app.common.reviews.service.repo.get_order_for_review", return_value=COMPLETED_ORDER):
        with pytest.raises(HTTPException) as exc_info:
            await service.create_review(BUYER, "order-1", "listing-not-in-this-order", 5, "great")
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_create_review_derives_seller_id_from_order_not_client():
    with patch("app.common.reviews.service.repo.get_order_for_review", return_value=COMPLETED_ORDER):
        with patch("app.common.reviews.service.repo.create_review", return_value={"id": "r-1"}) as mock_create:
            await service.create_review(BUYER, "order-1", "listing-1", 5, "great")

    # seller_id passed to the repository comes from COMPLETED_ORDER["seller_id"], never from any
    # client-supplied value (there is no seller_id parameter on create_review at all).
    args, kwargs = mock_create.call_args
    assert args[3] == "seller-1"


def test_create_review_without_authorization_header_is_rejected():
    response = client.post("/api/v1/reviews", json={"order_id": "order-1", "rating": 5})
    assert response.status_code != 200


def test_delete_review_requires_admin():
    response = client.delete("/api/v1/reviews/review-1")
    assert response.status_code != 204
