from fastapi import HTTPException

from ..core.auth import AuthenticatedUser
from ..repositories import dealer_repository as repo

ABSOLUTE_TYPES = {"adjustment", "correction"}
INCREASE_TYPES = {"addition", "restock"}


def _location(country_id: str | None, province_id: str | None, city_id: str | None) -> dict | None:
    if not country_id and not province_id and not city_id:
        return None
    return {"country_id": country_id, "province_id": province_id, "city_id": city_id}


def _store_fields(input, location_touched: bool) -> dict:
    provided = input.model_dump(exclude_unset=True)
    fields = {k: v for k, v in provided.items() if k not in ("country_id", "province_id", "city_id")}
    if location_touched:
        fields["location"] = _location(
            provided.get("country_id"), provided.get("province_id"), provided.get("city_id")
        )
    return fields


# --- inventory ------------------------------------------------------------------------------


def fetch_inventory(user: AuthenticatedUser) -> list[dict]:
    return repo.fetch_inventory(user.access_token, user.id)


def fetch_inventory_by_id(user: AuthenticatedUser, inventory_id: str) -> dict:
    item = repo.fetch_inventory_by_id(user.access_token, inventory_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return item


def fetch_dealer_listings(user: AuthenticatedUser) -> list[dict]:
    return repo.fetch_dealer_listings(user.access_token, user.id)


def create_inventory_item(user: AuthenticatedUser, fields: dict) -> dict:
    return repo.create_inventory_item(user.access_token, user.id, fields)


def update_inventory_item(user: AuthenticatedUser, inventory_id: str, fields: dict) -> dict:
    return repo.update_inventory_item(user.access_token, inventory_id, fields)


def delete_inventory_item(user: AuthenticatedUser, inventory_id: str) -> None:
    repo.delete_inventory_item(user.access_token, inventory_id)


def fetch_inventory_transactions(user: AuthenticatedUser, inventory_id: str) -> list[dict]:
    return repo.fetch_inventory_transactions(user.access_token, inventory_id)


def adjust_stock(
    access_token: str, inventory_id: str, type_: str, quantity: int, actor_id: str, notes: str | None
) -> dict:
    """
    Records a stock movement and updates `inventory.stock_quantity` to match. `addition`/
    `restock` increase stock by `quantity`, `reduction`/`sale` decrease it, `adjustment`/
    `correction` set stock to `quantity` directly (a known-correct count) — the logged
    transaction quantity is always the resulting delta, so the log stays additive. Moved
    verbatim from the frontend's `inventoryService.adjustStock`.

    Takes `access_token`/`actor_id` directly (not an `AuthenticatedUser`) rather than being
    dealer-role-gated, because Orders' checkout-confirmation flow calls this in-process
    (rule 32 — no internal HTTP hop) using whichever seller is confirming their own order; that
    seller's own inventory-table RLS access (or lack of it, for a non-dealer seller) is what
    actually governs whether this can do anything, not a role check at this layer.
    """
    current = repo.fetch_inventory_by_id(access_token, inventory_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    if type_ in ABSOLUTE_TYPES:
        new_stock = quantity
    elif type_ in INCREASE_TYPES:
        new_stock = current["stock_quantity"] + quantity
    else:
        new_stock = current["stock_quantity"] - quantity

    if new_stock < 0:
        raise HTTPException(status_code=422, detail="Stock quantity cannot go below zero")

    delta = new_stock - current["stock_quantity"]

    repo.insert_inventory_transaction(access_token, inventory_id, type_, delta, actor_id, notes)
    return repo.set_stock_quantity(access_token, inventory_id, new_stock)


def adjust_stock_as_user(user: AuthenticatedUser, inventory_id: str, type_: str, quantity: int, notes: str | None) -> dict:
    return adjust_stock(user.access_token, inventory_id, type_, quantity, user.id, notes)


# --- stores -----------------------------------------------------------------------------------


def fetch_stores(user: AuthenticatedUser) -> list[dict]:
    return repo.fetch_stores(user.access_token, user.id)


def fetch_store_by_id(user: AuthenticatedUser, store_id: str) -> dict:
    store = repo.fetch_store_by_id(user.access_token, store_id)
    if store is None:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


def create_store(user: AuthenticatedUser, input) -> dict:
    fields = _store_fields(input, location_touched=True)
    return repo.create_store(user.access_token, user.id, fields)


def update_store(user: AuthenticatedUser, store_id: str, input) -> dict:
    provided = input.model_dump(exclude_unset=True)
    location_touched = any(k in provided for k in ("country_id", "province_id", "city_id"))
    fields = _store_fields(input, location_touched)
    return repo.update_store(user.access_token, store_id, fields)


def delete_store(user: AuthenticatedUser, store_id: str) -> None:
    repo.delete_store(user.access_token, store_id)


# --- suppliers --------------------------------------------------------------------------------


def fetch_suppliers(user: AuthenticatedUser) -> list[dict]:
    return repo.fetch_suppliers(user.access_token, user.id)


def fetch_supplier_by_id(user: AuthenticatedUser, supplier_id: str) -> dict:
    supplier = repo.fetch_supplier_by_id(user.access_token, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier


def create_supplier(user: AuthenticatedUser, fields: dict) -> dict:
    return repo.create_supplier(user.access_token, user.id, fields)


def update_supplier(user: AuthenticatedUser, supplier_id: str, fields: dict) -> dict:
    return repo.update_supplier(user.access_token, supplier_id, fields)


def delete_supplier(user: AuthenticatedUser, supplier_id: str) -> None:
    repo.delete_supplier(user.access_token, supplier_id)
