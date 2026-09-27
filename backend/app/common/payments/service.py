import logging

from fastapi import HTTPException

from ..core.auth import AuthenticatedUser
from ..repositories import payments_repository as repo
from . import orders_service

logger = logging.getLogger(__name__)

# A payment can only be decided while it is still open, and an order can only be paid while it can still be fulfilled.
OPEN_PAYMENT_STATUSES = ("pending", "processing")
PAYABLE_ORDER_STATUSES = ("pending", "confirmed")
DEAD_ORDER_STATUSES = ("cancelled", "rejected", "expired")


def _assert_seller(user: AuthenticatedUser, order: dict | None) -> dict:
    """Returns the order it just authorised, so callers use the narrowed (non-None) value.

    Sellers only. An admin used to pass here, but an admin cannot make the order move that a failed payment causes
    (only disputes are theirs to resolve), so the payment was written and the request then failed half way, with no
    audit row (BR-15). An admin has no payment action of their own.
    """
    if order is None or order["seller_id"] != user.id:
        raise HTTPException(status_code=403, detail="Not the seller for this order")
    return order


def _assert_payment_open(payment: dict, order: dict) -> None:
    if payment["status"] not in OPEN_PAYMENT_STATUSES:
        raise HTTPException(status_code=409, detail=f"This payment is already {payment['status']}")
    # An order that was cancelled, rejected or expired has nothing left to pay for (the database refuses it too).
    if order["status"] in DEAD_ORDER_STATUSES:
        raise HTTPException(status_code=409, detail=f"A payment on a {order['status']} order cannot be decided")


async def initiate_payment(user: AuthenticatedUser, order_id: str, method: str) -> dict:
    """
    The client supplies only `order_id` and `method` — never an amount. The payable amount is
    always `order.total` (product_subtotal + delivery_charge, a generated column), read
    server-side. The original RLS insert policy (`payments_insert_buyer`) only checked
    `buyer_id = auth.uid()`, not that `order_id` actually belonged to that buyer or that any
    client-supplied amount matched the order — both gaps are closed here.
    """
    order = await repo.get_order_for_payment(user.access_token, order_id)
    if order is None or order["buyer_id"] != user.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["status"] not in PAYABLE_ORDER_STATUSES:
        raise HTTPException(status_code=409, detail=f"An order that is {order['status']} cannot be paid")

    return await repo.insert_payment(user.access_token, order_id, user.id, order["total"], method)


async def fetch_payment_by_id(user: AuthenticatedUser, payment_id: str) -> dict:
    payment = await repo.fetch_payment_by_id(user.access_token, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment


async def fetch_payment_by_order_id(user: AuthenticatedUser, order_id: str) -> dict | None:
    return await repo.fetch_payment_by_order_id(user.access_token, order_id)


async def fetch_payment_transactions(user: AuthenticatedUser, payment_id: str) -> list[dict]:
    return await repo.fetch_payment_transactions(user.access_token, payment_id)


async def mark_payment_received(user: AuthenticatedUser, payment_id: str) -> dict:
    payment = await repo.fetch_payment_by_id(user.access_token, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    order = await repo.get_order_for_payment(user.access_token, payment["order_id"])
    order = _assert_seller(user, order)
    _assert_payment_open(payment, order)

    # The payment event (`manual_confirmation`) is written by a database trigger from this status change.
    return await repo.update_payment_status(user.access_token, payment_id, "successful")


async def mark_payment_failed(user: AuthenticatedUser, payment_id: str, reason: str | None) -> dict:
    """
    Mirrors the frontend's original cross-domain behavior: if the order hasn't moved past
    `confirmed` yet, a payment failure also auto-transitions it to `payment_failed`. Calls
    `orders_service.update_order_status` directly (in-process — one FastAPI monolith, rule 32),
    which re-derives the order's real current status and re-checks the transition itself rather
    than this layer assuming it's still valid.

    This is a genuine read-then-write dependency chain (fetch payment -> fetch order -> update
    payment -> conditionally transition the order) — left fully sequential, not a candidate for
    concurrency the way _assert_available's two independent reads were.
    """
    payment = await repo.fetch_payment_by_id(user.access_token, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    order = await repo.get_order_for_payment(user.access_token, payment["order_id"])
    order = _assert_seller(user, order)
    _assert_payment_open(payment, order)

    # The payment event (`manual_failure`) is written by a database trigger from this status change. The free-text
    # `reason` in the request is not stored in the database any more (the app never sends one); it goes to the log.
    if reason:
        logger.info("payment %s marked failed by seller: %s", payment_id, reason)
    updated = await repo.update_payment_status(user.access_token, payment_id, "failed")

    if order["status"] in ("pending", "confirmed"):
        await orders_service.update_order_status(user, order["id"], "payment_failed")

    return updated
