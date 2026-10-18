import asyncio
import time
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import httpx
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
ADMIN = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok3", aal="aal2")
# The same admin before the second factor was verified this session: may read, may not write (admin_mfa_enforcement).
ADMIN_AAL1 = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok3-aal1", aal="aal1")
SELLER_A = "seller-a"
SELLER_B = "seller-b"

LISTINGS = [
    {"id": "l-1", "status": "active", "quantity": 100, "price": 50.0, "owner_id": SELLER_A, "title": "Wheat seeds"},
    {"id": "l-2", "status": "active", "quantity": 100, "price": 20.0, "owner_id": SELLER_A, "title": "Rice"},
    {"id": "l-3", "status": "active", "quantity": 100, "price": 10.0, "owner_id": SELLER_B, "title": "Maize"},
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

    with (
        _mock_checkout_reads(),
        patch(
            "app.common.orders.service.repo.insert_order", side_effect=[{"id": "order-a"}, {"id": "order-b"}]
        ) as mock_insert,
        patch("app.common.orders.service.repo.insert_order_items"),
    ):
        orders = await service.checkout(BUYER, cart_items, {})

    assert len(orders) == 2
    seller_ids = {call.args[2] for call in mock_insert.call_args_list}
    assert seller_ids == {SELLER_A, SELLER_B}


@pytest.mark.asyncio
async def test_checkout_rejects_inactive_listing():
    inactive_listings = [{**LISTINGS[0], "status": "inactive"}]
    with patch("app.common.orders.service.repo.fetch_listings_for_checkout", return_value=inactive_listings):
        with pytest.raises(HTTPException) as exc_info:
            await service.checkout(BUYER, [{"listing_id": "l-1", "quantity": 1}], {})
    assert exc_info.value.status_code == 422


# --- checkout: the stock check (D6, D7, SRDS §15) ------------------------------------------

LINKED = {
    "id": "l-9",
    "status": "active",
    "quantity": 100,  # the listing's own figure; a linked listing sells from the IMS product instead
    "price": 3900.0,
    "owner_id": SELLER_B,
    "title": "Urea 50kg",
    "inventory_product_id": "product-1",
}


@contextmanager
def _checkout_with(listings, stock):
    """Checkout with these listing rows; `stock` is what the IMS read returns, or the exception it raises."""
    read = AsyncMock(side_effect=stock) if isinstance(stock, BaseException) else AsyncMock(return_value=stock)
    with (
        patch("app.common.orders.service.repo.fetch_listings_for_checkout", AsyncMock(return_value=listings)),
        patch("app.common.orders.service.repo.get_available_stock", read),
        patch("app.common.orders.service.repo.insert_order", AsyncMock(return_value={"id": "order-1"})),
        patch("app.common.orders.service.repo.insert_order_items", AsyncMock()),
        patch(
            "app.common.orders.service.repo.fetch_order_by_id",
            AsyncMock(side_effect=lambda _token, order_id: {"id": order_id}),
        ),
    ):
        yield read


@pytest.mark.asyncio
async def test_an_unlinked_listing_is_checked_against_its_own_quantity_and_never_asks_the_ims():
    # A farmer's listing has no IMS product: even with the IMS down, its checkout neither waits on nor fails with it.
    with _checkout_with(LISTINGS, APIError({"message": "lock timeout", "code": "55P03"})) as ims:
        orders = await service.checkout(BUYER, [{"listing_id": "l-1", "quantity": 100}], {})
        assert orders == [{"id": "order-1"}]
        with pytest.raises(HTTPException) as exc_info:
            await service.checkout(BUYER, [{"listing_id": "l-1", "quantity": 101}], {})
    ims.assert_not_awaited()
    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "Not enough stock for Wheat seeds."


@pytest.mark.asyncio
async def test_a_linked_listing_is_checked_against_the_ims_and_the_refusal_names_no_figure():
    with (
        _checkout_with([LINKED], [{"listing_id": "l-9", "available": 3}]) as ims,
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.checkout(BUYER, [{"listing_id": "l-9", "quantity": 5}], {})
    ims.assert_awaited_once_with(["l-9"])  # only the linked listings of the caller's own cart
    assert exc_info.value.status_code == 422
    assert exc_info.value.code == "insufficient_stock"
    # SRDS §15: the buyer learns that it is short, never the dealer's figure (3) or the listing's own (100).
    assert exc_info.value.detail == "Not enough stock for Urea 50kg."
    assert not any(ch.isdigit() for ch in exc_info.value.detail.replace("50kg", ""))


@pytest.mark.asyncio
async def test_a_linked_listing_within_its_ims_stock_checks_out():
    with _checkout_with([LINKED], [{"listing_id": "l-9", "available": 5}]):
        assert await service.checkout(BUYER, [{"listing_id": "l-9", "quantity": 5}], {}) == [{"id": "order-1"}]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "fault",
    [
        APIError({"message": "canceling statement due to statement timeout", "code": "57014"}),
        httpx.ReadTimeout("timed out"),
        httpx.ConnectError("connection refused"),
        TimeoutError(),
        [{"available": 1}],  # a row without its listing id
        ValueError("Expecting value"),
    ],
    ids=["database-timeout", "client-timeout", "connection-lost", "deadline", "malformed-row", "bad-body"],
)
async def test_an_ims_fault_never_breaks_checkout_the_database_decides_at_confirm(fault):
    # D7, SRDS §53.39: the pre-check is skipped, not failed; check_stock_on_confirm and the dispatch stay the D6 gate.
    with _checkout_with([LINKED, LISTINGS[0]], fault):
        orders = await service.checkout(
            BUYER, [{"listing_id": "l-9", "quantity": 5000}, {"listing_id": "l-1", "quantity": 1}], {}
        )
    assert len(orders) == 2


@pytest.mark.asyncio
async def test_a_slow_ims_read_is_abandoned_after_the_deadline():
    async def never_answers(_ids):
        await asyncio.sleep(30)

    with (
        _checkout_with([LINKED], []) as ims,
        patch("app.common.orders.service.STOCK_READ_TIMEOUT_SECONDS", 0.05),
    ):
        ims.side_effect = never_answers
        started = time.monotonic()
        orders = await service.checkout(BUYER, [{"listing_id": "l-9", "quantity": 1}], {})
    assert orders == [{"id": "order-1"}]
    assert time.monotonic() - started < 5


@pytest.mark.asyncio
async def test_a_programming_error_in_the_ims_read_is_not_swallowed():
    with _checkout_with([LINKED], RuntimeError("bug")), pytest.raises(RuntimeError):
        await service.checkout(BUYER, [{"listing_id": "l-9", "quantity": 1}], {})


# --- status transitions: server-authoritative current state ------------------------------


@pytest.mark.asyncio
async def test_update_status_ignores_any_client_notion_of_current_state():
    # The request schema (UpdateOrderStatusRequest) only has a `to` field — there is no `from`
    # for the client to assert at all; the service always re-reads the real status itself.
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "pending"}
    with _mock_no_expiry_sweep(), patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
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
    with _mock_no_expiry_sweep(), patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
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
    with _mock_no_expiry_sweep(), patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
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
    with _mock_no_expiry_sweep(), patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
        with patch("app.common.orders.service.repo.update_order_status") as mock_update:
            with patch("app.common.orders.service.log_admin_action", new_callable=AsyncMock, create=True) as mock_audit:
                await service.update_order_status(ADMIN, "o-1", "refunded", "Goods arrived spoiled")
    # The reason is stored on the order with the move (admin_action_reason), for both parties to read.
    mock_update.assert_called_once_with(
        ADMIN.access_token, "o-1", "refunded", admin_action_reason="Goods arrived spoiled"
    )
    # The database writes the audit row in the same transaction (20261023080000); the service writes none of its own.
    mock_audit.assert_not_awaited()


@pytest.mark.asyncio
async def test_settling_a_dispute_without_a_reason_is_422_and_writes_nothing():
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "disputed"}
    with (
        _order_in_status_for(order) as mock_update,
        patch("app.common.orders.service.log_admin_action", new_callable=AsyncMock, create=True) as mock_audit,
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.update_order_status(ADMIN, "o-1", "completed")
    assert exc_info.value.status_code == 422
    assert exc_info.value.code == "validation_failed"
    assert "needs a reason" in exc_info.value.detail
    mock_update.assert_not_called()
    mock_audit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("actor", "status", "to"),
    [(BUYER, "pending", "cancelled"), (BUYER, "completed", "disputed"), (SELLER_USER, "pending", "confirmed")],
)
async def test_a_reason_from_anyone_but_the_settling_admin_is_refused_and_changes_nothing(actor, status, to):
    # Refused rather than dropped: the participant learns no reason was recorded, and nothing moves.
    with (
        _order_in_status(status) as mock_update,
        patch("app.common.orders.service.log_admin_action", new_callable=AsyncMock, create=True) as mock_audit,
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.update_order_status(actor, "o-1", to, "I say so")
    assert exc_info.value.status_code == 422
    assert exc_info.value.code == "validation_failed"
    assert "Only an admin settling a dispute" in exc_info.value.detail
    mock_update.assert_not_called()
    mock_audit.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_participants_move_without_a_reason_sends_no_reason_column():
    with _order_in_status("pending") as mock_update:
        await service.update_order_status(BUYER, "o-1", "cancelled")
    mock_update.assert_called_once_with(BUYER.access_token, "o-1", "cancelled")


@pytest.mark.parametrize("reason", ["", "   ", "x" * 501])
def test_the_status_route_refuses_an_empty_or_over_long_reason(reason):
    with _signed_in_as(ADMIN), patch("app.common.orders.router.service.update_order_status") as update:
        response = client.patch("/api/v1/orders/o-1/status", json={"to": "completed", "reason": reason})
    assert response.status_code == 422
    update.assert_not_called()


def test_the_status_route_passes_the_trimmed_reason_through():
    with (
        _signed_in_as(ADMIN),
        patch("app.common.orders.router.service.update_order_status", AsyncMock()) as update,
    ):
        response = client.patch("/api/v1/orders/o-1/status", json={"to": "completed", "reason": "  Delivered late  "})
    assert response.status_code == 204, response.text
    update.assert_awaited_once_with(ADMIN, "o-1", "completed", "Delivered late")


@pytest.mark.asyncio
async def test_update_status_rejects_non_participant_admin_on_wrong_transition_even_when_disputed():
    # Being admin-on-a-disputed-order is not a blanket bypass of ALLOWED_TRANSITIONS — an admin
    # still can't move a disputed order anywhere except refunded/completed.
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "disputed"}
    with _mock_no_expiry_sweep(), patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
        with pytest.raises(HTTPException) as exc_info:
            await service.update_order_status(ADMIN, "o-1", "pending")
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("to", ["refunded", "completed"])
async def test_an_admin_without_a_second_factor_cannot_resolve_a_dispute(to):
    # A dispute decision is an admin write: like every other one it needs aal2, even though the route is the
    # participants' status route. Nothing is written and nothing is audited.
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "disputed"}
    with (
        _order_in_status_for(order) as mock_update,
        patch("app.common.orders.service.log_admin_action", new_callable=AsyncMock, create=True) as mock_audit,
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.update_order_status(ADMIN_AAL1, "o-1", to)
    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "mfa_required"
    mock_update.assert_not_called()
    mock_audit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["pending", "confirmed", "processing", "ready", "dispatched", "completed"])
async def test_an_admin_cannot_resolve_an_order_that_is_not_disputed(status):
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": status}
    with (
        _order_in_status_for(order) as mock_update,
        patch("app.common.orders.service.log_admin_action", new_callable=AsyncMock, create=True) as mock_audit,
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.update_order_status(ADMIN, "o-1", "completed")
    assert exc_info.value.status_code == 403
    mock_update.assert_not_called()
    mock_audit.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_participants_move_writes_no_admin_audit_row():
    with (
        _order_in_status("pending"),
        patch("app.common.orders.service.log_admin_action", new_callable=AsyncMock, create=True) as mock_audit,
    ):
        await service.update_order_status(BUYER, "o-1", "cancelled")
    mock_audit.assert_not_awaited()


# --- the admin's cancellation (SRDS §14, BR-11, BR-15) --------------------------------------


@contextmanager
def _admin_cancel(status: str, error: Exception | None = None):
    """An order in `status`; yields the cancel write and the audit call."""
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": status}
    cancelled = {**order, "status": "cancelled", "admin_action_reason": "Seller unreachable"}
    with (
        patch("app.common.orders.service.repo.fetch_order_by_id", AsyncMock(side_effect=[order, cancelled])),
        patch(
            "app.common.orders.service.repo.cancel_order_as_admin",
            AsyncMock(return_value=cancelled, side_effect=error),
        ) as write,
        patch("app.common.orders.service.log_admin_action", new_callable=AsyncMock, create=True) as audit,
    ):
        yield write, audit


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["pending", "confirmed", "processing", "ready"])
async def test_the_admin_cancels_before_dispatch_with_a_reason_and_the_service_writes_no_audit_row(status):
    with _admin_cancel(status) as (write, audit):
        result = await service.cancel_order_as_admin(ADMIN, "o-1", "Seller unreachable")

    assert result["status"] == "cancelled"
    assert result["admin_action_reason"] == "Seller unreachable"
    write.assert_awaited_once_with(ADMIN.access_token, "o-1", "Seller unreachable")
    # The database writes the audit row in the same transaction (20261023080000); the service writes none of its own.
    audit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", ["dispatched", "completed", "disputed", "refunded", "cancelled", "rejected", "expired", "payment_failed"]
)
async def test_the_admin_cannot_cancel_once_the_goods_have_left_or_the_order_is_over(status):
    # D5: nothing dispatched is cancelled. The database refuses it again (guard_orders_update).
    with _admin_cancel(status) as (write, audit), pytest.raises(HTTPException) as exc_info:
        await service.cancel_order_as_admin(ADMIN, "o-1", "Seller unreachable")
    assert exc_info.value.status_code == 422
    assert exc_info.value.code == "invalid_transition"
    write.assert_not_awaited()
    audit.assert_not_awaited()


@pytest.mark.asyncio
async def test_cancelling_a_missing_order_is_404():
    with (
        patch("app.common.orders.service.repo.fetch_order_by_id", AsyncMock(return_value=None)),
        patch("app.common.orders.service.repo.cancel_order_as_admin", AsyncMock()) as write,
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.cancel_order_as_admin(ADMIN, "missing", "Seller unreachable")
    assert exc_info.value.status_code == 404
    write.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(("code", "status"), [("23514", 422), ("42501", 403)])
async def test_a_database_refusal_of_the_cancel_is_a_clear_error_and_leaves_no_audit_row(code, status):
    # The order moved on between the read and the write (23514), or the caller is not an admin after all (42501).
    with (
        _admin_cancel("ready", APIError({"message": "refused", "code": code})) as (_write, audit),
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.cancel_order_as_admin(ADMIN, "o-1", "Seller unreachable")
    assert exc_info.value.status_code == status
    audit.assert_not_awaited()


@contextmanager
def _signed_in_as(user: AuthenticatedUser):
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize(
    ("user", "code"),
    [(ADMIN_AAL1, "mfa_required"), (BUYER, "insufficient_role"), (SELLER_USER, "insufficient_role")],
    ids=["admin-without-second-factor", "buyer", "seller"],
)
def test_the_cancel_route_refuses_all_but_an_admin_with_a_second_factor(user, code):
    with _signed_in_as(user), patch("app.common.orders.router.service.cancel_order_as_admin") as cancel:
        response = client.post("/api/v1/admin/orders/o-1/cancel", json={"reason": "Seller unreachable"})
    assert response.status_code == 403
    assert response.json()["code"] == code
    cancel.assert_not_called()


def test_the_cancel_route_without_a_token_is_401():
    response = client.post("/api/v1/admin/orders/o-1/cancel", json={"reason": "Seller unreachable"})
    assert response.status_code == 401


@pytest.mark.parametrize("body", [{}, {"reason": ""}, {"reason": "  "}, {"reason": "x" * 501}])
def test_the_cancel_route_needs_a_reason(body):
    with _signed_in_as(ADMIN), patch("app.common.orders.router.service.cancel_order_as_admin") as cancel:
        response = client.post("/api/v1/admin/orders/o-1/cancel", json=body)
    assert response.status_code == 422
    cancel.assert_not_called()


def test_the_admin_order_actions_say_nothing_about_refunds_or_held_funds():
    # BR-11: the platform holds no money. The API's own words for these actions must not promise a refund or a hold.
    import inspect

    from app.common.orders import router as orders_router

    paths = app.openapi()["paths"]
    texts = [
        str(paths["/api/v1/admin/orders/{order_id}/cancel"]),
        inspect.getsource(orders_router.cancel_order_as_admin),
        service.cancel_order_as_admin.__doc__ or "",
    ]
    for text in texts:
        lowered = text.lower()
        for word in ("refund", "escrow", "wallet", "held funds", "hold the money"):
            assert word not in lowered, f"{word!r} in {text[:80]!r}"


@pytest.mark.asyncio
async def test_update_status_rejects_illegal_transition():
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "completed"}
    with _mock_no_expiry_sweep(), patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
        with pytest.raises(HTTPException) as exc_info:
            await service.update_order_status(BUYER, "o-1", "pending")
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_update_status_rejects_expired_as_a_manual_target():
    # `expired` is a system-only transition — never reachable through the public API, even by a
    # participant on their own pending order.
    order = {"id": "o-1", "buyer_id": BUYER.id, "seller_id": SELLER_A, "status": "pending"}
    with _mock_no_expiry_sweep(), patch("app.common.orders.service.repo.fetch_order_by_id", return_value=order):
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
    # `reason` is the admin's dispute reason, never a client claim about the current status.
    assert set(UpdateOrderStatusRequest.model_fields) == {"to", "reason"}


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
