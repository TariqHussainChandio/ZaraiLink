from datetime import datetime, timedelta, timezone

from postgrest.exceptions import APIError

from fastapi import HTTPException

from ..core.auth import AuthenticatedUser
from ..repositories import orders_repository as repo

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
    "ready": ["completed"],
    "completed": ["disputed"],
    "cancelled": [],
    "rejected": [],
    "payment_failed": [],
    "disputed": ["refunded", "completed"],
    "refunded": [],
    "expired": [],
}

# How long a seller has to act on a new order before it silently expires. No scheduler exists
# in this stack, so this is enforced lazily (see `_expire_stale_pending_orders`) rather than by
# a background job. 48 hours, not e.g. 24 — SRDS doesn't specify a value, and a seller who checks
# in once a day or two is normal usage this shouldn't punish; long enough to be forgiving, short
# enough that a buyer isn't left hanging indefinitely.
PENDING_ORDER_EXPIRY_HOURS = 48


def _expire_stale_pending_orders(user: AuthenticatedUser) -> None:
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
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=PENDING_ORDER_EXPIRY_HOURS)).isoformat()
    for order_id in repo.fetch_stale_pending_order_ids(user.access_token, user.id, cutoff):
        repo.update_order_status(user.access_token, order_id, "expired")
        repo.insert_order_status_history(user.access_token, order_id, "pending", "expired", None)


def _assert_available(access_token: str, cart_items: list[dict]) -> dict[str, dict]:
    """
    Re-validates every cart item against the database immediately before creating any order —
    the cart is client-side/persisted-local and can go stale (another buyer bought the last
    stock, a seller edited the price/quantity or deactivated the listing) between "add to cart"
    and checkout. Returns the authoritative listing rows keyed by id, so `checkout()` can price
    the order from `listing.price` — never from anything the client sent — closing a real gap
    the original frontend implementation had (it priced orders from the client-cached cart
    item's `price` field, which a manipulated client could have set to anything).
    """
    listing_ids = list({item["listing_id"] for item in cart_items})
    listings = repo.fetch_listings_for_checkout(access_token, listing_ids)
    listings_by_id = {listing["id"]: listing for listing in listings}
    availability = {row["listing_id"]: row["available"] for row in repo.get_available_stock(access_token, listing_ids)}

    for item in cart_items:
        listing = listings_by_id.get(item["listing_id"])
        if listing is None or listing["status"] != "active":
            raise HTTPException(status_code=422, detail=f'Listing {item["listing_id"]} is no longer available.')
        available = availability.get(item["listing_id"], listing["quantity"])
        if item["quantity"] > available:
            raise HTTPException(status_code=422, detail=f'Only {available} left in stock for listing {item["listing_id"]}.')

    return listings_by_id


def checkout(user: AuthenticatedUser, cart_items: list[dict], delivery_charge_by_seller: dict[str, float]) -> list[dict]:
    """
    `orders` is single-buyer/single-seller, so a cart spanning multiple sellers becomes one
    order per seller (grouped by each listing's actual `owner_id`, never a client-supplied
    seller id). `product_subtotal` is computed from each listing's current `price` (server-
    authoritative), not whatever price the client's cart happened to have cached. Delivery
    charge stays client-supplied per seller — there's no authoritative server-side shipping
    rate in this app (BR-09: delivery is always a separate, explicit, manually-agreed line, not
    computed) — a seller with no entry gets `delivery_charge = 0`.
    """
    listings_by_id = _assert_available(user.access_token, cart_items)

    by_seller: dict[str, list[dict]] = {}
    for item in cart_items:
        seller_id = listings_by_id[item["listing_id"]]["owner_id"]
        by_seller.setdefault(seller_id, []).append(item)

    created_orders = []
    for seller_id, items in by_seller.items():
        subtotal = sum(listings_by_id[item["listing_id"]]["price"] * item["quantity"] for item in items)
        delivery_charge = delivery_charge_by_seller.get(seller_id, 0)

        order = repo.insert_order(user.access_token, user.id, seller_id, subtotal, delivery_charge)
        repo.insert_order_items(
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
        repo.insert_order_status_history(user.access_token, order["id"], None, "pending", user.id)
        created_orders.append(order)

    return created_orders


def fetch_orders_for_user(user: AuthenticatedUser, as_: str) -> list[dict]:
    _expire_stale_pending_orders(user)
    return repo.fetch_orders_for_user(user.access_token, user.id, as_)


def fetch_order_by_id(user: AuthenticatedUser, order_id: str) -> dict:
    _expire_stale_pending_orders(user)
    order = repo.fetch_order_by_id(user.access_token, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def fetch_order_status_history(user: AuthenticatedUser, order_id: str) -> list[dict]:
    return repo.fetch_order_status_history(user.access_token, order_id)


def _reduce_dealer_inventory_for_order(user: AuthenticatedUser, order_id: str) -> None:
    """
    The seller accepting an order (pending->confirmed) is what commits their stock.
    `public.reduce_stock_for_order` (supabase/migrations/20260901130000_...) does the whole
    order's worth of "check every linked item, then reduce every linked item" atomically inside
    one Postgres transaction, row-locked for its duration — not here in Python across many
    separate calls, which is what let two near-simultaneous confirmations race each other and
    both succeed against the same stock. Runs using the confirming seller's own token; a
    non-dealer seller (or an item with no linked inventory row) is a no-op, same as before.
    """
    try:
        repo.reduce_stock_for_order(user.access_token, order_id, user.id)
    except APIError as exc:
        if exc.code == "P0001":
            raise HTTPException(status_code=422, detail=exc.message or "Not enough stock to confirm this order.")
        raise


def update_order_status(user: AuthenticatedUser, order_id: str, to: str) -> None:
    """
    Never trusts a client-supplied "current status" — the order (and therefore its real current
    status) is always re-read from the database first. Ownership: only the order's buyer or
    seller may act on it freely, matching `orders_update_participants` RLS. A non-participant
    admin is allowed ONLY when the order is currently `disputed` — i.e. admin dispute resolution
    (`disputed -> refunded` / `disputed -> completed`, see ALLOWED_TRANSITIONS below) — never on
    any other transition, and in particular never on `pending -> confirmed`. That transition runs
    `_reduce_dealer_inventory_for_order` using the ACTING USER's own access token (never a
    service-role key, see `get_user_scoped_client` docs), so a flat "any admin may act on any
    order" check would let an admin silently write another dealer's stock via RLS — closing that
    gap is the entire point of this narrower check; see the matching RLS narrowing of
    `orders_update_participants` in
    supabase/migrations/20260901090000_admin_write_scope_hardening.sql, which enforces this same
    rule again at the database layer as defense in depth.
    """
    _expire_stale_pending_orders(user)
    order = repo.fetch_order_by_id(user.access_token, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    is_participant = order["buyer_id"] == user.id or order["seller_id"] == user.id
    is_admin_resolving_dispute = user.role == "admin" and order["status"] == "disputed"
    if not is_participant and not is_admin_resolving_dispute:
        raise HTTPException(status_code=403, detail="Not a participant in this order")

    from_status = order["status"]
    if to not in ALLOWED_TRANSITIONS.get(from_status, []):
        raise HTTPException(status_code=422, detail=f'Cannot move an order from "{from_status}" to "{to}"')

    if from_status == "pending" and to == "confirmed":
        _reduce_dealer_inventory_for_order(user, order_id)

    repo.update_order_status(user.access_token, order_id, to)
    repo.insert_order_status_history(user.access_token, order_id, from_status, to, user.id)
