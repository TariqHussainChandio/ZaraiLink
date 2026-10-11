"""products.py: the product view, the default threshold, and ownership checked before anything is written. Only the
repository edge is mocked; row-level security itself is proven on the real stack (test_smoke_inventory_isolation.py)."""

from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.auth.dependencies import AuthenticatedUser
from app.inventory import products

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")
REPO = "app.inventory.repository"

ROW = {
    "id": "p1",
    "dealer_id": DEALER.id,
    "sku": "UREA",
    "name": "Urea",
    "unit": "bag",
    "reorder_threshold": 5,
    "is_active": True,
    "stock": [{"location_id": "shop", "quantity": "7.50"}, {"location_id": "godown", "quantity": 3}],
    "listings": [{"id": "l1", "title": "Urea 50kg"}],
}


def test_the_product_view_totals_stock_and_names_the_default_location_quantity():
    view = products.product_view(ROW, "shop")
    assert view["stock"] == [{"location_id": "shop", "quantity": 7.5}, {"location_id": "godown", "quantity": 3.0}]
    assert view["total_quantity"] == 10.5
    assert view["default_location_quantity"] == 7.5
    assert view["listings"] == [{"id": "l1", "title": "Urea 50kg"}]


def test_a_product_with_no_stock_or_default_location_reads_as_zero():
    view = products.product_view({**ROW, "stock": None, "listings": None}, None)
    assert (view["total_quantity"], view["default_location_quantity"], view["listings"]) == (0, 0, [])


@pytest.mark.asyncio
async def test_a_product_without_its_own_threshold_takes_the_dealer_default():
    with (
        patch(f"{REPO}.fetch_alert_settings", return_value={"default_reorder_threshold": 4}),
        patch(f"{REPO}.create_row", return_value={"id": "p1"}) as create,
        patch(f"{REPO}.fetch_product", return_value=ROW),
        patch(f"{REPO}.fetch_default_location", return_value={"id": "shop"}),
    ):
        await products.create_product(DEALER, {"sku": "UREA", "name": "Urea", "reorder_threshold": 0}, False)
    assert create.call_args.args[3]["reorder_threshold"] == 4


@pytest.mark.asyncio
async def test_a_product_with_its_own_threshold_keeps_it():
    with (
        patch(f"{REPO}.fetch_alert_settings") as settings,
        patch(f"{REPO}.create_row", return_value={"id": "p1"}) as create,
        patch(f"{REPO}.fetch_product", return_value=ROW),
        patch(f"{REPO}.fetch_default_location", return_value=None),
    ):
        await products.create_product(DEALER, {"sku": "UREA", "name": "Urea", "reorder_threshold": 0}, True)
    settings.assert_not_called()
    assert create.call_args.args[3]["reorder_threshold"] == 0


@pytest.mark.asyncio
async def test_a_product_the_dealer_cannot_see_is_404_and_nothing_is_unlinked_or_deleted():
    with (
        patch(f"{REPO}.fetch_product", return_value=None),
        patch(f"{REPO}.unlink_product_listings") as unlink,
        patch(f"{REPO}.delete_or_deactivate") as delete,
        pytest.raises(HTTPException) as caught,
    ):
        await products.delete_product(DEALER, "someone-elses")
    assert caught.value.status_code == 404
    unlink.assert_not_called()
    delete.assert_not_called()


@pytest.mark.asyncio
async def test_a_listing_that_is_not_the_dealers_own_is_not_linked():
    with (
        patch(f"{REPO}.fetch_product", return_value=ROW),
        patch(f"{REPO}.fetch_default_location", return_value=None),
        patch(f"{REPO}.fetch_owned_listing", return_value=None),
        patch(f"{REPO}.set_listing_product") as link,
        pytest.raises(HTTPException) as caught,
    ):
        await products.link_listing(DEALER, "p1", "farmers-listing")
    assert caught.value.status_code == 404
    link.assert_not_called()


@pytest.mark.asyncio
async def test_unlinking_a_listing_linked_to_another_product_is_404():
    with (
        patch(f"{REPO}.fetch_owned_listing", return_value={"id": "l1", "inventory_product_id": "p2"}),
        patch(f"{REPO}.set_listing_product") as link,
        pytest.raises(HTTPException) as caught,
    ):
        await products.unlink_listing(DEALER, "p1", "l1")
    assert caught.value.status_code == 404
    link.assert_not_called()


@pytest.mark.asyncio
async def test_an_empty_update_writes_nothing():
    with (
        patch(f"{REPO}.update_row") as update,
        patch(f"{REPO}.fetch_product", return_value=ROW),
        patch(f"{REPO}.fetch_default_location", return_value=None),
    ):
        await products.update_product(DEALER, "p1", {})
    update.assert_not_called()
