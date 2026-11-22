from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser, get_current_user, get_optional_user
from app.main import app

client = TestClient(app)

ADMIN = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok")
FARMER = AuthenticatedUser(id="farmer-1", email="f@x.com", role="farmer", access_token="tok2")


def test_list_listings_is_public():
    with patch("app.common.marketplace.router.service.fetch_listings", return_value=[]):
        response = client.get("/api/v1/marketplace/listings")
    assert response.status_code == 200


def test_list_listings_passes_owner_id_filter_through_to_the_service():
    with patch("app.common.marketplace.router.service.fetch_listings", return_value=[]) as mock_fetch:
        response = client.get("/api/v1/marketplace/listings", params={"owner_id": "farmer-1"})
    assert response.status_code == 200
    mock_fetch.assert_called_once_with(None, None, None, None, None, None, None, 0, "farmer-1", None)


def test_moderation_route_matched_before_generic_listing_id_route():
    app.dependency_overrides[get_current_user] = lambda: ADMIN
    try:
        with patch(
            "app.common.marketplace.router.service.fetch_all_listings_for_moderation", return_value=[]
        ) as mock_fetch:
            response = client.get("/api/v1/marketplace/listings/moderation")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 200
    mock_fetch.assert_called_once()


def test_moderation_route_rejects_non_admin():
    app.dependency_overrides[get_current_user] = lambda: FARMER
    try:
        response = client.get("/api/v1/marketplace/listings/moderation")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 403


def test_update_listing_status_rejects_non_admin_even_though_rls_would_allow_the_owner():
    # `listings_owner_write` RLS itself would let the owner change status too — but this route
    # is deliberately kept admin-only (matches the only callers this function has ever had:
    # the moderation screens, always with an audit log entry), preserved intentionally, not
    # loosened just because RLS alone wouldn't stop it.
    app.dependency_overrides[get_current_user] = lambda: FARMER
    try:
        response = client.patch("/api/v1/marketplace/listings/listing-1/status", json={"status": "inactive"})
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 403


def test_create_category_requires_admin():
    response = client.post("/api/v1/marketplace/categories", json={"name": "Seeds", "slug": "seeds"})
    assert response.status_code == 401


def test_create_listing_without_authorization_header_is_rejected():
    response = client.post(
        "/api/v1/marketplace/listings",
        json={"title": "Wheat", "price": 100, "unit": "kg", "quantity": 50},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_browsing_adds_each_listings_stock_word():
    from app.common.marketplace import service

    rows = [{"id": "l-1"}, {"id": "l-2"}]
    with (
        patch("app.common.marketplace.service.repo.fetch_listings", return_value=rows),
        patch("app.common.marketplace.service.repo.fetch_availability", return_value={"l-1": "low_stock"}) as words,
    ):
        listings = await service.fetch_listings()
    words.assert_called_once_with(["l-1", "l-2"], None)
    # A listing the database gave no word for reads `unknown`, never a guess.
    assert [listing["availability"] for listing in listings] == ["low_stock", "unknown"]


def _availability_client(outcome):
    """A database client whose `listing_availability` call raises `outcome` (an exception) or returns it as rows."""
    call = MagicMock()
    if isinstance(outcome, BaseException):
        call.execute = AsyncMock(side_effect=outcome)
    else:
        call.execute = AsyncMock(return_value=MagicMock(data=outcome))
    client = MagicMock()
    client.rpc.return_value = call
    return client


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "outcome",
    [
        APIError({"message": "canceling statement due to statement timeout", "code": "57014"}),
        httpx.ReadTimeout("timed out"),
        httpx.ConnectError("connection refused"),
        [{"availability": "in_stock"}],  # a row without its listing id
        [None],  # not a row at all
        ValueError("Expecting value: line 1 column 1"),  # an unreadable body
    ],
    ids=["database-timeout", "client-timeout", "connection-lost", "row-missing-key", "row-not-a-dict", "bad-body"],
)
async def test_browsing_never_fails_because_availability_does(outcome):
    # The availability contract (D7, SRDS §53.39): a stock problem never blocks the marketplace; the listing still
    # answers and reads `unknown`. The fault is raised inside the real repository read, not by replacing it.
    from app.common.marketplace import service

    with (
        patch("app.common.marketplace.service.repo.fetch_listing_by_id", return_value={"id": "l-1"}),
        patch("app.common.marketplace.repository.get_public_client", return_value=_availability_client(outcome)),
    ):
        listing = await service.fetch_listing_by_id("l-1")
    assert listing["availability"] == "unknown"


@pytest.mark.asyncio
async def test_a_programming_error_in_the_availability_read_is_not_hidden_as_unknown():
    # The fallback is for the faults a stock read can have, not a blanket catch: anything else still surfaces.
    from app.common.marketplace import repository

    with (
        patch("app.common.marketplace.repository.get_public_client", return_value=_availability_client(RuntimeError())),
        pytest.raises(RuntimeError),
    ):
        await repository.fetch_availability(["l-1"])


@pytest.mark.asyncio
async def test_availability_reads_each_word_and_unknown_for_a_listing_the_database_did_not_answer():
    from app.common.marketplace import repository

    rows = [
        {"listing_id": "l-1", "availability": "in_stock"},
        {"listing_id": "l-2", "availability": "low_stock"},
        {"listing_id": "l-3", "availability": "out_of_stock"},
    ]
    client = _availability_client(rows)
    with patch("app.common.marketplace.repository.get_public_client", return_value=client):
        words = await repository.fetch_availability(["l-1", "l-2", "l-3", "l-hidden"])
    client.rpc.assert_called_once_with("listing_availability", {"listing_ids": ["l-1", "l-2", "l-3", "l-hidden"]})
    assert words == {"l-1": "in_stock", "l-2": "low_stock", "l-3": "out_of_stock", "l-hidden": "unknown"}


# ---- the listing's inventory product link (B3, D8; listings.inventory_product_id)

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok3")
LISTING_ROW = {
    "id": "listing-1",
    "owner_id": "dealer-1",
    "title": "Urea",
    "price": 3900.0,
    "unit": "bag",
    "quantity": 1.0,
    "images": [],
    "status": "active",
    "created_at": "2026-10-11T00:00:00Z",
    "updated_at": "2026-10-11T00:00:00Z",
    "crop_compatibility": [],
}
# What guard_inventory_references (20261021080000_inventory_data_model.sql) raises for another dealer's product.
GUARD_REFUSAL = APIError({"message": "A listing can link only to its owner's product", "code": "42501"})
RLS_REFUSAL = APIError({"message": 'new row violates row-level security policy for table "listings"', "code": "42501"})


def _as(user):
    app.dependency_overrides[get_current_user] = lambda: user


@pytest.fixture
def signed_in():
    yield _as
    app.dependency_overrides.pop(get_current_user, None)


def test_creating_a_listing_sends_the_product_link(signed_in):
    signed_in(DEALER)
    created = {**LISTING_ROW, "inventory_product_id": "product-1"}
    with patch("app.common.marketplace.service.repo.create_listing", return_value=created) as create:
        response = client.post(
            "/api/v1/marketplace/listings",
            json={"title": "Urea", "price": 3900, "unit": "bag", "quantity": 1, "inventory_product_id": "product-1"},
        )
    assert response.status_code == 200, response.text
    assert response.json()["inventory_product_id"] == "product-1"
    _, owner, fields = create.call_args.args
    assert owner == "dealer-1"
    assert fields["inventory_product_id"] == "product-1"


def test_a_listing_created_without_a_product_has_no_link(signed_in):
    # A farmer's listing (and a dealer's unlinked one) is written with no product: availability then comes from the
    # listing's own quantity (listing_availability, 20261022090000_inventory_sync.sql).
    signed_in(FARMER)
    with patch("app.common.marketplace.service.repo.create_listing", return_value=LISTING_ROW) as create:
        response = client.post(
            "/api/v1/marketplace/listings", json={"title": "Wheat", "price": 100, "unit": "kg", "quantity": 50}
        )
    assert response.status_code == 200, response.text
    assert create.call_args.args[2]["inventory_product_id"] is None
    assert response.json()["inventory_product_id"] is None


@pytest.mark.parametrize("method", ["POST", "PATCH"])
def test_linking_another_dealers_product_is_refused_as_forbidden(signed_in, method):
    signed_in(FARMER)
    target = "create_listing" if method == "POST" else "update_listing"
    path = "/api/v1/marketplace/listings" + ("" if method == "POST" else "/listing-1")
    body = {"title": "Wheat", "price": 100, "unit": "kg", "quantity": 50, "inventory_product_id": "product-of-another"}
    with patch(f"app.common.marketplace.service.repo.{target}", side_effect=GUARD_REFUSAL):
        response = client.request(method, path, json=body)
    assert response.status_code == 403, response.text
    assert response.json()["code"] == "forbidden"
    assert response.json()["title"] == "You can link only your own inventory product"


def test_a_row_level_security_refusal_is_not_reported_as_a_foreign_product(signed_in):
    # Same SQLSTATE, different cause: the policies refused the seller. The generic database mapping answers, not the
    # product message, so the app does not tell a refused seller to pick another product.
    signed_in(DEALER)
    with patch("app.common.marketplace.service.repo.create_listing", side_effect=RLS_REFUSAL):
        response = client.post(
            "/api/v1/marketplace/listings",
            json={"title": "Urea", "price": 3900, "unit": "bag", "quantity": 1, "inventory_product_id": "product-1"},
        )
    assert response.status_code == 403, response.text
    assert "inventory product" not in response.text


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ({"title": "Urea 50kg"}, None),  # not sent: the link is kept (the column is not written)
        ({"title": "Urea 50kg", "inventory_product_id": None}, None),  # sent as null: the link is cleared
        ({"inventory_product_id": "product-2"}, "product-2"),  # sent: the link moves to that product
    ],
    ids=["kept", "cleared", "changed"],
)
def test_editing_a_listing_keeps_clears_or_changes_the_link(signed_in, body, expected):
    signed_in(DEALER)
    with patch("app.common.marketplace.service.repo.update_listing", return_value=LISTING_ROW) as update:
        response = client.patch("/api/v1/marketplace/listings/listing-1", json=body)
    assert response.status_code == 200, response.text
    token, listing_id, owner, fields = update.call_args.args
    assert (token, listing_id, owner) == ("tok3", "listing-1", "dealer-1")  # only the owner's own listing matches
    if "inventory_product_id" in body:
        assert "inventory_product_id" in fields
        assert fields["inventory_product_id"] == expected
    else:
        assert "inventory_product_id" not in fields


@pytest.mark.asyncio
async def test_a_slow_availability_read_is_abandoned_and_reads_unknown():
    # Contract "Listing availability": a timeout shows `unknown` and never holds the page (a locked IMS table would
    # otherwise hold it for the role's statement timeout).
    import asyncio
    import time

    from app.common.marketplace import repository

    async def never_answers():
        await asyncio.sleep(30)

    call = MagicMock()
    call.execute = never_answers
    slow = MagicMock()
    slow.rpc.return_value = call
    with (
        patch("app.common.marketplace.repository.get_public_client", return_value=slow),
        patch("app.common.marketplace.repository.AVAILABILITY_TIMEOUT_SECONDS", 0.05),
    ):
        started = time.monotonic()
        words = await repository.fetch_availability(["l-1"])
    assert words == {"l-1": "unknown"}
    assert time.monotonic() - started < 5


# ---- who sees the product link (SRDS §15: the dealer's inventory is private)


@pytest.mark.parametrize(
    ("viewer", "expected"),
    [(None, None), (FARMER, None), (ADMIN, None), (DEALER, "product-1")],
    ids=["signed-out", "another-user", "admin", "owner"],
)
def test_only_the_owner_sees_which_product_a_listing_sells_from(viewer, expected):
    row = {**LISTING_ROW, "inventory_product_id": "product-1"}
    app.dependency_overrides[get_optional_user] = lambda: viewer
    try:
        with (
            patch("app.common.marketplace.service.repo.fetch_listing_by_id", return_value=dict(row)),
            patch("app.common.marketplace.service.repo.fetch_listings", return_value=[dict(row)]),
            patch("app.common.marketplace.service.repo.fetch_availability", return_value={"listing-1": "in_stock"}),
        ):
            detail = client.get("/api/v1/marketplace/listings/listing-1")
            browse = client.get("/api/v1/marketplace/listings")
    finally:
        app.dependency_overrides.pop(get_optional_user, None)
    assert detail.status_code == 200, detail.text
    assert detail.json()["inventory_product_id"] == expected
    assert browse.json()[0]["inventory_product_id"] == expected


def test_the_moderation_list_does_not_show_the_admin_the_product_link(signed_in):
    signed_in(ADMIN)
    row = {**LISTING_ROW, "inventory_product_id": "product-1"}
    with patch("app.common.marketplace.service.repo.fetch_all_listings_for_moderation", return_value=[row]):
        response = client.get("/api/v1/marketplace/listings/moderation")
    assert response.status_code == 200, response.text
    assert response.json()[0]["inventory_product_id"] is None
