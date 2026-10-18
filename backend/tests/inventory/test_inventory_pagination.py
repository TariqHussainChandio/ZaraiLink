"""Every B2 list route is paged (limit and offset, `Link: rel="next"` when a page comes back full), and the page reaches
the repository's query through page_range(); the lists that must weigh every row (alerts, dashboard) are not paged."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.common.pagination import page_range
from app.main import app

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")
REPO = "app.inventory.repository"

PAGED = [
    ("/api/v1/inventory/products", "fetch_products"),
    ("/api/v1/inventory/stock", "fetch_stock"),
    ("/api/v1/inventory/locations", "list_active_or_all"),
    ("/api/v1/inventory/movements", "fetch_movements"),
    ("/api/v1/inventory/suppliers", "list_active_or_all"),
    ("/api/v1/inventory/purchases", "fetch_purchases"),
]


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: DEALER
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)


def _capture(seen: list, rows: list):
    async def fake(*_args, **_kwargs):
        seen.append(page_range())
        return rows

    return fake


@pytest.mark.parametrize(("path", "repo_function"), PAGED)
def test_the_requested_page_reaches_the_query(client, path, repo_function):
    seen: list = []
    with (
        patch(f"{REPO}.{repo_function}", side_effect=_capture(seen, [])),
        patch(f"{REPO}.fetch_default_location", return_value=None),
    ):
        response = client.get(f"{path}?limit=5&offset=10")
    assert response.status_code == 200, response.text
    assert seen == [(10, 14)]
    assert "link" not in response.headers  # an empty page announces no next one


def _movement(n: int) -> dict:
    return {
        "id": f"m{n}",
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


def test_a_full_page_announces_the_next_and_keeps_the_filters(client):
    with patch(f"{REPO}.fetch_movements", side_effect=_capture([], [_movement(1), _movement(2)])):
        response = client.get("/api/v1/inventory/movements?source=DAMAGE&limit=2&offset=4")
    assert response.status_code == 200, response.text
    link = response.headers["link"]
    assert link.startswith("</api/v1/inventory/movements?")
    assert link.endswith('>; rel="next"')
    assert "source=DAMAGE" in link
    assert "limit=2" in link
    assert "offset=6" in link


def test_a_short_page_is_the_last(client):
    with patch(f"{REPO}.fetch_movements", side_effect=_capture([], [_movement(1)])):
        response = client.get("/api/v1/inventory/movements?limit=2")
    assert response.status_code == 200
    assert "link" not in response.headers


@pytest.mark.parametrize(("path", "_"), PAGED)
@pytest.mark.parametrize("query", ["limit=0", "limit=101", "offset=-1", "limit=abc"])
def test_an_impossible_page_is_refused(client, path, _, query):
    assert client.get(f"{path}?{query}").status_code == 422


def test_the_default_page_is_one_hundred_rows(client):
    seen: list = []
    with patch(f"{REPO}.fetch_movements", side_effect=_capture(seen, [])):
        client.get("/api/v1/inventory/movements")
    assert seen == [(0, 99)]
