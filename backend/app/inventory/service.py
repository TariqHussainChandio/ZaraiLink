"""The inventory module's public entry point for other modules (the module-boundary rule, docs/plan.md §1 rule 4).

B3 dropped the legacy tables (inventory, inventory_transactions, dealer_stores, suppliers). The dealer module's routes
and the dealer analytics keep their response shapes by calling the functions here, which serve those shapes from the
IMS tables:

- an inventory item is a product with its stock at the default location (the stock the marketplace sells from, D8) and
  the listing linked to it (listings.inventory_product_id);
- a transaction is a ledger movement, its source mapped back to the old type;
- a store is a location, a supplier an IMS supplier, `status` read from `is_active`.

Every stock change still goes through record_movement, one ledger row with an SRDS §24 source per change.
"""

import uuid

from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser
from app.common.errors import AppHTTPException
from app.inventory import repository as repo
from app.inventory.alerts import alerts_for
from app.inventory.dashboard import daily_trend, trend_movements
from app.inventory.movements import record
from app.inventory.products import product_view
from app.inventory.stock import create_location, delete_location, ensure_default_location, update_location

PRODUCTS = "inventory_products"
LOCATIONS = "inventory_locations"
SUPPLIERS = "inventory_suppliers"

# The reasons record_movement requires for an adjustment or OTHER, when the old screens send no notes.
EDITED_REASON = "Edited in inventory"
REDUCED_REASON = "Stock reduced"
ADJUSTED_REASON = "Adjustment"
LISTING_TAKEN = "This listing already has an inventory item"

_SOURCE_TO_TYPE = {"RESTOCK": "restock", "ZARAILINK_ORDER": "sale", "MANUAL_ADJUSTMENT": "adjustment"}


def _status(row: dict) -> str:
    return "active" if row.get("is_active", True) else "inactive"


def _active(fields: dict) -> dict:
    """The old `status` field as the IMS `is_active` flag."""
    mapped = dict(fields)
    if "status" in mapped:
        status = mapped.pop("status")
        if status is not None:
            mapped["is_active"] = status == "active"
    return mapped


# --- inventory items ----------------------------------------------------------------------------------------------


def _legacy_item(view: dict) -> dict:
    listings = view.get("listings") or []
    listing = listings[0] if listings else None
    return {
        "id": view["id"],
        "dealer_id": view["dealer_id"],
        "listing_id": listing["id"] if listing else None,
        "stock_quantity": view["default_location_quantity"],
        "unit": view["unit"],
        "purchase_cost": view.get("cost_price"),
        "selling_price": view.get("selling_price"),
        "min_stock_threshold": view["reorder_threshold"],
        "created_at": view["created_at"],
        "updated_at": view["updated_at"],
        "listing": listing,
    }


async def _default_location_id(user: AuthenticatedUser) -> str | None:
    default = await repo.fetch_default_location(user.access_token)
    return default["id"] if default else None


async def _active_product(user: AuthenticatedUser, item_id: str) -> dict:
    # A deactivated product is a deleted item to the old screens.
    row = await repo.fetch_product(user.access_token, item_id)
    if row is None or not row.get("is_active", True):
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return row


async def legacy_list_inventory(user: AuthenticatedUser) -> list[dict]:
    rows = await repo.fetch_products(user.access_token, include_inactive=False)
    default_id = await _default_location_id(user)
    return [_legacy_item(product_view(row, default_id)) for row in rows]


async def legacy_get_inventory(user: AuthenticatedUser, item_id: str) -> dict:
    row = await _active_product(user, item_id)
    return _legacy_item(product_view(row, await _default_location_id(user)))


async def _move_to(user: AuthenticatedUser, item_id: str, target: float, reason: str) -> None:
    """Brings the default location's stock to `target` with one MANUAL_ADJUSTMENT (none when it is already there)."""
    if target < 0:
        raise AppHTTPException(422, "Stock quantity cannot go below zero", "validation_failed")
    location = await ensure_default_location(user)
    row = await _active_product(user, item_id)
    current = product_view(row, location["id"])["default_location_quantity"]
    delta = target - current
    if delta != 0:
        await record(
            user, item_id, location["id"], "in" if delta > 0 else "out", "MANUAL_ADJUSTMENT", abs(delta), reason
        )


async def _owned_listing(user: AuthenticatedUser, listing_id: str, item_id: str | None = None) -> dict:
    listing = await repo.fetch_owned_listing(user.access_token, user.id, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    # One inventory item per listing, as the old table's unique key had it.
    if listing.get("inventory_product_id") not in (None, item_id):
        raise AppHTTPException(409, LISTING_TAKEN, "conflict")
    return listing


async def legacy_create_inventory(user: AuthenticatedUser, fields: dict) -> dict:
    """A product named after its listing (or `Item <SKU>`), linked to that listing, with the starting stock recorded as
    a RESTOCK at the default location, so the ledger explains it from the first unit (SRDS §25).

    The writes are separate PostgREST calls, so a refusal after the product exists would leave it behind with the
    listing pointing at it (B2 verification F4). Everything that can be checked is checked first: the body's bounds
    (dealer/schemas.py), the listing, and the default location the stock goes to. If a later write is refused anyway,
    the link and the product are undone before the error is raised; the product has no ledger row yet, since
    record_movement writes its movement and stock in one transaction or not at all."""
    stock_quantity = float(fields.get("stock_quantity") or 0)
    if stock_quantity < 0:
        raise AppHTTPException(422, "Stock quantity cannot go below zero", "validation_failed")
    listing_id = fields.get("listing_id")
    listing = await _owned_listing(user, listing_id) if listing_id else None
    location = await ensure_default_location(user) if stock_quantity > 0 else None

    sku = fields.get("sku") or f"SKU-{uuid.uuid4().hex[:8].upper()}"
    name = fields.get("name") or ((listing.get("title") or "").strip() if listing else "") or f"Item {sku}"
    product: dict = {"sku": sku, "name": name, "unit": fields.get("unit") or "unit"}
    if fields.get("purchase_cost") is not None:
        product["cost_price"] = fields["purchase_cost"]
    if fields.get("selling_price") is not None:
        product["selling_price"] = fields["selling_price"]
    if fields.get("min_stock_threshold") is not None:
        product["reorder_threshold"] = fields["min_stock_threshold"]
    created = await repo.create_row(user.access_token, PRODUCTS, user.id, product)

    try:
        # The link first, and only to a listing still without a product: a concurrent create may have taken it since
        # _owned_listing read it (B2 re-verification N1). The opening stock is recorded only once the link holds, so a
        # create that loses leaves no product, and no stock, behind.
        if listing_id and not await repo.link_unlinked_listing(user.access_token, user.id, listing_id, created["id"]):
            raise AppHTTPException(409, LISTING_TAKEN, "conflict")
        if location is not None:
            await record(user, created["id"], location["id"], "in", "RESTOCK", stock_quantity, "Opening stock")
    except (APIError, HTTPException):
        # A refusal from PostgREST, or one stock_errors mapped (AppHTTPException is an HTTPException).
        await repo.unlink_product_listings(user.access_token, user.id, created["id"])
        await repo.delete_row(user.access_token, PRODUCTS, created["id"])
        raise
    return await legacy_get_inventory(user, created["id"])


async def _move_listing(user: AuthenticatedUser, item_id: str, new_listing: str | None) -> None:
    """Points the item at `new_listing` (or at none). The new listing is taken first, and only while no other item
    holds it (B2 re-verification N1): a concurrent create or edit that took it since _owned_listing read it leaves this
    edit with 0 rows, answered 409 with nothing changed, the old link never touched. Only once the new link holds are
    the item's other listings let go."""
    if new_listing:
        listing = await _owned_listing(user, new_listing, item_id)
        if listing.get("inventory_product_id") != item_id and not await repo.link_unlinked_listing(
            user.access_token, user.id, new_listing, item_id
        ):
            raise AppHTTPException(409, LISTING_TAKEN, "conflict")
    await repo.unlink_product_listings(user.access_token, user.id, item_id, except_listing_id=new_listing or None)


async def legacy_update_inventory(user: AuthenticatedUser, item_id: str, fields: dict) -> dict:
    await _active_product(user, item_id)
    # The listing first: it is the step another request can win, and losing it must leave the item unchanged.
    if "listing_id" in fields:
        await _move_listing(user, item_id, fields["listing_id"])
    renames = {
        "unit": "unit",
        "purchase_cost": "cost_price",
        "selling_price": "selling_price",
        "min_stock_threshold": "reorder_threshold",
    }
    product = {new: fields[old] for old, new in renames.items() if old in fields}
    # unit and the threshold are not-null columns; a null for them means "unchanged" to the old form.
    product = {k: v for k, v in product.items() if v is not None or k in ("cost_price", "selling_price")}
    if product:
        await repo.update_row(user.access_token, PRODUCTS, item_id, product)

    if fields.get("stock_quantity") is not None:
        await _move_to(user, item_id, float(fields["stock_quantity"]), EDITED_REASON)
    return await legacy_get_inventory(user, item_id)


async def legacy_delete_inventory(user: AuthenticatedUser, item_id: str) -> None:
    """Unlinks the listing (it falls back to its own quantity), then deletes the product, or deactivates it when the
    ledger refers to it (SRDS §24-§25: history is never deleted)."""
    await _active_product(user, item_id)
    await repo.unlink_product_listings(user.access_token, user.id, item_id)
    await repo.delete_or_deactivate(user.access_token, PRODUCTS, item_id)


def _legacy_transaction(movement: dict) -> dict:
    quantity = float(movement["quantity"])
    signed = quantity if movement["direction"] == "in" else -quantity
    fallback = "addition" if movement["direction"] == "in" else "reduction"
    return {
        "id": movement["id"],
        "inventory_id": movement["product_id"],
        "type": _SOURCE_TO_TYPE.get(movement["source"], fallback),
        "quantity": signed,
        "actor": movement.get("actor"),
        "notes": movement.get("reason"),
        "created_at": movement["created_at"],
    }


async def legacy_list_transactions(user: AuthenticatedUser, item_id: str) -> list[dict]:
    await _active_product(user, item_id)
    movements = await repo.fetch_movements(user.access_token, product_id=item_id)
    return [_legacy_transaction(m) for m in movements]


async def legacy_adjust_stock(
    user: AuthenticatedUser, item_id: str, type_: str, quantity: float, notes: str | None
) -> dict:
    """The old adjustment types as ledger movements at the default location:
    addition/restock → RESTOCK in; reduction → OTHER out; sale → LOCAL_SALE out (a sale the dealer records by hand is a
    local sale, SRDS §22); adjustment/correction set the exact quantity, as the old screen says, through one
    MANUAL_ADJUSTMENT. A shortage is 422 insufficient_stock (errors.stock_errors)."""
    await _active_product(user, item_id)
    reason = (notes or "").strip() or None
    if type_ in ("adjustment", "correction"):
        await _move_to(user, item_id, float(quantity), reason or ADJUSTED_REASON)
        return await legacy_get_inventory(user, item_id)

    # The size of a change, never its sign flipped: a restock of -1 was once recorded as +1 (B2 verification F8). The
    # request schema refuses it too (dealer/schemas.AdjustStockRequest); this guards every other caller.
    amount = float(quantity)
    if amount <= 0:
        raise AppHTTPException(422, "The quantity must be more than zero", "validation_failed")
    location = await ensure_default_location(user)
    if type_ in ("addition", "restock"):
        await record(user, item_id, location["id"], "in", "RESTOCK", amount, reason)
    elif type_ == "sale":
        await record(user, item_id, location["id"], "out", "LOCAL_SALE", amount, reason)
    elif type_ == "reduction":
        await record(user, item_id, location["id"], "out", "OTHER", amount, reason or REDUCED_REASON)
    else:
        raise AppHTTPException(422, f"Unknown adjustment type {type_}", "validation_failed")
    return await legacy_get_inventory(user, item_id)


# --- stores (locations) -------------------------------------------------------------------------------------------


def _legacy_store(location: dict) -> dict:
    # The old store's contact, opening hours and structured location have no IMS column; they read as empty.
    return {
        "id": location["id"],
        "dealer_id": location["dealer_id"],
        "name": location["name"],
        "address": location.get("address"),
        "location": None,
        "contact": None,
        "opening_info": None,
        "status": _status(location),
        "created_at": location["created_at"],
        "updated_at": location["updated_at"],
    }


def _location_fields(fields: dict) -> dict:
    mapped = _active(fields)
    return {
        k: v for k, v in mapped.items() if k in ("name", "address", "is_active") and not (k == "name" and v is None)
    }


async def legacy_list_stores(user: AuthenticatedUser) -> list[dict]:
    return [_legacy_store(row) for row in await repo.list_rows(user.access_token, LOCATIONS)]


async def legacy_get_store(user: AuthenticatedUser, store_id: str) -> dict:
    location = await repo.fetch_row(user.access_token, LOCATIONS, store_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Store not found")
    return _legacy_store(location)


async def legacy_create_store(user: AuthenticatedUser, fields: dict) -> dict:
    return _legacy_store(await create_location(user, {**_location_fields(fields), "kind": "shop"}))


async def legacy_update_store(user: AuthenticatedUser, store_id: str, fields: dict) -> dict:
    return _legacy_store(await update_location(user, store_id, _location_fields(fields)))


async def legacy_delete_store(user: AuthenticatedUser, store_id: str) -> None:
    await delete_location(user, store_id)


# --- suppliers ----------------------------------------------------------------------------------------------------


def _legacy_supplier(row: dict) -> dict:
    supplier = {k: row.get(k) for k in ("id", "dealer_id", "name", "contact", "products_supplied", "notes")}
    return {**supplier, "status": _status(row), "created_at": row["created_at"], "updated_at": row["updated_at"]}


def _supplier_fields(fields: dict) -> dict:
    mapped = _active(fields)
    allowed = ("name", "contact", "products_supplied", "notes", "is_active")
    return {k: v for k, v in mapped.items() if k in allowed and not (k == "name" and v is None)}


async def legacy_list_suppliers(user: AuthenticatedUser) -> list[dict]:
    return [_legacy_supplier(row) for row in await repo.list_rows(user.access_token, SUPPLIERS)]


async def legacy_get_supplier(user: AuthenticatedUser, supplier_id: str) -> dict:
    supplier = await repo.fetch_row(user.access_token, SUPPLIERS, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return _legacy_supplier(supplier)


async def legacy_create_supplier(user: AuthenticatedUser, fields: dict) -> dict:
    return _legacy_supplier(await repo.create_row(user.access_token, SUPPLIERS, user.id, _supplier_fields(fields)))


async def legacy_update_supplier(user: AuthenticatedUser, supplier_id: str, fields: dict) -> dict:
    mapped = _supplier_fields(fields)
    if not mapped:
        return await legacy_get_supplier(user, supplier_id)
    return _legacy_supplier(await repo.update_row(user.access_token, SUPPLIERS, supplier_id, mapped))


async def legacy_delete_supplier(user: AuthenticatedUser, supplier_id: str) -> None:
    await legacy_get_supplier(user, supplier_id)
    await repo.delete_row(user.access_token, SUPPLIERS, supplier_id)


# --- dealer analytics -------------------------------------------------------------------------------------------------


async def fetch_dealer_inventory_summary(user: AuthenticatedUser) -> dict:
    """For the dealer analytics (common/analytics): the low-stock count (at or under the threshold at the default
    location, out of stock included, as the old count was), units in and out per day for 30 days, and the marketplace
    sales (ZARAILINK_ORDER movements). Read with the dealer's own token, so the admin never reaches it (B0)."""
    rows = await repo.fetch_products(user.access_token, include_inactive=False, paged=False)
    default_id = await _default_location_id(user)
    alerts = alerts_for([product_view(row, default_id) for row in rows], default_id)
    trend = daily_trend(await trend_movements(user))
    # Every product and every sale, page by page: one read stops at PostgREST's max_rows (1000), and a count or chart
    # built from a capped read is wrong, not short (B2 verification F3).
    sales = await repo.fetch_all_movements(
        user.access_token, sources=["ZARAILINK_ORDER"], columns="created_at,quantity,product_id"
    )
    return {
        "low_stock_count": len(alerts),
        "inventory_movement": trend,
        "sales": [
            {"created_at": s["created_at"], "quantity": float(s["quantity"]), "product_id": s["product_id"]}
            for s in sales
        ],
    }
