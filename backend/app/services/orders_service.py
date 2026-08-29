from fastapi import HTTPException

from ..core.auth import AuthenticatedUser
from ..repositories import dealer_repository, orders_repository as repo
from . import dealer_service

# Full SRDS v4.0 §12.2 lifecycle. `payment_failed` is reachable from `pending`/`confirmed` —
# Payments' manual flow moves an order there when the seller records non-payment before
# fulfillment starts. `disputed`->`refunded`/`completed` are schema-valid for admin resolution
# tooling even though no buyer/seller screen exposes them. Moved verbatim from the frontend.
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
}


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
    return repo.fetch_orders_for_user(user.access_token, user.id, as_)


def fetch_order_by_id(user: AuthenticatedUser, order_id: str) -> dict:
    order = repo.fetch_order_by_id(user.access_token, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def fetch_order_status_history(user: AuthenticatedUser, order_id: str) -> list[dict]:
    return repo.fetch_order_status_history(user.access_token, order_id)


def _reduce_dealer_inventory_for_order(user: AuthenticatedUser, order_id: str) -> None:
    """
    The seller accepting an order (pending->confirmed) is what commits their stock. Checks
    availability for every linked item first, before any reduction runs, so one under-stocked
    item fails the whole confirm rather than leaving some items silently deducted and others
    not. Calls `dealer_service.adjust_stock` directly (an in-process Python call, not an HTTP
    round-trip — rule: stay one FastAPI monolith) using the confirming seller's own token; a
    non-dealer seller simply has no matching inventory row and this is a no-op for them.
    """
    items = repo.fetch_order_items_for_inventory(user.access_token, order_id)
    to_reduce: list[tuple[str, int]] = []

    for item in items:
        if not item["listing_id"]:
            continue
        inventory = dealer_repository.fetch_inventory_by_listing_id(user.access_token, item["listing_id"])
        if inventory is None:
            continue
        if item["quantity"] > inventory["stock_quantity"]:
            raise HTTPException(
                status_code=422,
                detail=f'Not enough stock to confirm this order — needs {item["quantity"]} but only '
                f'{inventory["stock_quantity"]} in stock.',
            )
        to_reduce.append((inventory["id"], item["quantity"]))

    for inventory_id, quantity in to_reduce:
        dealer_service.adjust_stock(user.access_token, inventory_id, "sale", quantity, user.id, f"Order {order_id}")


def update_order_status(user: AuthenticatedUser, order_id: str, to: str) -> None:
    """
    Never trusts a client-supplied "current status" — the order (and therefore its real current
    status) is always re-read from the database first. Ownership: only the order's buyer or
    seller (or admin) may act on it, matching `orders_select/update_participants_or_admin` RLS.
    """
    order = repo.fetch_order_by_id(user.access_token, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if order["buyer_id"] != user.id and order["seller_id"] != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not a participant in this order")

    from_status = order["status"]
    if to not in ALLOWED_TRANSITIONS.get(from_status, []):
        raise HTTPException(status_code=422, detail=f'Cannot move an order from "{from_status}" to "{to}"')

    if from_status == "pending" and to == "confirmed":
        _reduce_dealer_inventory_for_order(user, order_id)

    repo.update_order_status(user.access_token, order_id, to)
    repo.insert_order_status_history(user.access_token, order_id, from_status, to, user.id)
