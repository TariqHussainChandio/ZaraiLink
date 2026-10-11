"""purchasing.py: a purchase is edited only as a draft, moves stock only when received (once), and a supplier, product
or location the dealer cannot see is refused before anything is written."""

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser
from app.common.errors import AppHTTPException
from app.inventory import purchasing

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")
REPO = "app.inventory.repository"
DRAFT = {"id": "po1", "status": "draft", "items": []}
LINE = {"product_id": "p1", "location_id": "shop", "quantity": 2, "unit_cost": None}


def test_purchase_fields_drop_the_lines_and_an_empty_date():
    fields = {"supplier_id": "s", "purchased_on": None, "notes": "n", "items": [LINE]}
    assert purchasing._purchase_fields(fields) == {"supplier_id": "s", "notes": "n"}
    assert purchasing._purchase_fields({"purchased_on": "2026-10-01"}) == {"purchased_on": "2026-10-01"}


NOT_YOURS = APIError({"code": "42501", "message": "A purchase must use your own supplier, products and locations"})


@pytest.mark.asyncio
async def test_a_reference_of_another_dealer_is_refused_by_the_function_as_403():
    """The function checks every supplier, product and location itself, in the transaction that writes; a refusal
    writes nothing (create_purchase is atomic), so the API makes no pre-check reads."""
    with (
        patch(f"{REPO}.create_purchase", side_effect=NOT_YOURS),
        patch(f"{REPO}.fetch_purchase") as read,
        pytest.raises(AppHTTPException) as caught,
    ):
        await purchasing.create_purchase(DEALER, {"supplier_id": "theirs", "items": [LINE]})
    assert (caught.value.status_code, caught.value.code) == (403, "forbidden")
    assert caught.value.detail == purchasing.NOT_YOURS
    read.assert_not_called()


@pytest.mark.asyncio
async def test_a_create_sends_the_header_and_lines_in_one_call():
    with (
        patch(f"{REPO}.create_purchase", return_value="po1") as create,
        patch(f"{REPO}.fetch_purchase", return_value=DRAFT),
    ):
        created = await purchasing.create_purchase(
            DEALER, {"supplier_id": "s", "purchased_on": None, "notes": "n", "items": [LINE]}
        )
    assert created == DRAFT
    assert create.call_args.args == ("tok", {"supplier_id": "s", "notes": "n"}, [LINE])


@pytest.mark.asyncio
async def test_an_edit_with_lines_is_one_call_carrying_the_header():
    with (
        patch(f"{REPO}.fetch_purchase", return_value=DRAFT),
        patch(f"{REPO}.update_purchase") as header_only,
        patch(f"{REPO}.replace_purchase_items") as lines,
    ):
        await purchasing.update_purchase(DEALER, "po1", {"notes": "x", "items": [LINE]})
    lines.assert_called_once_with("tok", "po1", [LINE], {"notes": "x"})
    header_only.assert_not_called()


@pytest.mark.asyncio
async def test_an_edit_with_lines_and_no_header_change_sends_no_header():
    with (
        patch(f"{REPO}.fetch_purchase", return_value=DRAFT),
        patch(f"{REPO}.replace_purchase_items") as lines,
    ):
        await purchasing.update_purchase(DEALER, "po1", {"items": []})
    lines.assert_called_once_with("tok", "po1", [], None)


@pytest.mark.asyncio
async def test_a_header_only_edit_is_a_plain_update():
    with (
        patch(f"{REPO}.fetch_purchase", return_value=DRAFT),
        patch(f"{REPO}.update_purchase") as header_only,
        patch(f"{REPO}.replace_purchase_items") as lines,
    ):
        await purchasing.update_purchase(DEALER, "po1", {"notes": "x", "purchased_on": "2026-10-02"})
    header_only.assert_called_once_with("tok", "po1", {"notes": "x", "purchased_on": "2026-10-02"})
    lines.assert_not_called()


@pytest.mark.asyncio
async def test_an_edit_that_loses_the_race_to_a_receive_is_409():
    """The draft was read, then a receive committed first; replace_purchase_items finds it received (22023). The
    dealer hears the same 409 invalid_transition as for an edit of a received purchase."""
    with (
        patch(f"{REPO}.fetch_purchase", side_effect=[DRAFT, {**DRAFT, "status": "received"}]),
        patch(
            f"{REPO}.replace_purchase_items",
            side_effect=APIError({"code": "22023", "message": "This purchase is already received"}),
        ),
        pytest.raises(AppHTTPException) as caught,
    ):
        await purchasing.update_purchase(DEALER, "po1", {"items": [LINE]})
    assert (caught.value.status_code, caught.value.code) == (409, "invalid_transition")


@pytest.mark.asyncio
async def test_a_refused_line_figure_stays_a_validation_error():
    with (
        patch(f"{REPO}.fetch_purchase", return_value=DRAFT),
        patch(
            f"{REPO}.replace_purchase_items",
            side_effect=APIError({"code": "22023", "message": "Every purchase line needs an active location"}),
        ),
        pytest.raises(AppHTTPException) as caught,
    ):
        await purchasing.update_purchase(DEALER, "po1", {"items": [LINE]})
    assert (caught.value.status_code, caught.value.code) == (422, "validation_failed")


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["received", "cancelled"])
async def test_only_a_draft_is_edited_or_cancelled(status):
    with (
        patch(f"{REPO}.fetch_purchase", return_value={**DRAFT, "status": status}),
        patch(f"{REPO}.update_purchase") as update,
    ):
        for call in (
            purchasing.update_purchase(DEALER, "po1", {"notes": "x"}),
            purchasing.cancel_purchase(DEALER, "po1"),
        ):
            with pytest.raises(AppHTTPException) as caught:
                await call
            assert (caught.value.status_code, caught.value.code) == (409, "invalid_transition")
    update.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["received", "cancelled"])
async def test_receiving_a_purchase_that_is_no_draft_is_409_invalid_transition_like_edit_and_cancel(status):
    with (
        patch(f"{REPO}.fetch_purchase", return_value={**DRAFT, "status": status}),
        patch(f"{REPO}.receive_purchase") as receive,
        pytest.raises(AppHTTPException) as caught,
    ):
        await purchasing.receive_purchase(DEALER, "po1")
    assert (caught.value.status_code, caught.value.code) == (409, "invalid_transition")
    assert caught.value.detail == f"This purchase is already {status}"
    receive.assert_not_called()


@pytest.mark.asyncio
async def test_a_receive_that_loses_the_race_is_409_too():
    """Two receives read the draft at once; the function lets one through and refuses the other (22023). The loser
    hears the same 409 a later receive would."""
    with (
        patch(f"{REPO}.fetch_purchase", side_effect=[DRAFT, {**DRAFT, "status": "received"}]),
        patch(
            f"{REPO}.receive_purchase",
            side_effect=APIError({"code": "22023", "message": "This purchase is already received"}),
        ),
        pytest.raises(AppHTTPException) as caught,
    ):
        await purchasing.receive_purchase(DEALER, "po1")
    assert (caught.value.status_code, caught.value.code) == (409, "invalid_transition")


@pytest.mark.asyncio
async def test_an_empty_draft_is_still_refused_as_a_validation_error():
    with (
        patch(f"{REPO}.fetch_purchase", return_value=DRAFT),
        patch(
            f"{REPO}.receive_purchase",
            side_effect=APIError({"code": "22023", "message": "A purchase needs at least one line"}),
        ),
        pytest.raises(AppHTTPException) as caught,
    ):
        await purchasing.receive_purchase(DEALER, "po1")
    assert (caught.value.status_code, caught.value.code) == (422, "validation_failed")


@pytest.mark.asyncio
async def test_a_purchase_or_supplier_the_dealer_cannot_see_is_404_and_untouched():
    with (
        patch(f"{REPO}.fetch_purchase", return_value=None),
        patch(f"{REPO}.receive_purchase") as receive,
        patch(f"{REPO}.fetch_row", return_value=None),
        patch(f"{REPO}.delete_row") as delete,
    ):
        for call in (purchasing.receive_purchase(DEALER, "x"), purchasing.delete_supplier(DEALER, "x")):
            with pytest.raises(HTTPException) as caught:
                await call
            assert caught.value.status_code == 404
    receive.assert_not_called()
    delete.assert_not_called()
