"""movements.py: each manual operation writes one movement through record_movement with the right source and
direction, the ledger filters become the right query bounds, and a refused change maps to the dealer's error."""

from datetime import date
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.common.errors import AppHTTPException
from app.inventory import movements
from app.main import app

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")
REPO = "app.inventory.repository"
MOVEMENT = {
    "id": "m1",
    "dealer_id": DEALER.id,
    "product_id": "p",
    "location_id": "l",
    "direction": "in",
    "source": "RESTOCK",
    "quantity": 2.5,
    "quantity_before": 0,
    "quantity_after": 2.5,
    "created_at": "2026-10-11T08:00:00+00:00",
}


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: DEALER
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)


def test_a_day_starts_at_utc_midnight():
    assert movements.day_start(date(2026, 10, 11)) == "2026-10-11T00:00:00+00:00"


@pytest.mark.asyncio
async def test_the_date_filter_includes_the_whole_last_day():
    with patch(f"{REPO}.fetch_movements", return_value=[]) as fetch:
        await movements.list_movements(
            DEALER, ["DAMAGE", "EXPIRY"], "p", "l", "out", date(2026, 10, 1), date(2026, 10, 11)
        )
    assert fetch.call_args.kwargs == {
        "product_id": "p",
        "location_id": "l",
        "sources": ["DAMAGE", "EXPIRY"],
        "direction": "out",
        "since": "2026-10-01T00:00:00+00:00",
        "before": "2026-10-12T00:00:00+00:00",
    }


@pytest.mark.asyncio
async def test_no_filters_mean_no_bounds():
    with patch(f"{REPO}.fetch_movements", return_value=[]) as fetch:
        await movements.list_movements(DEALER)
    assert fetch.call_args.kwargs["since"] is None
    assert fetch.call_args.kwargs["before"] is None
    assert fetch.call_args.kwargs["sources"] is None


@pytest.mark.asyncio
async def test_a_movement_the_dealer_cannot_see_is_404():
    with patch(f"{REPO}.fetch_row", return_value=None), pytest.raises(HTTPException) as caught:
        await movements.get_movement(DEALER, "someone-elses")
    assert caught.value.status_code == 404


@pytest.mark.asyncio
async def test_a_shortage_is_422_with_the_functions_message_and_nothing_is_read_back():
    shortage = APIError({"code": "P0001", "message": "Only 3 in stock at this location"})
    with (
        patch(f"{REPO}.record_movement", side_effect=shortage),
        patch(f"{REPO}.fetch_row") as read,
        pytest.raises(AppHTTPException) as caught,
    ):
        await movements.record(DEALER, "p", "l", "out", "LOCAL_SALE", 5, None)
    assert (caught.value.status_code, caught.value.code) == (422, "insufficient_stock")
    assert caught.value.detail == "Only 3 in stock at this location"
    read.assert_not_called()


@pytest.mark.parametrize(
    ("path", "body", "expected"),
    [
        ("stock-in", {"quantity": 2.5, "reason": "Delivery"}, ("in", "RESTOCK", 2.5, "Delivery")),
        ("stock-out", {"source": "LOCAL_SALE", "quantity": 1}, ("out", "LOCAL_SALE", 1, None)),
        ("stock-out", {"source": "DAMAGE", "quantity": 1, "reason": "Wet"}, ("out", "DAMAGE", 1, "Wet")),
        ("stock-out", {"source": "EXPIRY", "quantity": 0.5, "reason": "Old"}, ("out", "EXPIRY", 0.5, "Old")),
        ("stock-out", {"source": "OTHER", "quantity": 2, "reason": "Own use"}, ("out", "OTHER", 2, "Own use")),
        (
            "adjustment",
            {"direction": "out", "quantity": 3, "reason": "Count"},
            ("out", "MANUAL_ADJUSTMENT", 3, "Count"),
        ),
        ("adjustment", {"direction": "in", "quantity": 1, "reason": "Found"}, ("in", "MANUAL_ADJUSTMENT", 1, "Found")),
    ],
)
def test_each_operation_writes_one_movement_with_its_source_and_direction(client, path, body, expected):
    with (
        patch(f"{REPO}.record_movement", return_value="m1") as record,
        patch(f"{REPO}.fetch_row", return_value=MOVEMENT),
    ):
        response = client.post(
            f"/api/v1/inventory/movements/{path}", json={"product_id": "p", "location_id": "l", **body}
        )
    assert response.status_code == 201, response.text
    record.assert_called_once_with("tok", "p", "l", *expected)


def test_a_refused_operation_never_calls_the_stock_function(client):
    with patch(f"{REPO}.record_movement") as record:
        for body in (
            {"quantity": 1.255},
            {"quantity": 0},
            {"quantity": -2},
        ):
            response = client.post(
                "/api/v1/inventory/movements/stock-in", json={"product_id": "p", "location_id": "l", **body}
            )
            assert response.status_code == 422, (body, response.text)
    record.assert_not_called()


def test_the_ledger_takes_repeated_sources_and_refuses_an_unknown_one(client):
    with patch(f"{REPO}.fetch_movements", return_value=[MOVEMENT]) as fetch:
        ok = client.get("/api/v1/inventory/movements?source=DAMAGE&source=EXPIRY&from=2026-10-01&to=2026-10-02")
        bad = client.get("/api/v1/inventory/movements?source=RETURN")
    assert ok.status_code == 200
    assert ok.json()[0]["id"] == "m1"
    assert fetch.call_args.kwargs["sources"] == ["DAMAGE", "EXPIRY"]
    assert bad.status_code == 422
