from fastapi import HTTPException
from postgrest.exceptions import APIError

from ..core.auth import AuthenticatedUser
from ..core.errors import AppHTTPException
from ..repositories import dealer_repository as repo


def _location(country: str | None, province: str | None, city: str | None) -> dict | None:
    if not country and not province and not city:
        return None
    return {"country": country, "province": province, "city": city}


def _store_fields(input, location_touched: bool) -> dict:
    provided = input.model_dump(exclude_unset=True)
    fields = {k: v for k, v in provided.items() if k not in ("country", "province", "city")}
    if location_touched:
        fields["location"] = _location(provided.get("country"), provided.get("province"), provided.get("city"))
    return fields


# --- inventory ------------------------------------------------------------------------------


async def fetch_inventory(user: AuthenticatedUser) -> list[dict]:
    return await repo.fetch_inventory(user.access_token, user.id)


async def fetch_inventory_by_id(user: AuthenticatedUser, inventory_id: str) -> dict:
    item = await repo.fetch_inventory_by_id(user.access_token, inventory_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return item


async def fetch_dealer_listings(user: AuthenticatedUser) -> list[dict]:
    return await repo.fetch_dealer_listings(user.access_token, user.id)


async def create_inventory_item(user: AuthenticatedUser, fields: dict) -> dict:
    return await repo.create_inventory_item(user.access_token, user.id, fields)


async def update_inventory_item(user: AuthenticatedUser, inventory_id: str, fields: dict) -> dict:
    return await repo.update_inventory_item(user.access_token, inventory_id, fields)


async def delete_inventory_item(user: AuthenticatedUser, inventory_id: str) -> None:
    await repo.delete_inventory_item(user.access_token, inventory_id)


async def fetch_inventory_transactions(user: AuthenticatedUser, inventory_id: str) -> list[dict]:
    return await repo.fetch_inventory_transactions(user.access_token, inventory_id)


async def adjust_stock(
    access_token: str, inventory_id: str, type_: str, quantity: int, actor_id: str, notes: str | None
) -> dict:
    """
    Records a stock movement and updates `inventory.stock_quantity` to match. `addition`/
    `restock` increase stock by `quantity`, `reduction`/`sale` decrease it, `adjustment`/
    `correction` set stock to `quantity` directly (a known-correct count). The read-check-write
    itself happens atomically inside `public.adjust_stock`
    (supabase/migrations/20260901130000_atomic_stock_adjustment.sql), row-locked for the
    duration of that one RPC call — not here in Python across two separate requests, which is
    what let two concurrent adjustments to the same row race each other and both "succeed."

    Takes `access_token`/`actor_id` directly (not an `AuthenticatedUser`) rather than being
    dealer-role-gated, so a caller acting on behalf of a specific dealer (this endpoint's own
    handler) can pass that dealer's own token; that token's inventory-table RLS access (or lack
    of it) is what actually governs whether this can do anything, not a role check at this layer.
    """
    try:
        return await repo.adjust_stock(access_token, inventory_id, type_, quantity, actor_id, notes)
    except APIError as exc:
        if exc.code == "P0002":
            raise HTTPException(status_code=404, detail="Inventory item not found")
        if exc.code == "P0001":
            raise AppHTTPException(422, exc.message or "Stock quantity cannot go below zero", "insufficient_stock")
        raise


async def adjust_stock_as_user(
    user: AuthenticatedUser, inventory_id: str, type_: str, quantity: int, notes: str | None
) -> dict:
    return await adjust_stock(user.access_token, inventory_id, type_, quantity, user.id, notes)


# --- stores -----------------------------------------------------------------------------------


async def fetch_stores(user: AuthenticatedUser) -> list[dict]:
    return await repo.fetch_stores(user.access_token, user.id)


async def fetch_store_by_id(user: AuthenticatedUser, store_id: str) -> dict:
    store = await repo.fetch_store_by_id(user.access_token, store_id)
    if store is None:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


async def create_store(user: AuthenticatedUser, input) -> dict:
    fields = _store_fields(input, location_touched=True)
    return await repo.create_store(user.access_token, user.id, fields)


async def update_store(user: AuthenticatedUser, store_id: str, input) -> dict:
    provided = input.model_dump(exclude_unset=True)
    location_touched = any(k in provided for k in ("country", "province", "city"))
    fields = _store_fields(input, location_touched)
    return await repo.update_store(user.access_token, store_id, fields)


async def delete_store(user: AuthenticatedUser, store_id: str) -> None:
    await repo.delete_store(user.access_token, store_id)


# --- suppliers --------------------------------------------------------------------------------


async def fetch_suppliers(user: AuthenticatedUser) -> list[dict]:
    return await repo.fetch_suppliers(user.access_token, user.id)


async def fetch_supplier_by_id(user: AuthenticatedUser, supplier_id: str) -> dict:
    supplier = await repo.fetch_supplier_by_id(user.access_token, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier


async def create_supplier(user: AuthenticatedUser, fields: dict) -> dict:
    return await repo.create_supplier(user.access_token, user.id, fields)


async def update_supplier(user: AuthenticatedUser, supplier_id: str, fields: dict) -> dict:
    return await repo.update_supplier(user.access_token, supplier_id, fields)


async def delete_supplier(user: AuthenticatedUser, supplier_id: str) -> None:
    await repo.delete_supplier(user.access_token, supplier_id)
