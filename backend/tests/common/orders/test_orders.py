from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.common.orders import service
from app.main import app

client = TestClient(app)


def _mock_no_expiry_sweep():
    # `_expire_stale_pending_orders` runs at the top of every status-mutating/order-reading
    # service function; tests that aren't specifically exercising expiry stub it out to an empty
    # result so they don't need to care about it.
    return patch("app.common.orders.service.repo.fetch_stale_pending_order_ids", return_value=[])


BUYER = AuthenticatedUser(id="buyer-1", email="b@x.com", role="buyer", access_token="tok")
ADMIN = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok3")
SELLER_A = "seller-a"
SELLER_B = "seller-b"

LISTINGS = [
    {"id": "l-1", "status": "active", "quantity": 100, "price": 50.0, "owner_id": SELLER_A},
    {"id": "l-2", "status": "active", "quantity": 100, "price": 20.0, "owner_id": SELLER_A},
    {"id": "l-3", "status": "active", "quantity": 100, "price": 10.0, "owner_id": SELLER_B},
]
AVAILABILITY = [{"listing_id": l["id"], "available": l["quantity"]} for l in LISTINGS]


def _mock_checkout_reads():
    # AsyncMock, not a plain lambda — _assert_available awaits both of these concurrently via
    # asyncio.gather, which requires each to actually be awaitable.
    return patch.multiple(
        "app.common.orders.service.repo",
        fetch_listings_for_checkout=AsyncMock(return_value=LISTINGS),
        get_available_stock=AsyncMock(return_value=AVAILABILITY),
        # The order is read again after its items exist, because the database prices them (subtotal 100 here).
        fetch_order_by_id=AsyncMock(side_effect=lambda _token, order_id: {"id": order_id, "product_subtotal": 100.0}),
    )


# --- checkout: server-authoritative pricing & grouping -----------------------------------


@pytest.mark.asyncio
async def test_checkout_prices_from_the_listing_not_the_client():
    # Cart items carry ONLY listing_id/quantity — there is no price field the client could
    # supply at all, closing the gap where the original frontend priced orders from a
    # client-cached cart value.
    cart_items = [{"listing_id": "l-1", "quantity": 2}]

    with _mock_checkout_reads():
        with patch("app.common.orders.service.repo.insert_order", return_value={"id": "order-1"}) as mock_insert:
            with patch("app.common.orders.service.repo.insert_order_items") as mock_items:
                created = await service.checkout(BUYER, cart_items, {})

    # the response carries the priced order, not the empty row the insert returned
    assert created == [{"id": "order-1", "product_subtotal": 100.0}]
    # subtotal = listing price (50.0) * quantity (2) = 100.0 — computed server-side.
    mock_insert.assert_called_once_with(BUYER.access_token, BUYER.id, SELLER_A, 100.0, 0)
    items_arg = mock_items.call_args[0][2]
    assert items_arg[0]["unit_price"] == 50.0


@pytest.mark.asyncio
async def test_checkout_splits_multi_seller_cart_into_separate_orders():
    cart_items = [
        {"listing_id": "l-1", "quantity": 1},  # seller A
        {"listing_id": "l-3", "quantity": 1},  # seller B
    ]

    with _mock_checkout_reads():
        with patch(
            "app.common.orders.service.repo.insert_order", side_effect=[{"id": "order-a"}, {"id": "order-b"}]
        ) as mock_insert:
            with patch("app.common.orders.service.repo.insert_order_items"):
                orders = await service.checkout(BUYER, cart_items, {})

    assert len(orders) == 2
    seller_ids = {call.args[2] for call in mock_insert.call_args_list}
    assert seller_ids == {SELLER_A, SELLER_B}


@pytest.mark.asyncio
async def test_checkout_rejects_inactive_listing():
    inactive_listings = [{**LISTINGS[0], "status": "inactive"}]
    with patch("app.common.orders.service.repo.fetch_listings_for_checkout", return_value=inactive_listings):
        with patch("app.common.orders.service.repo.get_available_stock", return_value=[]):
            with pytest.raises(HTTPException) as exc_info:
                await service.checkout(BUYER, [{"listing_id": "l-1", "quantity": 1}], {})
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_checkout_rejects_over_available_stock():
    low_stock = [{"listing_id": "l-1", "available": 1}]
    with patch("app.common.orders.service.repo.fetch_listings_for_checkout", return_value=LISTINGS):
        with patch("app.common.orders.service.repo.get_available_stock", return_value=low_stock):
            with pytest.raises(HTTPException) as exc_info:
                await service.checkout(BUYER, [{"listing_id": "l-1", "quantity": 5}], {})
    assert exc_info.value.status_code == 422


# --- status transitions: server-authoritative current state ------------------------------


@pytest.mark.asyncio
async def test_update_status_ignores_any_client_notion_of_current_state():
    # The request schema (UpdateOrderStatusRequest) only has a `to` field — there is no `from`
    # for the client to assert at all; the service always re-reads the real status itself.
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "pending"}
    with _mock_no_expiry_sweep():
        with patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
            with patch("app.common.orders.service.repo.update_order_status") as mock_update:
                await service.update_order_status(BUYER, "o-1", "cancelled")
    mock_update.assert_called_once_with(BUYER.access_token, "o-1", "cancelled")


SELLER_USER = AuthenticatedUser(id=SELLER_A, email="s@x.com", role="farmer", access_token="seller-tok")


@contextmanager
def _order_in_status_for(order: dict, update_error: Exception | None = None):
    """A given order whose status update is captured (or raises `update_error`)."""
    with (
        _mock_no_expiry_sweep(),
        patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order),
        patch("app.common.orders.service.repo.update_order_status", side_effect=update_error) as mock_update,
    ):
        yield mock_update


@contextmanager
def _order_in_status(status: str):
    """An order in `status` whose writes are captured; yields the mock that records the status update."""
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": status}
    with (
        _mock_no_expiry_sweep(),
        patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order),
        patch("app.common.orders.service.repo.update_order_status") as mock_update,
    ):
        yield mock_update


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "to"),
    [
        ("pending", "confirmed"),
        ("pending", "rejected"),
        ("confirmed", "processing"),
        ("processing", "ready"),
        ("ready", "dispatched"),
        ("dispatched", "completed"),
        ("pending", "payment_failed"),
    ],
)
async def test_a_buyer_cannot_make_the_sellers_moves(status, to):
    with _order_in_status(status) as mock_update, pytest.raises(HTTPException) as exc_info:
        await service.update_order_status(BUYER, "o-1", to)
    assert exc_info.value.status_code == 403
    mock_update.assert_not_called()


@pytest.mark.asyncio
async def test_the_seller_cannot_dispute_their_own_sale():
    with _order_in_status("completed") as mock_update, pytest.raises(HTTPException) as exc_info:
        await service.update_order_status(SELLER_USER, "o-1", "disputed")
    assert exc_info.value.status_code == 403
    mock_update.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("actor", [BUYER, SELLER_USER])
async def test_a_participant_cannot_resolve_a_dispute(actor):
    with _order_in_status("disputed") as mock_update, pytest.raises(HTTPException) as exc_info:
        await service.update_order_status(actor, "o-1", "completed")
    assert exc_info.value.status_code == 403
    mock_update.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("actor", "status"),
    [(BUYER, "pending"), (SELLER_USER, "confirmed")],
)
async def test_either_side_may_cancel(actor, status):
    with _order_in_status(status) as mock_update:
        await service.update_order_status(actor, "o-1", "cancelled")
    mock_update.assert_called_once()


@pytest.mark.asyncio
async def test_the_buyer_may_dispute_a_completed_order():
    with _order_in_status("completed") as mock_update:
        await service.update_order_status(BUYER, "o-1", "disputed")
    mock_update.assert_called_once()


@pytest.mark.asyncio
async def test_update_status_rejects_non_participant():
    stranger = AuthenticatedUser(id="stranger-1", email="s@x.com", role="buyer", access_token="tok2")
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "pending"}
    with _mock_no_expiry_sweep():
        with patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
            with pytest.raises(HTTPException) as exc_info:
                await service.update_order_status(stranger, "o-1", "cancelled")
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_update_status_rejects_non_participant_admin_on_pending_order():
    # Bug regression case: an admin who is neither buyer nor seller must NOT be able to confirm
    # (or otherwise act on) a `pending` order just by virtue of being admin — that transition
    # runs `_reduce_dealer_inventory_for_order` using the admin's OWN access token, which would
    # silently write another dealer's stock if this were allowed.
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "pending"}
    with _mock_no_expiry_sweep():
        with patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
            with pytest.raises(HTTPException) as exc_info:
                await service.update_order_status(ADMIN, "o-1", "confirmed")
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_update_status_allows_non_participant_admin_to_resolve_dispute():
    # The one intended non-participant-admin path: resolving a `disputed` order. A
    # non-participant admin acting on a `disputed` order should succeed exactly like a
    # participant would, and must NOT trigger inventory reduction (that only ever happens on
    # pending -> confirmed).
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "disputed"}
    with _mock_no_expiry_sweep():
        with patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
            with patch("app.common.orders.service.repo.update_order_status") as mock_update:
                with patch("app.common.orders.service.log_admin_action", new_callable=AsyncMock) as mock_audit:
                    await service.update_order_status(ADMIN, "o-1", "refunded")
    mock_update.assert_called_once_with(ADMIN.access_token, "o-1", "refunded")
    # BR-15: the admin's decision leaves an audit row
    mock_audit.assert_awaited_once_with(
        ADMIN,
        "resolve_order_dispute",
        "order",
        "o-1",
        previous_state={"status": "disputed"},
        new_state={"status": "refunded"},
    )


@pytest.mark.asyncio
async def test_update_status_rejects_non_participant_admin_on_wrong_transition_even_when_disputed():
    # Being admin-on-a-disputed-order is not a blanket bypass of ALLOWED_TRANSITIONS — an admin
    # still can't move a disputed order anywhere except refunded/completed.
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "disputed"}
    with _mock_no_expiry_sweep():
        with patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
            with pytest.raises(HTTPException) as exc_info:
                await service.update_order_status(ADMIN, "o-1", "pending")
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_update_status_rejects_illegal_transition():
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "completed"}
    with _mock_no_expiry_sweep():
        with patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
            with pytest.raises(HTTPException) as exc_info:
                await service.update_order_status(BUYER, "o-1", "pending")
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_update_status_rejects_expired_as_a_manual_target():
    # `expired` is a system-only transition — never reachable through the public API, even by a
    # participant on their own pending order.
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "pending"}
    with _mock_no_expiry_sweep():
        with patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
            with pytest.raises(HTTPException) as exc_info:
                await service.update_order_status(BUYER, "o-1", "expired")
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(("status", "to"), [("ready", "completed"), ("dispatched", "cancelled")])
async def test_dispatch_cannot_be_skipped_or_undone(status, to):
    # D5 (A4): a ready order is dispatched before it is completed, and nothing dispatched can be cancelled.
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": status}
    with _order_in_status_for(order) as mock_update, pytest.raises(HTTPException) as exc_info:
        await service.update_order_status(SELLER_USER, "o-1", to)
    assert exc_info.value.status_code == 422
    mock_update.assert_not_called()


@pytest.mark.asyncio
async def test_dispatching_is_one_update_and_the_stock_and_events_happen_in_the_database():
    # The stock cut and the outbox events are a database trigger on ready -> dispatched (proven against a real database
    # in test_smoke_dispatch.py); the service only sends the status change.
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "ready"}

    with _order_in_status_for(order) as mock_update:
        await service.update_order_status(SELLER_USER, "o-1", "dispatched")

    mock_update.assert_called_once_with(SELLER_USER.access_token, "o-1", "dispatched")


@pytest.mark.asyncio
async def test_confirming_an_order_is_one_update_and_the_stock_check_happens_in_the_database():
    # The stock check is a database trigger on pending -> confirmed (since A4 it only checks; dispatch takes the stock),
    # so the service only sends the status change, and never calls a stock function.
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "pending"}

    with _order_in_status_for(order) as mock_update:
        await service.update_order_status(SELLER_USER, "o-1", "confirmed")

    mock_update.assert_called_once_with(SELLER_USER.access_token, "o-1", "confirmed")


@pytest.mark.asyncio
async def test_confirming_an_order_rejects_when_stock_insufficient():
    # The trigger raises SQLSTATE P0001 when any linked item lacks stock, which fails the status update as a whole;
    # the service must translate that into a 422, not let it propagate as an unhandled 500.
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "pending"}
    insufficient_stock_error = APIError(
        {"message": "Not enough stock to confirm this order — needs 99 but only 5 in stock.", "code": "P0001"}
    )

    with _order_in_status_for(order, update_error=insufficient_stock_error):
        with pytest.raises(HTTPException) as exc_info:
            await service.update_order_status(SELLER_USER, "o-1", "confirmed")
    assert exc_info.value.status_code == 422
    assert "99" in exc_info.value.detail


# --- lazy stale-order expiry ------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetching_orders_expires_stale_pending_orders_first():
    with patch("app.common.orders.service.repo.fetch_stale_pending_order_ids", return_value=["o-1", "o-2"]):
        with patch("app.common.orders.service.repo.update_order_status") as mock_update:
            with patch("app.common.orders.service.repo.fetch_orders_for_user", return_value=[]):
                await service.fetch_orders_for_user(BUYER, "buyer")

    assert mock_update.call_args_list == [
        ((BUYER.access_token, "o-1", "expired"),),
        ((BUYER.access_token, "o-2", "expired"),),
    ]
    # `changed_by=None` — this is a system transition, not something to attribute to whichever
    # user happened to be the one loading their order list when the sweep ran.


@pytest.mark.asyncio
async def test_fetching_orders_with_no_stale_orders_does_not_touch_status():
    with patch("app.common.orders.service.repo.fetch_stale_pending_order_ids", return_value=[]):
        with patch("app.common.orders.service.repo.update_order_status") as mock_update:
            with patch("app.common.orders.service.repo.fetch_orders_for_user", return_value=[]):
                await service.fetch_orders_for_user(BUYER, "buyer")

    mock_update.assert_not_called()


# --- router-level ---------------------------------------------------------------------


def test_checkout_without_authorization_header_is_rejected():
    response = client.post("/api/v1/orders/checkout", json={"cart_items": []})
    assert response.status_code == 401


def test_update_status_request_schema_has_no_from_field():
    from app.common.orders.schemas import UpdateOrderStatusRequest

    assert "from" not in UpdateOrderStatusRequest.model_fields
    assert set(UpdateOrderStatusRequest.model_fields) == {"to"}


@pytest.mark.parametrize("role", ["expert", "admin"])
def test_experts_and_the_admin_cannot_check_out(role):
    # D9 (A4): only farmers, buyers and dealers buy; the database refuses the rest again (guard_orders_insert).
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        id=f"{role}-1", email=f"{role}@x.com", role=role, access_token="tok"
    )
    try:
        with patch("app.common.orders.router.service.checkout") as mock_checkout:
            response = client.post(
                "/api/v1/orders/checkout", json={"cart_items": [{"listing_id": "l-1", "quantity": 1}]}
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 403
    assert response.json()["code"] == "insufficient_role"
    mock_checkout.assert_not_called()
