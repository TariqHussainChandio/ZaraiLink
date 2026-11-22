"""The manual stock writes and purchase create take an optional `Idempotency-Key` (common/idempotency.py, as checkout
does): a replay returns the first response and writes nothing, a failure releases the key, and no key means no claim.
The claim table is the faked edge here; test_smoke_inventory_api.py runs the same through the real database."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.common.idempotency import Claim
from app.main import app

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")
REPO = "app.inventory.repository"
INV = "/api/v1/inventory"
IDS = {"product_id": "p", "location_id": "l"}
MOVEMENT = {
    "id": "m1",
    "dealer_id": DEALER.id,
    "product_id": "p",
    "location_id": "l",
    "direction": "in",
    "source": "RESTOCK",
    "quantity": 1,
    "quantity_before": 0,
    "quantity_after": 1,
    "created_at": "2026-10-11T08:00:00+00:00",
}
PURCHASE = {
    "id": "po1",
    "dealer_id": DEALER.id,
    "status": "draft",
    "purchased_on": "2026-10-11",
    "created_at": "2026-10-11T08:00:00+00:00",
    "updated_at": "2026-10-11T08:00:00+00:00",
    "items": [],
}

# (path, body, the endpoint name the key is scoped to, the response a replay returns)
WRITES = [
    ("/movements/stock-in", {**IDS, "quantity": 1}, "inventory.stock_in", MOVEMENT),
    (
        "/movements/stock-out",
        {**IDS, "quantity": 1, "source": "DAMAGE", "reason": "Torn"},
        "inventory.stock_out",
        MOVEMENT,
    ),
    (
        "/movements/adjustment",
        {**IDS, "quantity": 1, "direction": "in", "reason": "Count"},
        "inventory.adjustment",
        MOVEMENT,
    ),
    (
        "/stock/transfer",
        {"product_id": "p", "from_location_id": "a", "to_location_id": "b", "quantity": 1},
        "inventory.transfer",
        [MOVEMENT, MOVEMENT],
    ),
    ("/purchases", {"reference": "PO-1"}, "inventory.purchase_create", PURCHASE),
]
WRITERS = ["record_movement", "transfer_stock", "create_purchase"]


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: DEALER
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize(("path", "body", "endpoint", "first"), WRITES, ids=[w[2] for w in WRITES])
def test_a_replayed_key_returns_the_first_response_and_writes_nothing(client, path, body, endpoint, first):
    claim = Claim(DEALER, "key-12345", endpoint, replay=first)
    patches = [patch(f"{REPO}.{name}") for name in WRITERS]
    with patch("app.common.idempotency.begin", AsyncMock(return_value=claim)) as begin:
        mocks = [p.start() for p in patches]
        try:
            response = client.post(f"{INV}{path}", json=body, headers={"Idempotency-Key": "key-12345"})
        finally:
            for p in patches:
                p.stop()
    assert response.status_code == 201, response.text
    body = response.json()
    # the stored response comes back through the response model, which fills the optional fields
    if isinstance(first, list):
        assert [m["id"] for m in body] == [m["id"] for m in first]
    else:
        assert {k: body[k] for k in first if k != "items"} == {k: v for k, v in first.items() if k != "items"}
    assert begin.call_args.args[1:3] == ("key-12345", endpoint)
    for mock in mocks:
        mock.assert_not_called()


def test_a_first_request_completes_its_claim_with_the_response(client):
    claim = Claim(DEALER, "key-12345", "inventory.stock_in")
    with (
        patch("app.common.idempotency.begin", AsyncMock(return_value=claim)),
        patch.object(Claim, "complete", AsyncMock()) as complete,
        patch.object(Claim, "abandon", AsyncMock()) as abandon,
        patch(f"{REPO}.record_movement", return_value="m1") as record,
        patch(f"{REPO}.fetch_row", return_value=MOVEMENT),
    ):
        response = client.post(
            f"{INV}/movements/stock-in", json={**IDS, "quantity": 1}, headers={"Idempotency-Key": "key-12345"}
        )
    assert response.status_code == 201, response.text
    record.assert_called_once()
    complete.assert_awaited_once_with(201, MOVEMENT)
    abandon.assert_not_called()


def test_a_failed_request_releases_its_key(client):
    from postgrest.exceptions import APIError

    claim = Claim(DEALER, "key-12345", "inventory.stock_out")
    with (
        patch("app.common.idempotency.begin", AsyncMock(return_value=claim)),
        patch.object(Claim, "complete", AsyncMock()) as complete,
        patch.object(Claim, "abandon", AsyncMock()) as abandon,
        patch(f"{REPO}.record_movement", side_effect=APIError({"code": "P0001", "message": "Only 0 in stock"})),
    ):
        response = client.post(
            f"{INV}/movements/stock-out",
            json={**IDS, "quantity": 1, "source": "LOCAL_SALE"},
            headers={"Idempotency-Key": "key-12345"},
        )
    assert response.status_code == 422, response.text
    complete.assert_not_called()
    abandon.assert_awaited_once()


def test_without_a_key_nothing_is_claimed(client):
    with (
        patch("app.common.idempotency.get_user_scoped_client") as claims,
        patch(f"{REPO}.record_movement", return_value="m1") as record,
        patch(f"{REPO}.fetch_row", return_value=MOVEMENT),
    ):
        response = client.post(f"{INV}/movements/stock-in", json={**IDS, "quantity": 1})
    assert response.status_code == 201, response.text
    record.assert_called_once()
    claims.assert_not_called()
