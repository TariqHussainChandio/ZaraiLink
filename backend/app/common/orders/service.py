import asyncio
import logging
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser
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

# The checkout's IMS stock read (D7): how long it may take before checkout goes on without it, and the faults it can
# have: the database refusing or timing out the call (PostgREST APIError), a dropped connection (httpx.HTTPError), our
# own deadline (TimeoutError), an unreadable body or a malformed row (ValueError, KeyError, TypeError). The service
# role has no statement timeout, so the deadline is kept here; a programming error still raises.
STOCK_READ_TIMEOUT_SECONDS = 2.0
STOCK_READ_FAULTS = (APIError, httpx.HTTPError, TimeoutError, KeyError, TypeError, ValueError)

logger = logging.getLogger(__name__)


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


async def _linked_stock(listing_ids: list[str]) -> dict[str, float] | None:
    """The exact IMS figures for the cart's linked listings, or None when the IMS cannot answer in time.

    An IMS problem never breaks the marketplace (SRDS §53.39, D7): a refused, failed, malformed or slow read is logged
    and checkout goes on without the pre-check. The database is still the gate (D6): the seller's confirm
    (check_stock_on_confirm) and the dispatch (apply_order_dispatch) both refuse an order the stock cannot cover."""
    if not listing_ids:
        return None
    try:
        rows = await asyncio.wait_for(repo.get_available_stock(listing_ids), STOCK_READ_TIMEOUT_SECONDS)
        return {row["listing_id"]: row["available"] for row in rows}
    except STOCK_READ_FAULTS:
        logger.warning("IMS stock unavailable at checkout; leaving the stock check to confirm", exc_info=True)
        return None


async def _assert_available(access_token: str, cart_items: list[dict]) -> dict[str, dict]:
    """
    Re-validates every cart item against the database immediately before creating any order —
    the cart is client-side/persisted-local and can go stale (another buyer bought the last
    stock, a seller edited the price/quantity or deactivated the listing) between "add to cart"
    and checkout. Returns the authoritative listing rows keyed by id, so `checkout()` can price
    the order from `listing.price` — never from anything the client sent — closing a real gap
    the original frontend implementation had (it priced orders from the client-cached cart
    item's `price` field, which a manipulated client could have set to anything).

    The listing read is the caller's own (row-level security decides what they may buy). Only listings linked to an
    IMS product (D8) need the IMS: an unlinked listing's stock is its own quantity, so a farmer's listing never waits
    on, or fails with, the dealer inventory. A refusal names the listing, never the figure (SRDS §15).
    """
    listing_ids = list({item["listing_id"] for item in cart_items})
    listings = await repo.fetch_listings_for_checkout(access_token, listing_ids)
    listings_by_id = {listing["id"]: listing for listing in listings}
    linked = [listing["id"] for listing in listings if listing.get("inventory_product_id")]
    linked_stock = await _linked_stock(linked)

    for item in cart_items:
        listing = listings_by_id.get(item["listing_id"])
        if listing is None or listing["status"] != "active":
            raise AppHTTPException(422, f"Listing {item['listing_id']} is no longer available.", "listing_unavailable")
        if listing.get("inventory_product_id"):
            if linked_stock is None:
                continue  # the IMS did not answer: confirm and dispatch decide (see _linked_stock)
            available = linked_stock.get(listing["id"], 0)
        else:
            available = listing["quantity"]
        if item["quantity"] > available:
            raise AppHTTPException(422, f"Not enough stock for {listing['title']}.", "insufficient_stock")

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

        # Each call below needs the previous one's result (order["id"]), so they run one after another.
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


async def fetch_all_orders(user: AuthenticatedUser, status: str | None = None) -> list[dict]:
    """Every order on the platform, for the admin console (row-level security admits only an admin). The status filter
    runs in the database, so the admin's Disputed view finds every disputed order, not only those on the first page."""
    return await repo.fetch_all_orders(user.access_token, status)


async def fetch_order_by_id(user: AuthenticatedUser, order_id: str) -> dict:
    await _expire_stale_pending_orders(user)
    order = await repo.fetch_order_by_id(user.access_token, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


async def fetch_order_status_history(user: AuthenticatedUser, order_id: str) -> list[dict]:
    return await repo.fetch_order_status_history(user.access_token, order_id)


async def update_order_status(user: AuthenticatedUser, order_id: str, to: str, reason: str | None = None) -> None:
    """
    Never trusts a client-supplied "current status" — the order (and therefore its real current
    status) is always re-read from the database first. Ownership: only the order's buyer or
    seller may act on it freely, matching `orders_update_participants` RLS. A non-participant
    admin is allowed ONLY when the order is currently `disputed` — i.e. admin dispute resolution
    (`disputed -> refunded` / `disputed -> completed`, see ALLOWED_TRANSITIONS below) — never on
    any other transition, and in particular never on `ready -> dispatched`, which takes the seller's stock (the
    `apply_order_dispatch` trigger, 20261019080000_order_dispatch.sql). The database enforces the same rule again
    (`orders_update_participants` and `guard_orders_update`) as defense in depth.

    `reason` belongs to the admin's dispute resolution alone (SRDS §14): required there, stored as admin_action_reason
    and audited. From anyone else it is refused rather than dropped, so a client never believes a reason was recorded
    when it was not (and guard_orders_update would refuse it from a non-admin anyway).
    """
    await _expire_stale_pending_orders(user)
    order = await repo.fetch_order_by_id(user.access_token, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    is_participant = order["buyer_id"] == user.id or order["seller_id"] == user.id
    is_admin_resolving_dispute = user.role == "admin" and order["status"] == "disputed"
    if not is_participant and not is_admin_resolving_dispute:
        raise HTTPException(status_code=403, detail="Not a participant in this order")
    if is_admin_resolving_dispute and user.aal != "aal2":
        # A dispute decision is an admin write, so it needs a second factor like every other one (require_admin_aal2,
        # admin_mfa_enforcement). This route is open to participants, so the check is here rather than on the route.
        raise AppHTTPException(403, "This action requires a verified second factor (MFA).", "mfa_required")

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

    if is_admin_resolving_dispute and reason is None:
        raise AppHTTPException(422, "Settling a dispute needs a reason both parties can read.", "validation_failed")
    if not is_admin_resolving_dispute and reason is not None:
        raise AppHTTPException(422, "Only an admin settling a dispute gives a reason here.", "validation_failed")

    try:
        # Database triggers do the rest in the same statement: confirming checks the stock is there, dispatching takes
        # it and writes the outbox events (D5-D7), and each move writes its history row. A shortage (P0001) fails the
        # update as a whole, so nothing is half done.
        if is_admin_resolving_dispute:
            await repo.update_order_status(user.access_token, order_id, to, admin_action_reason=reason)
        else:
            await repo.update_order_status(user.access_token, order_id, to)
    except APIError as exc:
        if exc.code == "P0001":
            raise AppHTTPException(
                422, exc.message or "Not enough stock for this order.", "insufficient_stock"
            ) from exc
        raise

    # BR-15: an admin's dispute decision is audited as order_administrative_action with the reason in new_state.
    # The audit row is written atomically by the database (20261023080000).


# The statuses an admin may cancel from (guard_orders_update, 20261023080000_admin_moderation.sql). Dispatched and
# completed orders are not cancelled: the goods have left the seller (D5).
ADMIN_CANCELLABLE_STATUSES = frozenset({"pending", "confirmed", "processing", "ready"})


async def cancel_order_as_admin(user: AuthenticatedUser, order_id: str, reason: str) -> dict:
    """
    SRDS §14: an admin may cancel an order before dispatch, always with a reason the buyer and seller can read. No money
    moves (BR-11: the platform holds no funds, so it pays nothing back; any money already paid is settled between buyer
    and seller). The status is checked first so a dispatched order gets a clear 422 instead of the empty update the row
    policy would give (it hides such an order from the admin's write); the database checks the same rules again.
    BR-15: the database audits it with the status before and after.
    """
    order = await repo.fetch_order_by_id(user.access_token, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    from_status = order["status"]
    if from_status not in ADMIN_CANCELLABLE_STATUSES:
        raise AppHTTPException(422, f'Cannot move an order from "{from_status}" to "cancelled"', "invalid_transition")

    try:
        updated = await repo.cancel_order_as_admin(user.access_token, order_id, reason)
    except APIError as exc:
        if exc.code == "23514":
            raise AppHTTPException(422, exc.message or "This order cannot be cancelled.", "invalid_transition") from exc
        if exc.code == "42501":
            raise HTTPException(status_code=403, detail="Only an admin can cancel this order") from exc
        raise

    # The audit row is written atomically by the database (20261023080000).
    return await repo.fetch_order_by_id(user.access_token, order_id) or updated
