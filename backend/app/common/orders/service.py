import asyncio
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser
from app.common.audit_log import log_admin_action
from app.common.errors import AppHTTPException
from app.common.orders import repository as repo

# Full SRDS v4.0 §12.2 lifecycle. `payment_failed` is reachable from `pending`/`confirmed` —
# Payments' manual flow moves an order there when the seller records non-payment before
# fulfillment starts. `disputed`->`refunded`/`completed` are schema-valid for admin resolution
# tooling even though no buyer/seller screen exposes them. Moved verbatim from the frontend.
# `expired` is deliberately NOT reachable from here as a `to` target — it's a system-only
# transition applied directly by `_expire_stale_pending_orders`, never something a participant
# can request through `update_order_status` (a buyer who wants out of a pending order already
# has `cancelled` for that).
ALLOWED_TRANSITIONS: dict[str, list[str]] = {
    "pending": ["confirmed", "rejected", "cancelled", "payment_failed"],
    "confirmed": ["processing", "cancelled", "payment_failed"],
    "processing": ["ready"],
    # D5 (A4): the seller dispatches before completing; stock leaves at dispatch, and nothing dispatched is cancelled.
    "ready": ["dispatched"],
    "dispatched": ["completed"],
    "completed": ["disputed"],
    "cancelled": [],
    "rejected": [],
    "payment_failed": [],
    "disputed": ["refunded", "completed"],
    "refunded": [],
    "expired": [],
}

# Who may request each target status. The state machine above says which moves exist; this says whose move it is,
# so the rule holds for any client and not only for an app that hides the buttons. `cancelled` is the one move both
# sides may make. A `disputed` order is resolved by an admin only (see `update_order_status`).
SELLER_ONLY_TARGETS = frozenset(
    {"confirmed", "rejected", "processing", "ready", "dispatched", "completed", "payment_failed"}
)
BUYER_ONLY_TARGETS = frozenset({"disputed"})

# How long a seller has to act on a new order before it silently expires. No scheduler exists
# in this stack, so this is enforced lazily (see `_expire_stale_pending_orders`) rather than by
# a background job. 48 hours, not e.g. 24 — SRDS doesn't specify a value, and a seller who checks
# in once a day or two is normal usage this shouldn't punish; long enough to be forgiving, short
# enough that a buyer isn't left hanging indefinitely.
PENDING_ORDER_EXPIRY_HOURS = 48


async def _expire_stale_pending_orders(user: AuthenticatedUser) -> None:
    """
    Runs on every order list/detail read rather than on a schedule — nothing in this stack runs
    one. Scoped to the caller's own token, so RLS (`orders_update_participants`) naturally limits
    this to orders the caller is buyer or seller on, never a blanket sweep across every order.
    `changed_by=None` in the history row (rather than attributing it to whichever user happened
    to trigger the sweep) because this is a system transition, not that user's action —
    `order_status_history.changed_by` is nullable for exactly this. The existing
    `notify_order_status_changed` DB trigger fires on the status UPDATE same as any other
    transition, so the OTHER party gets notified without any extra code here — same skip-the-
    acting-session's-own-auth.uid() convention every other status change already gets from
    `create_notification`'s `p_skip_self`.
    """
    cutoff = (datetime.now(UTC) - timedelta(hours=PENDING_ORDER_EXPIRY_HOURS)).isoformat()
    for order_id in await repo.fetch_stale_pending_order_ids(user.access_token, user.id, cutoff):
        # The history row is written by the database trigger from this status change (system transition, no actor).
        await repo.update_order_status(user.access_token, order_id, "expired")


async def _assert_available(access_token: str, cart_items: list[dict]) -> dict[str, dict]:
    """
    Re-validates every cart item against the database immediately before creating any order —
    the cart is client-side/persisted-local and can go stale (another buyer bought the last
    stock, a seller edited the price/quantity or deactivated the listing) between "add to cart"
    and checkout. Returns the authoritative listing rows keyed by id, so `checkout()` can price
    the order from `listing.price` — never from anything the client sent — closing a real gap
    the original frontend implementation had (it priced orders from the client-cached cart
    item's `price` field, which a manipulated client could have set to anything).

    The two lookups below are independent (both keyed only on `listing_ids`, neither depends on
    the other's result) — genuinely safe to run concurrently, unlike checkout()'s own insert
    sequence below, which is a real dependency chain and must stay sequential.
    """
    listing_ids = list({item["listing_id"] for item in cart_items})
    listings, stock_rows = await asyncio.gather(
        repo.fetch_listings_for_checkout(access_token, listing_ids),
        repo.get_available_stock(access_token, listing_ids),
    )
    listings_by_id = {listing["id"]: listing for listing in listings}
    availability = {row["listing_id"]: row["available"] for row in stock_rows}

    for item in cart_items:
        listing = listings_by_id.get(item["listing_id"])
        if listing is None or listing["status"] != "active":
            raise AppHTTPException(422, f"Listing {item['listing_id']} is no longer available.", "listing_unavailable")
        available = availability.get(item["listing_id"], listing["quantity"])
        if item["quantity"] > available:
            raise AppHTTPException(
                422, f"Only {available} left in stock for listing {item['listing_id']}.", "insufficient_stock"
            )

    return listings_by_id


async def checkout(
    user: AuthenticatedUser, cart_items: list[dict], delivery_charge_by_seller: dict[str, float]
) -> list[dict]:
    """
    `orders` is single-buyer/single-seller, so a cart spanning multiple sellers becomes one
    order per seller (grouped by each listing's actual `owner_id`, never a client-supplied
    seller id). `product_subtotal` is computed from each listing's current `price` (server-
    authoritative), not whatever price the client's cart happened to have cached. Delivery
    charge stays client-supplied per seller — there's no authoritative server-side shipping
    rate in this app (BR-09: delivery is always a separate, explicit, manually-agreed line, not
    computed) — a seller with no entry gets `delivery_charge = 0`.
    """
    listings_by_id = await _assert_available(user.access_token, cart_items)

    by_seller: dict[str, list[dict]] = {}
    for item in cart_items:
        seller_id = listings_by_id[item["listing_id"]]["owner_id"]
        by_seller.setdefault(seller_id, []).append(item)

    created_orders = []
    for seller_id, items in by_seller.items():
        subtotal = sum(listings_by_id[item["listing_id"]]["price"] * item["quantity"] for item in items)
        delivery_charge = delivery_charge_by_seller.get(seller_id, 0)

        # Each call below needs the previous one's result (order["id"]) — a genuine sequential
        # dependency chain, not parallelized, unlike _assert_available's two independent reads.
        order = await repo.insert_order(user.access_token, user.id, seller_id, subtotal, delivery_charge)
        await repo.insert_order_items(
            user.access_token,
            order["id"],
            [
                {
                    "listing_id": item["listing_id"],
                    "quantity": item["quantity"],
                    "unit_price": listings_by_id[item["listing_id"]]["price"],
                }
                for item in items
            ],
        )
        # The database prices the items from the listings, sums the subtotal and writes the first history row, so the
        # order is read again: the row returned by the insert was taken before any item existed (subtotal 0).
        created_orders.append(await repo.fetch_order_by_id(user.access_token, order["id"]) or order)

    return created_orders


async def fetch_orders_for_user(user: AuthenticatedUser, as_: str) -> list[dict]:
    await _expire_stale_pending_orders(user)
    return await repo.fetch_orders_for_user(user.access_token, user.id, as_)


async def read_orders_for_user(user: AuthenticatedUser, as_: str) -> list[dict]:
    """The orders as fetch_orders_for_user returns them, without first expiring stale pending orders: for
    read-only summaries (analytics), which must not change order state as a side effect."""
    return await repo.fetch_orders_for_user(user.access_token, user.id, as_)


async def fetch_all_orders(user: AuthenticatedUser) -> list[dict]:
    """Every order on the platform, for the admin console (row-level security admits only an admin)."""
    return await repo.fetch_all_orders(user.access_token)


async def fetch_order_by_id(user: AuthenticatedUser, order_id: str) -> dict:
    await _expire_stale_pending_orders(user)
    order = await repo.fetch_order_by_id(user.access_token, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


async def fetch_order_status_history(user: AuthenticatedUser, order_id: str) -> list[dict]:
    return await repo.fetch_order_status_history(user.access_token, order_id)


async def update_order_status(user: AuthenticatedUser, order_id: str, to: str) -> None:
    """
    Never trusts a client-supplied "current status" — the order (and therefore its real current
    status) is always re-read from the database first. Ownership: only the order's buyer or
    seller may act on it freely, matching `orders_update_participants` RLS. A non-participant
    admin is allowed ONLY when the order is currently `disputed` — i.e. admin dispute resolution
    (`disputed -> refunded` / `disputed -> completed`, see ALLOWED_TRANSITIONS below) — never on
    any other transition, and in particular never on `ready -> dispatched`, which takes the seller's stock (the
    `apply_order_dispatch` trigger, 20261019080000_order_dispatch.sql). The database enforces the same rule again
    (`orders_update_participants` and `guard_orders_update`) as defense in depth.
    """
    await _expire_stale_pending_orders(user)
    order = await repo.fetch_order_by_id(user.access_token, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    is_participant = order["buyer_id"] == user.id or order["seller_id"] == user.id
    is_admin_resolving_dispute = user.role == "admin" and order["status"] == "disputed"
    if not is_participant and not is_admin_resolving_dispute:
        raise HTTPException(status_code=403, detail="Not a participant in this order")

    from_status = order["status"]
    if to not in ALLOWED_TRANSITIONS.get(from_status, []):
        raise AppHTTPException(422, f'Cannot move an order from "{from_status}" to "{to}"', "invalid_transition")

    if from_status == "disputed":
        # Only the admin resolves a dispute; the seller closing a buyer's dispute themselves would defeat it.
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Only an admin can resolve a disputed order")
    elif to in SELLER_ONLY_TARGETS and order["seller_id"] != user.id:
        raise HTTPException(status_code=403, detail="Only the seller can make this change to an order")
    elif to in BUYER_ONLY_TARGETS and order["buyer_id"] != user.id:
        raise HTTPException(status_code=403, detail="Only the buyer can make this change to an order")

    try:
        # Database triggers do the rest in the same statement: confirming checks the stock is there, dispatching takes
        # it and writes the outbox events (D5-D7), and each move writes its history row. A shortage (P0001) fails the
        # update as a whole, so nothing is half done.
        await repo.update_order_status(user.access_token, order_id, to)
    except APIError as exc:
        if exc.code == "P0001":
            raise AppHTTPException(422, exc.message or "Not enough stock for this order.", "insufficient_stock")
        raise

    if is_admin_resolving_dispute:
        # BR-15: an admin's dispute decision is an admin action and is audit-logged.
        await log_admin_action(
            user,
            "resolve_order_dispute",
            "order",
            order_id,
            previous_state={"status": from_status},
            new_state={"status": to},
        )
