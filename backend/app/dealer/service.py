from fastapi import HTTPException

from app.auth.dependencies import AuthenticatedUser
from app.common import application_documents as documents
from app.common.errors import AppHTTPException
from app.dealer import repository as repo
from app.inventory import service as inventory_service


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


# --- inventory, stores, suppliers: the legacy routes over the IMS (B2/B3) -------------------------------------------
#
# The old tables (inventory, inventory_transactions, dealer_stores, suppliers) were dropped by
# 20261022090000_inventory_sync.sql. The maintainer kept these routes, their paths and their response shapes so the
# current dealer screens keep working, but they are now served from the IMS tables. The dealer module reaches them only
# through the inventory module's public service (module boundary; BR-03/04: dealer inventory is dealer-only, and the
# IMS owns those rules and their errors). A None result means the row is not the caller's or does not exist: 404.


def _found(row: dict | None, what: str) -> dict:
    if row is None:
        raise HTTPException(status_code=404, detail=f"{what} not found")
    return row


async def fetch_inventory(user: AuthenticatedUser) -> list[dict]:
    return await inventory_service.legacy_list_inventory(user)


async def fetch_inventory_by_id(user: AuthenticatedUser, inventory_id: str) -> dict:
    return _found(await inventory_service.legacy_get_inventory(user, inventory_id), "Inventory item")


async def fetch_dealer_listings(user: AuthenticatedUser) -> list[dict]:
    # The listing picker reads the dealer's own listings, which are marketplace rows, not inventory.
    return await repo.fetch_dealer_listings(user.access_token, user.id)


async def create_inventory_item(user: AuthenticatedUser, fields: dict) -> dict:
    return await inventory_service.legacy_create_inventory(user, fields)


async def update_inventory_item(user: AuthenticatedUser, inventory_id: str, fields: dict) -> dict:
    return _found(await inventory_service.legacy_update_inventory(user, inventory_id, fields), "Inventory item")


async def delete_inventory_item(user: AuthenticatedUser, inventory_id: str) -> None:
    await inventory_service.legacy_delete_inventory(user, inventory_id)


async def fetch_inventory_transactions(user: AuthenticatedUser, inventory_id: str) -> list[dict]:
    return await inventory_service.legacy_list_transactions(user, inventory_id)


async def adjust_stock_as_user(
    user: AuthenticatedUser, inventory_id: str, type_: str, quantity: int, notes: str | None
) -> dict:
    # The IMS records the movement in its ledger and refuses stock below zero itself (one definer function, row-locked),
    # so there is no read-check-write here.
    return _found(
        await inventory_service.legacy_adjust_stock(user, inventory_id, type_, quantity, notes), "Inventory item"
    )


async def fetch_stores(user: AuthenticatedUser) -> list[dict]:
    return await inventory_service.legacy_list_stores(user)


async def fetch_store_by_id(user: AuthenticatedUser, store_id: str) -> dict:
    return _found(await inventory_service.legacy_get_store(user, store_id), "Store")


async def create_store(user: AuthenticatedUser, input) -> dict:
    # The fields keep the legacy store shape (country/province/city folded into `location`); the IMS maps them.
    return await inventory_service.legacy_create_store(user, _store_fields(input, location_touched=True))


async def update_store(user: AuthenticatedUser, store_id: str, input) -> dict:
    provided = input.model_dump(exclude_unset=True)
    location_touched = any(k in provided for k in ("country", "province", "city"))
    fields = _store_fields(input, location_touched)
    return _found(await inventory_service.legacy_update_store(user, store_id, fields), "Store")


async def delete_store(user: AuthenticatedUser, store_id: str) -> None:
    await inventory_service.legacy_delete_store(user, store_id)


async def fetch_suppliers(user: AuthenticatedUser) -> list[dict]:
    return await inventory_service.legacy_list_suppliers(user)


async def fetch_supplier_by_id(user: AuthenticatedUser, supplier_id: str) -> dict:
    return _found(await inventory_service.legacy_get_supplier(user, supplier_id), "Supplier")


async def create_supplier(user: AuthenticatedUser, fields: dict) -> dict:
    return await inventory_service.legacy_create_supplier(user, fields)


async def update_supplier(user: AuthenticatedUser, supplier_id: str, fields: dict) -> dict:
    return _found(await inventory_service.legacy_update_supplier(user, supplier_id, fields), "Supplier")


async def delete_supplier(user: AuthenticatedUser, supplier_id: str) -> None:
    await inventory_service.legacy_delete_supplier(user, supplier_id)


# --- the dealer application (A3b; SRDS §7, §8, §12) -----------------------------------------------------------------


async def fetch_my_application(user: AuthenticatedUser) -> dict | None:
    return await repo.fetch_dealer_profile(user.access_token, user.id)


async def save_my_application(user: AuthenticatedUser, fields: dict) -> dict:
    saved = await repo.save_dealer_profile(user.access_token, user.id, fields)
    if saved is None:
        raise AppHTTPException(403, documents.LOCKED, "application_locked")
    return saved


async def fetch_my_documents(user: AuthenticatedUser) -> list[dict]:
    return await documents.list_documents(user.access_token, documents.DEALER, user.id)


async def add_my_document(
    user: AuthenticatedUser, storage_path: str, file_name: str, required_document_id: str | None
) -> dict:
    return await documents.register(
        user.access_token, documents.DEALER, user.id, storage_path, file_name, required_document_id
    )


async def remove_my_document(user: AuthenticatedUser, document_id: str) -> None:
    await documents.remove(user.access_token, documents.DEALER, user.id, document_id)


async def fetch_applications_for_admin(user: AuthenticatedUser, status: str) -> list[dict]:
    """For the admin module's dealer queue: it reaches the dealer's tables only through this service."""
    return await repo.fetch_applications_for_admin(user.access_token, status)


async def fetch_application_for_admin(user: AuthenticatedUser, dealer_id: str) -> dict:
    return await repo.fetch_application_for_admin(user.access_token, dealer_id)


async def document_url_for_admin(user: AuthenticatedUser, dealer_id: str, document_id: str) -> str:
    return await documents.signed_url(user.access_token, documents.DEALER, dealer_id, document_id)
