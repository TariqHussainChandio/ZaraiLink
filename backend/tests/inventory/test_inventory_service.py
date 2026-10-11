"""service.py, the IMS behind the legacy dealer routes and the dealer analytics: a refused create leaves nothing behind
(F4), a hand-recorded change needs a positive quantity (F8), the legacy bodies take only finite, bounded figures (F5),
and the analytics summary weighs every product and every marketplace sale, not the first 1000 (F3)."""

import math
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.common.errors import AppHTTPException
from app.dealer.schemas import AdjustStockRequest, InventoryInput, InventoryUpdateInput
from app.inventory import service
from app.main import app

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")
REPO = "app.inventory.repository"
SHOP = {"id": "shop", "is_default": True}
LISTING = {"id": "lst1", "title": "Urea", "inventory_product_id": None}


# --- F4: a refused legacy create is undone ----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_create_whose_opening_stock_is_refused_leaves_no_product_and_no_link():
    refused = AppHTTPException(422, "refused", "validation_failed")
    with (
        patch(f"{REPO}.fetch_owned_listing", return_value=LISTING),
        patch(f"{REPO}.fetch_default_location", return_value=SHOP),
        patch(f"{REPO}.create_row", return_value={"id": "prod1"}) as create,
        patch(f"{REPO}.link_unlinked_listing", return_value=True) as link,
        patch("app.inventory.service.record", AsyncMock(side_effect=refused)),
        patch(f"{REPO}.unlink_product_listings") as unlink,
        patch(f"{REPO}.delete_row") as delete,
        pytest.raises(AppHTTPException) as caught,
    ):
        await service.legacy_create_inventory(
            DEALER, {"listing_id": "lst1", "stock_quantity": 5, "unit": "bag", "min_stock_threshold": 0}
        )
    assert caught.value is refused
    create.assert_called_once()
    link.assert_called_once_with("tok", DEALER.id, "lst1", "prod1")
    unlink.assert_called_once_with("tok", DEALER.id, "prod1")
    delete.assert_called_once_with("tok", "inventory_products", "prod1")


@pytest.mark.asyncio
async def test_a_create_whose_listing_link_is_refused_deletes_the_product():
    with (
        patch(f"{REPO}.fetch_owned_listing", return_value=LISTING),
        patch(f"{REPO}.fetch_default_location", return_value=SHOP),
        patch(f"{REPO}.create_row", return_value={"id": "prod1"}),
        patch(f"{REPO}.link_unlinked_listing", side_effect=AppHTTPException(403, "no", "forbidden")),
        patch("app.inventory.service.record", AsyncMock()) as record,
        patch(f"{REPO}.unlink_product_listings") as unlink,
        patch(f"{REPO}.delete_row") as delete,
        pytest.raises(AppHTTPException),
    ):
        await service.legacy_create_inventory(DEALER, {"listing_id": "lst1", "stock_quantity": 5, "unit": "bag"})
    record.assert_not_called()
    unlink.assert_called_once()
    delete.assert_called_once_with("tok", "inventory_products", "prod1")


@pytest.mark.asyncio
async def test_the_default_location_is_settled_before_the_product_is_written():
    order: list[str] = []

    async def location(_token):
        order.append("location")
        return SHOP

    async def create(*_args, **_kwargs):
        order.append("product")
        return {"id": "prod1"}

    with (
        patch(f"{REPO}.fetch_default_location", side_effect=location),
        patch(f"{REPO}.create_row", side_effect=create),
        patch("app.inventory.service.record", AsyncMock()),
        patch("app.inventory.service.legacy_get_inventory", AsyncMock(return_value={"id": "prod1"})),
    ):
        await service.legacy_create_inventory(DEALER, {"listing_id": None, "stock_quantity": 2, "unit": "bag"})
    assert order[0] == "location"
    assert order.index("product") > 0


@pytest.mark.asyncio
async def test_a_create_that_loses_the_listing_to_a_concurrent_create_leaves_nothing_and_answers_409():
    """N1: two creates both read the listing unlinked; the link only takes a listing whose product link is still empty,
    so the second finds it taken. Its product is deleted before any stock is recorded, and the dealer hears 409."""
    with (
        patch(f"{REPO}.fetch_owned_listing", return_value=LISTING),
        patch(f"{REPO}.fetch_default_location", return_value=SHOP),
        patch(f"{REPO}.create_row", return_value={"id": "prod2"}),
        patch(f"{REPO}.link_unlinked_listing", return_value=False) as link,
        patch("app.inventory.service.record", AsyncMock()) as record,
        patch(f"{REPO}.unlink_product_listings") as unlink,
        patch(f"{REPO}.delete_row") as delete,
        pytest.raises(AppHTTPException) as caught,
    ):
        await service.legacy_create_inventory(
            DEALER, {"listing_id": "lst1", "stock_quantity": 4, "unit": "bag", "min_stock_threshold": 0}
        )
    assert (caught.value.status_code, caught.value.code) == (409, "conflict")
    assert caught.value.detail == "This listing already has an inventory item"
    link.assert_called_once_with("tok", DEALER.id, "lst1", "prod2")
    record.assert_not_called()
    unlink.assert_called_once_with("tok", DEALER.id, "prod2")
    delete.assert_called_once_with("tok", "inventory_products", "prod2")


@pytest.mark.asyncio
async def test_the_listing_link_only_takes_a_listing_with_no_product():
    from types import SimpleNamespace

    calls: list[tuple] = []

    class _Query:
        def __getattr__(self, name):
            def step(*args):
                calls.append((name, args))
                return self

            return step

        async def execute(self):
            return SimpleNamespace(data=[], count=None)

    class _Client:
        def table(self, name):
            calls.append(("table", (name,)))
            return _Query()

    with patch("app.inventory.repository.get_user_scoped_client", AsyncMock(return_value=_Client())):
        from app.inventory import repository

        assert await repository.link_unlinked_listing("tok", DEALER.id, "lst1", "prod1") is False
    assert ("update", ({"inventory_product_id": "prod1"},)) in calls
    assert ("is_", ("inventory_product_id", "null")) in calls
    assert ("eq", ("owner_id", DEALER.id)) in calls


# --- N1 on edit: a listing moves to the item only while no other item holds it ----------------------------------------

ITEM = {"id": "prod1", "is_active": True, "stock": [], "listings": []}


@pytest.mark.asyncio
async def test_an_edit_takes_the_new_listing_first_and_only_then_lets_go_of_the_old_one():
    order: list[str] = []

    async def link(*_args):
        order.append("link")
        return True

    async def unlink(*_args, **_kwargs):
        order.append("unlink")

    async def update(*_args):
        order.append("update")
        return {}

    with (
        patch(f"{REPO}.fetch_product", return_value=ITEM),
        patch(f"{REPO}.fetch_owned_listing", return_value={**LISTING, "id": "lst2"}),
        patch(f"{REPO}.link_unlinked_listing", side_effect=link) as linked,
        patch(f"{REPO}.unlink_product_listings", side_effect=unlink) as unlinked,
        patch(f"{REPO}.update_row", side_effect=update),
        patch("app.inventory.service.legacy_get_inventory", AsyncMock(return_value={"id": "prod1"})),
    ):
        await service.legacy_update_inventory(DEALER, "prod1", {"listing_id": "lst2", "unit": "sack"})
    linked.assert_called_once_with("tok", DEALER.id, "lst2", "prod1")
    unlinked.assert_called_once_with("tok", DEALER.id, "prod1", except_listing_id="lst2")
    assert order == ["link", "unlink", "update"]


@pytest.mark.asyncio
async def test_an_edit_that_loses_the_listing_to_another_item_changes_nothing_and_answers_409():
    """Another create or edit took the listing after this edit read it: the conditional link takes 0 rows, the item's
    old link was never touched, and neither its fields nor its stock change."""
    with (
        patch(f"{REPO}.fetch_product", return_value=ITEM),
        patch(f"{REPO}.fetch_owned_listing", return_value={**LISTING, "id": "lst2"}),
        patch(f"{REPO}.link_unlinked_listing", return_value=False),
        patch(f"{REPO}.unlink_product_listings") as unlinked,
        patch(f"{REPO}.set_listing_product") as relinked,
        patch(f"{REPO}.update_row") as update,
        patch("app.inventory.service.record", AsyncMock()) as record,
        pytest.raises(AppHTTPException) as caught,
    ):
        await service.legacy_update_inventory(
            DEALER, "prod1", {"listing_id": "lst2", "unit": "sack", "stock_quantity": 9}
        )
    assert (caught.value.status_code, caught.value.code) == (409, "conflict")
    assert caught.value.detail == "This listing already has an inventory item"
    unlinked.assert_not_called()
    relinked.assert_not_called()
    update.assert_not_called()
    record.assert_not_called()


@pytest.mark.asyncio
async def test_an_edit_naming_the_listing_it_already_holds_keeps_it():
    with (
        patch(f"{REPO}.fetch_product", return_value=ITEM),
        patch(f"{REPO}.fetch_owned_listing", return_value={**LISTING, "inventory_product_id": "prod1"}),
        patch(f"{REPO}.link_unlinked_listing") as linked,
        patch(f"{REPO}.unlink_product_listings") as unlinked,
        patch("app.inventory.service.legacy_get_inventory", AsyncMock(return_value={"id": "prod1"})),
    ):
        await service.legacy_update_inventory(DEALER, "prod1", {"listing_id": "lst1"})
    linked.assert_not_called()
    unlinked.assert_called_once_with("tok", DEALER.id, "prod1", except_listing_id="lst1")


@pytest.mark.asyncio
async def test_an_edit_with_no_listing_lets_go_of_every_listing():
    with (
        patch(f"{REPO}.fetch_product", return_value=ITEM),
        patch(f"{REPO}.unlink_product_listings") as unlinked,
        patch("app.inventory.service.legacy_get_inventory", AsyncMock(return_value={"id": "prod1"})),
    ):
        await service.legacy_update_inventory(DEALER, "prod1", {"listing_id": None})
    unlinked.assert_called_once_with("tok", DEALER.id, "prod1", except_listing_id=None)


@pytest.mark.asyncio
async def test_letting_go_of_old_listings_spares_the_new_one():
    from types import SimpleNamespace

    calls: list[tuple] = []

    class _Query:
        def __getattr__(self, name):
            def step(*args):
                calls.append((name, args))
                return self

            return step

        async def execute(self):
            return SimpleNamespace(data=[], count=None)

    class _Client:
        def table(self, name):
            return _Query()

    from app.inventory import repository

    with patch("app.inventory.repository.get_user_scoped_client", AsyncMock(return_value=_Client())):
        await repository.unlink_product_listings("tok", DEALER.id, "prod1", except_listing_id="lst2")
    assert ("neq", ("id", "lst2")) in calls
    assert ("eq", ("inventory_product_id", "prod1")) in calls


# --- F8: a hand-recorded change needs a positive quantity -------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("type_", ["addition", "restock", "sale", "reduction"])
async def test_a_legacy_change_with_no_positive_quantity_is_refused_not_flipped(type_):
    with (
        patch(f"{REPO}.fetch_product", return_value={"id": "p", "is_active": True}),
        patch("app.inventory.service.record", AsyncMock()) as record,
    ):
        for quantity in (0, -1):
            with pytest.raises(AppHTTPException) as caught:
                await service.legacy_adjust_stock(DEALER, "p", type_, quantity, None)
            assert (caught.value.status_code, caught.value.code) == (422, "validation_failed")
    record.assert_not_called()


@pytest.mark.parametrize("type_", ["addition", "restock", "sale", "reduction"])
def test_the_legacy_adjust_body_refuses_a_non_positive_change(type_):
    for quantity in (0, -1):
        with pytest.raises(ValidationError):
            AdjustStockRequest(type=type_, quantity=quantity)
    assert AdjustStockRequest(type=type_, quantity=3).quantity == 3


@pytest.mark.parametrize("type_", ["adjustment", "correction"])
def test_setting_an_exact_quantity_may_set_zero_but_not_below(type_):
    assert AdjustStockRequest(type=type_, quantity=0).quantity == 0
    with pytest.raises(ValidationError):
        AdjustStockRequest(type=type_, quantity=-1)


# --- F5: the legacy bodies take finite, bounded figures ---------------------------------------------------------------


@pytest.mark.parametrize("field", ["purchase_cost", "selling_price"])
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf, -1, 10.555, 10_000_000_000])
def test_a_legacy_price_that_is_not_a_finite_two_decimal_amount_is_refused(field, value):
    base = {"listing_id": None, "stock_quantity": 1, "unit": "bag", "min_stock_threshold": 0}
    with pytest.raises(ValidationError):
        InventoryInput(**base, **{field: value})
    with pytest.raises(ValidationError):
        InventoryUpdateInput(**{field: value})


@pytest.mark.parametrize("field", ["stock_quantity", "min_stock_threshold"])
@pytest.mark.parametrize("value", [-1, 10_000_000_000, 1e10])
def test_a_legacy_stock_figure_out_of_the_databases_range_is_refused(field, value):
    base = {"listing_id": None, "stock_quantity": 1, "unit": "bag", "min_stock_threshold": 0}
    with pytest.raises(ValidationError):
        InventoryInput(**{**base, field: value})


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity", "1e400"])
def test_a_legacy_route_answers_422_not_500_to_a_non_json_number(literal):
    app.dependency_overrides[get_current_user] = lambda: DEALER
    try:
        with patch(f"{REPO}.create_row") as create:
            response = TestClient(app).post(
                "/api/v1/dealer/inventory",
                content=(
                    '{"listing_id": null, "stock_quantity": 1, "unit": "bag", "min_stock_threshold": 0, '
                    f'"purchase_cost": {literal}}}'
                ),
                headers={"Content-Type": "application/json"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "validation_failed"
    create.assert_not_called()


# --- F3: the analytics summary weighs everything ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_the_analytics_summary_reads_every_product_and_every_marketplace_sale():
    sales = [{"created_at": "2026-10-01T00:00:00+00:00", "quantity": "2", "product_id": "p"}] * 1500
    with (
        patch(f"{REPO}.fetch_products", return_value=[]) as products,
        patch(f"{REPO}.fetch_default_location", return_value=SHOP),
        patch(f"{REPO}.fetch_all_movements", return_value=sales) as every,
        patch(f"{REPO}.fetch_movements") as capped,
        patch("app.inventory.service.trend_movements", AsyncMock(return_value=[])),
    ):
        summary = await service.fetch_dealer_inventory_summary(DEALER)
    assert products.call_args.kwargs == {"include_inactive": False, "paged": False}
    assert every.call_args.kwargs["sources"] == ["ZARAILINK_ORDER"]
    capped.assert_not_called()
    assert len(summary["sales"]) == 1500
