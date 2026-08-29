from fastapi import HTTPException

from ..core.auth import AuthenticatedUser
from ..repositories import payments_repository as repo
from . import orders_service


def _assert_seller_or_admin(user: AuthenticatedUser, order: dict | None) -> None:
    if order is None or (order["seller_id"] != user.id and user.role != "admin"):
        raise HTTPException(status_code=403, detail="Not the seller for this order")


def initiate_payment(user: AuthenticatedUser, order_id: str, method: str) -> dict:
    """
    The client supplies only `order_id` and `method` — never an amount. The payable amount is
    always `order.total` (product_subtotal + delivery_charge, a generated column), read
    server-side. The original RLS insert policy (`payments_insert_buyer`) only checked
    `buyer_id = auth.uid()`, not that `order_id` actually belonged to that buyer or that any
    client-supplied amount matched the order — both gaps are closed here.
    """
    order = repo.get_order_for_payment(user.access_token, order_id)
    if order is None or order["buyer_id"] != user.id:
        raise HTTPException(status_code=404, detail="Order not found")

    return repo.insert_payment(user.access_token, order_id, user.id, order["total"], method)


def fetch_payment_by_id(user: AuthenticatedUser, payment_id: str) -> dict:
    payment = repo.fetch_payment_by_id(user.access_token, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment


def fetch_payment_by_order_id(user: AuthenticatedUser, order_id: str) -> dict | None:
    return repo.fetch_payment_by_order_id(user.access_token, order_id)


def fetch_payment_transactions(user: AuthenticatedUser, payment_id: str) -> list[dict]:
    return repo.fetch_payment_transactions(user.access_token, payment_id)


def mark_payment_received(user: AuthenticatedUser, payment_id: str) -> dict:
    payment = repo.fetch_payment_by_id(user.access_token, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    order = repo.get_order_for_payment(user.access_token, payment["order_id"])
    _assert_seller_or_admin(user, order)

    updated = repo.update_payment_status(user.access_token, payment_id, "successful")
    repo.insert_payment_transaction(user.access_token, payment_id, "manual_confirmation", {"method": updated["method"]})
    return updated


def mark_payment_failed(user: AuthenticatedUser, payment_id: str, reason: str | None) -> dict:
    """
    Mirrors the frontend's original cross-domain behavior: if the order hasn't moved past
    `confirmed` yet, a payment failure also auto-transitions it to `payment_failed`. Calls
    `orders_service.update_order_status` directly (in-process — one FastAPI monolith, rule 32),
    which re-derives the order's real current status and re-checks the transition itself rather
    than this layer assuming it's still valid.
    """
    payment = repo.fetch_payment_by_id(user.access_token, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    order = repo.get_order_for_payment(user.access_token, payment["order_id"])
    _assert_seller_or_admin(user, order)

    updated = repo.update_payment_status(user.access_token, payment_id, "failed")
    repo.insert_payment_transaction(
        user.access_token, payment_id, "manual_failure", {"reason": reason} if reason else None
    )

    if order["status"] in ("pending", "confirmed"):
        orders_service.update_order_status(user, order["id"], "payment_failed")

    return updated
