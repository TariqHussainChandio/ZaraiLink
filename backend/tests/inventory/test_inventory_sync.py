"""sync.py and its repository calls (B3; SRDS §19-§21, §53.39): the dealer's sync log, filtered and paged, and the retry
of their pending dispatch events, with the database's refusals answered as the inventory errors. The Supabase client is
the faked edge here; the same paths run against the real database in test_smoke_inventory_sync.py."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser, declared_roles, get_current_user
from app.common.errors import AppHTTPException
from app.common.pagination import page_range
from app.inventory import repository as repo
from app.inventory import sync
from app.main import app

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")
REPO = "app.inventory.repository"
ENTRY = {
    "id": "s1",
    "dealer_id": DEALER.id,
    "order_event_id": "e1",
    "order_id": "o1",
    "order_item_id": "oi1",
    "listing_id": "l1",
    "status": "failed",
    "error": "Only 1.00 in stock at this location",
    "attempts": 2,
    "processed_at": "2026-10-11T08:00:00+00:00",
}


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: DEALER
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)


class _Query:
    """A fluent stand-in for a postgrest query: records every step, answers with the queued data."""

    def __init__(self, log: list, data) -> None:
        self.log, self.data = log, data

    def __getattr__(self, name: str):
        def step(*args, **kwargs):
            self.log.append((name, args, kwargs))
            return self

        return step

    async def execute(self):
        return SimpleNamespace(data=self.data, count=None)


class _Client:
    def __init__(self, data=None) -> None:
        self.log: list = []
        self.data = data if data is not None else []

    def table(self, name: str) -> _Query:
        self.log.append(("table", (name,), {}))
        return _Query(self.log, self.data)

    def rpc(self, name: str, params: dict) -> _Query:
        self.log.append(("rpc", (name, params), {}))
        return _Query(self.log, self.data)


def _patched(client: _Client):
    return patch(f"{REPO}.get_user_scoped_client", AsyncMock(return_value=client))


# --- routes -----------------------------------------------------------------------------------------------------------


@pytest.mark.parametrize(("method", "path"), [("GET", "/sync/log"), ("POST", "/sync/retry")])
def test_both_routes_are_for_the_dealer_alone(method, path):
    """require_dealer is require_role("dealer") behind the approval check: no admin, buyer, farmer or expert route."""
    route = next(r for r in sync.router.routes if r.path == path and method in r.methods)
    roles = {declared_roles[d.call] for d in route.dependant.dependencies if d.call in declared_roles}
    assert roles == {("dealer",)}


def test_the_log_answers_the_dealers_entries(client):
    with patch(f"{REPO}.fetch_sync_log", return_value=[ENTRY]) as fetch:
        response = client.get("/api/v1/inventory/sync/log")
    assert response.status_code == 200, response.text
    assert response.json() == [ENTRY]
    assert fetch.call_args.args == ("tok", None)


def test_the_log_filters_by_status(client):
    with patch(f"{REPO}.fetch_sync_log", return_value=[ENTRY]) as fetch:
        response = client.get("/api/v1/inventory/sync/log?status=failed")
    assert response.status_code == 200, response.text
    assert fetch.call_args.args == ("tok", "failed")


@pytest.mark.parametrize("status", ["pending", "FAILED", "applied;drop", ""])
def test_an_unknown_status_is_a_field_error_and_reaches_no_query(client, status):
    with patch(f"{REPO}.fetch_sync_log") as fetch:
        response = client.get(f"/api/v1/inventory/sync/log?status={status}")
    assert response.status_code == 422, response.text
    fetch.assert_not_called()


def test_the_log_is_paged(client):
    seen: list = []

    async def fake(*_args, **_kwargs):
        seen.append(page_range())
        return [ENTRY] * 5

    with patch(f"{REPO}.fetch_sync_log", side_effect=fake):
        response = client.get("/api/v1/inventory/sync/log?limit=5&offset=10")
    assert response.status_code == 200, response.text
    assert seen == [(10, 14)]
    assert 'rel="next"' in response.headers.get("link", "")


def test_retry_answers_how_many_events_it_applied(client):
    with patch(f"{REPO}.retry_dispatch_events", return_value=2) as retry:
        response = client.post("/api/v1/inventory/sync/retry")
    assert response.status_code == 200, response.text
    assert response.json() == {"applied": 2}
    assert retry.call_args.args == ("tok",)


def test_retry_with_nothing_pending_applies_nothing(client):
    with patch(f"{REPO}.retry_dispatch_events", return_value=0):
        response = client.post("/api/v1/inventory/sync/retry")
    assert response.json() == {"applied": 0}


# --- service ----------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_dealer_the_database_refuses_gets_403_not_500():
    """retry_dispatch_events raises 42501 through inventory_caller for anyone not an approved, unsuspended dealer (a
    dealer suspended after their token was issued, for one)."""
    refused = APIError({"code": "42501", "message": "Only an approved dealer manages inventory"})
    with patch(f"{REPO}.retry_dispatch_events", side_effect=refused), pytest.raises(AppHTTPException) as caught:
        await sync.retry_pending(DEALER)
    assert (caught.value.status_code, caught.value.code) == (403, "forbidden")
    assert caught.value.detail == "Only an approved dealer manages inventory"


@pytest.mark.asyncio
async def test_any_other_database_error_is_left_to_the_global_map():
    with (
        patch(f"{REPO}.retry_dispatch_events", side_effect=APIError({"code": "57014", "message": "timeout"})),
        pytest.raises(APIError),
    ):
        await sync.retry_pending(DEALER)


# --- repository -------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_the_log_is_read_with_the_dealers_token_newest_first_within_the_page():
    """The dealer's own token: row-level security (owner and approved, no admin) decides which rows come back."""
    client = _Client([ENTRY])
    with _patched(client) as scoped:
        rows = await repo.fetch_sync_log("tok", "failed")
    assert rows == [ENTRY]
    assert scoped.call_args.args == ("tok",)
    steps = [(name, args) for name, args, _ in client.log]
    assert ("table", ("inventory_sync_log",)) in steps
    assert ("eq", ("status", "failed")) in steps
    assert next(kwargs for name, _, kwargs in client.log if name == "order") == {"desc": True}
    assert any(name == "range" for name, _ in steps)


@pytest.mark.asyncio
async def test_without_a_status_the_log_is_not_filtered():
    client = _Client([])
    with _patched(client):
        await repo.fetch_sync_log("tok")
    assert not any(name == "eq" for name, _, _ in client.log)


@pytest.mark.asyncio
@pytest.mark.parametrize(("data", "applied"), [(3, 3), (0, 0), (None, 0), ([], 0)])
async def test_retry_calls_the_one_database_function_and_reads_its_count(data, applied):
    client = _Client(data)
    with _patched(client) as scoped:
        assert await repo.retry_dispatch_events("tok") == applied
    assert scoped.call_args.args == ("tok",)
    assert ("rpc", ("retry_dispatch_events", {}), {}) in client.log
    # nothing else: the stock moves only through the database function
    assert not any(name == "table" for name, _, _ in client.log)
