"""Dealer API routes: the dealer application and its documents, plus legacy inventory routes."""

from fastapi import APIRouter, Depends

from app.auth.dependencies import AuthenticatedUser, require_dealer, require_dealer_any_status
from app.common.pagination import Page, paginate
from app.common.schemas import ApplicationDocument, RegisterDocumentRequest
from app.dealer import service
from app.dealer.schemas import (
    AdjustStockRequest,
    DealerApplicationInput,
    DealerProfile,
    DealerStore,
    InventoryInput,
    InventoryItem,
    InventoryItemWithListing,
    InventoryTransaction,
    InventoryUpdateInput,
    ListingSummary,
    StoreInput,
    StoreUpdateInput,
    Supplier,
    SupplierInput,
    SupplierUpdateInput,
)

router = APIRouter(prefix="/api/v1/dealer", tags=["dealer"])


# --- the application (A3b): open to a pending or rejected dealer, who has nothing else -----------------------------


# Returns the caller's dealer application (business details), or null.
@router.get("/application", response_model=DealerProfile | None)
async def get_my_application(user: AuthenticatedUser = Depends(require_dealer_any_status)) -> dict | None:
    return await service.fetch_my_application(user)


@router.put("/application", response_model=DealerProfile)
async def save_my_application(
    request: DealerApplicationInput, user: AuthenticatedUser = Depends(require_dealer_any_status)
) -> dict:
    """The business details (SRDS §7). Accepted while the application is a draft or rejected, and once approved;
    refused with `application_locked` while it is under review, so the admin decides on what they read."""
    return await service.save_my_application(user, request.model_dump())


# Lists the documents attached to the caller's dealer application.
@router.get("/application/documents", response_model=list[ApplicationDocument])
async def list_my_documents(user: AuthenticatedUser = Depends(require_dealer_any_status)) -> list[dict]:
    return await service.fetch_my_documents(user)


@router.post("/application/documents", response_model=ApplicationDocument, status_code=201)
async def add_my_document(
    request: RegisterDocumentRequest, user: AuthenticatedUser = Depends(require_dealer_any_status)
) -> dict:
    """Attaches a file the dealer uploaded to `dealer-documents/<their id>/...`."""
    return await service.add_my_document(user, request.storage_path, request.file_name, request.required_document_id)


# Removes one document from the caller's dealer application.
@router.delete("/application/documents/{document_id}", status_code=204)
async def remove_my_document(document_id: str, user: AuthenticatedUser = Depends(require_dealer_any_status)) -> None:
    await service.remove_my_document(user, document_id)


# --- inventory ------------------------------------------------------------------------------


# Lists the dealer's inventory items (legacy shape, served from the IMS).
@router.get("/inventory", response_model=list[InventoryItemWithListing])
async def list_inventory(
    user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_inventory(user))


# Lists the dealer's own marketplace listings for the listing picker.
@router.get("/inventory/listings", response_model=list[ListingSummary])
async def list_dealer_listings(
    user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_dealer_listings(user))


# Creates an inventory item (stored as an IMS product).
@router.post("/inventory", response_model=InventoryItem)
async def create_inventory_item(request: InventoryInput, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await service.create_inventory_item(user, request.model_dump())


# Returns one of the dealer's inventory items.
@router.get("/inventory/{inventory_id}", response_model=InventoryItemWithListing)
async def get_inventory_item(inventory_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await service.fetch_inventory_by_id(user, inventory_id)


# Updates one of the dealer's inventory items.
@router.patch("/inventory/{inventory_id}", response_model=InventoryItem)
async def update_inventory_item(
    inventory_id: str, request: InventoryUpdateInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await service.update_inventory_item(user, inventory_id, request.model_dump(exclude_unset=True))


# Deletes one of the dealer's inventory items.
@router.delete("/inventory/{inventory_id}", status_code=204)
async def delete_inventory_item(inventory_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> None:
    await service.delete_inventory_item(user, inventory_id)


# Lists the stock history of one inventory item.
@router.get("/inventory/{inventory_id}/transactions", response_model=list[InventoryTransaction])
async def list_inventory_transactions(
    inventory_id: str, user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_inventory_transactions(user, inventory_id))


# Changes an item's stock (addition, reduction, sale...) as a ledger movement.
@router.post("/inventory/{inventory_id}/adjust", response_model=InventoryItem)
async def adjust_stock(
    inventory_id: str, request: AdjustStockRequest, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await service.adjust_stock_as_user(user, inventory_id, request.type, request.quantity, request.notes)


# --- stores -----------------------------------------------------------------------------------


# Lists the dealer's stores (the legacy name for inventory locations).
@router.get("/stores", response_model=list[DealerStore])
async def list_stores(user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_stores(user))


# Creates a store (an inventory location).
@router.post("/stores", response_model=DealerStore)
async def create_store(request: StoreInput, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await service.create_store(user, request)


# Returns one of the dealer's stores.
@router.get("/stores/{store_id}", response_model=DealerStore)
async def get_store(store_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await service.fetch_store_by_id(user, store_id)


# Updates one of the dealer's stores.
@router.patch("/stores/{store_id}", response_model=DealerStore)
async def update_store(
    store_id: str, request: StoreUpdateInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await service.update_store(user, store_id, request)


# Deletes one of the dealer's stores.
@router.delete("/stores/{store_id}", status_code=204)
async def delete_store(store_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> None:
    await service.delete_store(user, store_id)


# --- suppliers --------------------------------------------------------------------------------


# Lists the dealer's suppliers.
@router.get("/suppliers", response_model=list[Supplier])
async def list_suppliers(
    user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_suppliers(user))


# Creates a supplier.
@router.post("/suppliers", response_model=Supplier)
async def create_supplier(request: SupplierInput, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await service.create_supplier(user, request.model_dump())


# Returns one of the dealer's suppliers.
@router.get("/suppliers/{supplier_id}", response_model=Supplier)
async def get_supplier(supplier_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await service.fetch_supplier_by_id(user, supplier_id)


# Updates one of the dealer's suppliers.
@router.patch("/suppliers/{supplier_id}", response_model=Supplier)
async def update_supplier(
    supplier_id: str, request: SupplierUpdateInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await service.update_supplier(user, supplier_id, request.model_dump(exclude_unset=True))


# Deletes one of the dealer's suppliers.
@router.delete("/suppliers/{supplier_id}", status_code=204)
async def delete_supplier(supplier_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> None:
    await service.delete_supplier(user, supplier_id)
