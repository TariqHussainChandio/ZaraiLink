"""stock.py: the one default location (D8), kept active, and transfers through transfer_stock."""

from unittest.mock import patch

import pytest
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser
from app.common.errors import AppHTTPException
from app.inventory import stock

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")
REPO = "app.inventory.repository"
SHOP = {"id": "shop", "is_default": True, "is_active": True}
GODOWN = {"id": "godown", "is_default": False, "is_active": True}


@pytest.mark.asyncio
async def test_the_existing_default_is_used():
    with patch(f"{REPO}.fetch_default_location", return_value=SHOP), patch(f"{REPO}.create_row") as create:
        assert await stock.ensure_default_location(DEALER) == SHOP
    create.assert_not_called()


@pytest.mark.asyncio
async def test_with_no_default_the_oldest_active_location_becomes_it():
    with (
        patch(f"{REPO}.fetch_default_location", return_value=None),
        patch(f"{REPO}.fetch_oldest_location", return_value=GODOWN),
        patch(f"{REPO}.set_default_location") as move,
        patch(f"{REPO}.fetch_row", return_value={**GODOWN, "is_default": True}),
    ):
        assert (await stock.ensure_default_location(DEALER))["is_default"] is True
    move.assert_called_once_with("tok", "godown")


@pytest.mark.asyncio
async def test_with_no_location_a_main_store_is_made():
    with (
        patch(f"{REPO}.fetch_default_location", return_value=None),
        patch(f"{REPO}.fetch_oldest_location", return_value=None),
        patch(f"{REPO}.create_row", return_value=SHOP) as create,
    ):
        await stock.ensure_default_location(DEALER)
    assert create.call_args.args[3] == {"name": "Main store", "kind": "shop", "is_default": True}


@pytest.mark.asyncio
async def test_the_first_location_is_the_default_whatever_was_asked():
    with (
        patch(f"{REPO}.fetch_default_location", return_value=None),
        patch(f"{REPO}.create_row", return_value=SHOP) as create,
    ):
        await stock.create_location(DEALER, {"name": "Shop", "is_default": False, "is_active": True})
    assert create.call_args.args[3]["is_default"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize(("existing", "is_default"), [(None, False), (SHOP, True)])
async def test_a_default_location_cannot_be_created_inactive(existing, is_default):
    with (
        patch(f"{REPO}.fetch_default_location", return_value=existing),
        patch(f"{REPO}.create_row") as create,
        pytest.raises(AppHTTPException) as caught,
    ):
        await stock.create_location(DEALER, {"name": "Shut", "is_default": is_default, "is_active": False})
    assert caught.value.status_code == 409
    create.assert_not_called()


@pytest.mark.asyncio
async def test_an_inactive_location_can_be_added_beside_the_default():
    with (
        patch(f"{REPO}.fetch_default_location", return_value=SHOP),
        patch(f"{REPO}.create_row", return_value={**GODOWN, "is_active": False}) as create,
    ):
        await stock.create_location(DEALER, {"name": "Old", "is_default": False, "is_active": False})
    assert create.call_args.args[3] == {"name": "Old", "is_active": False, "is_default": False}


@pytest.mark.asyncio
@pytest.mark.parametrize("fields", [{"is_active": False}, {"is_default": False}])
async def test_the_default_location_cannot_be_unset_or_deactivated(fields):
    with (
        patch(f"{REPO}.fetch_row", return_value=SHOP),
        patch(f"{REPO}.update_row") as update,
        pytest.raises(AppHTTPException) as caught,
    ):
        await stock.update_location(DEALER, "shop", fields)
    assert caught.value.status_code == 409
    update.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("current", "fields"),
    [({**GODOWN, "is_active": False}, {"is_default": True}), (GODOWN, {"is_default": True, "is_active": False})],
)
async def test_an_inactive_location_cannot_become_the_default(current, fields):
    with (
        patch(f"{REPO}.fetch_row", return_value=current),
        patch(f"{REPO}.update_row") as update,
        patch(f"{REPO}.set_default_location") as move,
        pytest.raises(AppHTTPException) as caught,
    ):
        await stock.update_location(DEALER, "godown", fields)
    assert caught.value.status_code == 409
    update.assert_not_called()
    move.assert_not_called()


@pytest.mark.asyncio
async def test_moving_the_default_is_one_function_call_after_the_other_fields():
    with (
        patch(f"{REPO}.fetch_row", side_effect=[GODOWN, {**GODOWN, "name": "Main", "is_default": True}]),
        patch(f"{REPO}.update_row", return_value={**GODOWN, "name": "Main"}) as update,
        patch(f"{REPO}.set_default_location") as move,
    ):
        moved = await stock.update_location(DEALER, "godown", {"is_default": True, "name": "Main"})
    update.assert_called_once_with("tok", "inventory_locations", "godown", {"name": "Main"})
    move.assert_called_once_with("tok", "godown")
    assert moved["is_default"] is True


@pytest.mark.asyncio
async def test_a_location_created_as_the_default_is_inserted_plain_then_moved():
    with (
        patch(f"{REPO}.fetch_default_location", return_value=SHOP),
        patch(f"{REPO}.create_row", return_value=GODOWN) as create,
        patch(f"{REPO}.set_default_location") as move,
        patch(f"{REPO}.fetch_row", return_value={**GODOWN, "is_default": True}),
    ):
        created = await stock.create_location(DEALER, {"name": "Godown", "is_default": True, "is_active": True})
    assert create.call_args.args[3]["is_default"] is False
    move.assert_called_once_with("tok", "godown")
    assert created["is_default"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("code", "message"),
    [
        ("23514", "You need a default location: make another location the default first"),
        ("23514", "The default location must be active"),
        # set_default_location's own check, when the target was deactivated after the API read it
        ("22023", "The default location must be active"),
    ],
)
async def test_the_default_location_rules_of_the_database_reach_the_dealer_with_their_message(code, message):
    """F7: the two triggers (immediate and at commit) raise 23514; the dealer hears their message as a 409, not the
    generic 422 for a broken check."""
    with (
        patch(f"{REPO}.fetch_row", return_value=GODOWN),
        patch(f"{REPO}.set_default_location", side_effect=APIError({"code": code, "message": message})),
        pytest.raises(AppHTTPException) as caught,
    ):
        await stock.update_location(DEALER, "godown", {"is_default": True})
    assert (caught.value.status_code, caught.value.code, caught.value.detail) == (409, "conflict", message)


@pytest.mark.asyncio
async def test_another_check_violation_is_left_to_the_generic_map():
    with (
        patch(f"{REPO}.fetch_row", return_value=GODOWN),
        patch(f"{REPO}.update_row", side_effect=APIError({"code": "23514", "message": "violates check constraint x"})),
        pytest.raises(APIError),
    ):
        await stock.update_location(DEALER, "godown", {"name": "  "})


@pytest.mark.asyncio
async def test_the_default_location_cannot_be_deleted():
    with (
        patch(f"{REPO}.fetch_row", return_value=SHOP),
        patch(f"{REPO}.delete_or_deactivate") as delete,
        pytest.raises(AppHTTPException),
    ):
        await stock.delete_location(DEALER, "shop")
    delete.assert_not_called()


@pytest.mark.asyncio
async def test_a_transfer_shortage_is_422_insufficient_stock():
    shortage = APIError({"code": "P0001", "message": "Only 2 in stock"})
    with patch(f"{REPO}.transfer_stock", side_effect=shortage), pytest.raises(AppHTTPException) as caught:
        await stock.transfer(DEALER, {"product_id": "p", "from_location_id": "a", "to_location_id": "b", "quantity": 5})
    assert (caught.value.status_code, caught.value.code) == (422, "insufficient_stock")


@pytest.mark.asyncio
async def test_a_transfer_returns_both_halves():
    halves = [{"direction": "in"}, {"direction": "out"}]
    with (
        patch(f"{REPO}.transfer_stock", return_value="t1") as move,
        patch(f"{REPO}.fetch_transfer_movements", return_value=halves) as read,
    ):
        result = await stock.transfer(
            DEALER, {"product_id": "p", "from_location_id": "a", "to_location_id": "b", "quantity": 5, "reason": None}
        )
    move.assert_called_once_with("tok", "p", "a", "b", 5, None)
    read.assert_called_once_with("tok", "t1")
    assert result == halves


@pytest.mark.asyncio
async def test_a_main_store_made_by_a_concurrent_request_is_used_not_refused():
    """Two first stock changes at once both find no location; the one-default index lets one Main store in and refuses
    the other (23505). The loser uses the default the winner made instead of failing."""
    duplicate = APIError({"code": "23505", "message": "duplicate key value violates unique constraint"})
    with (
        patch(f"{REPO}.fetch_default_location", side_effect=[None, SHOP]),
        patch(f"{REPO}.fetch_oldest_location", return_value=None),
        patch(f"{REPO}.create_row", side_effect=duplicate),
    ):
        assert await stock.ensure_default_location(DEALER) == SHOP


@pytest.mark.asyncio
async def test_another_refused_main_store_is_not_hidden():
    refused = APIError({"code": "42501", "message": "Only an approved dealer manages inventory"})
    with (
        patch(f"{REPO}.fetch_default_location", return_value=None),
        patch(f"{REPO}.fetch_oldest_location", return_value=None),
        patch(f"{REPO}.create_row", side_effect=refused),
        pytest.raises(APIError),
    ):
        await stock.ensure_default_location(DEALER)
