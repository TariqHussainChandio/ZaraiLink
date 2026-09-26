from fastapi import APIRouter, Depends

from ....core.auth import AuthenticatedUser, require_dealer
from ....core.pagination import Page, paginate
from ....schemas.dealer import (
    AdjustStockRequest,
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
from ....services import dealer_service as service

router = APIRouter(prefix="/api/v1/dealer", tags=["dealer"])


# --- inventory ------------------------------------------------------------------------------


@router.get("/inventory", response_model=list[InventoryItemWithListing])
async def list_inventory(
    user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_inventory(user))


@router.get("/inventory/listings", response_model=list[ListingSummary])
async def list_dealer_listings(
    user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_dealer_listings(user))


@router.post("/inventory", response_model=InventoryItem)
async def create_inventory_item(request: InventoryInput, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await service.create_inventory_item(user, request.model_dump())


@router.get("/inventory/{inventory_id}", response_model=InventoryItemWithListing)
async def get_inventory_item(inventory_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await service.fetch_inventory_by_id(user, inventory_id)


@router.patch("/inventory/{inventory_id}", response_model=InventoryItem)
async def update_inventory_item(
    inventory_id: str, request: InventoryUpdateInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await service.update_inventory_item(user, inventory_id, request.model_dump(exclude_unset=True))


@router.delete("/inventory/{inventory_id}", status_code=204)
async def delete_inventory_item(inventory_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> None:
    await service.delete_inventory_item(user, inventory_id)


@router.get("/inventory/{inventory_id}/transactions", response_model=list[InventoryTransaction])
async def list_inventory_transactions(
    inventory_id: str, user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_inventory_transactions(user, inventory_id))


@router.post("/inventory/{inventory_id}/adjust", response_model=InventoryItem)
async def adjust_stock(
    inventory_id: str, request: AdjustStockRequest, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await service.adjust_stock_as_user(user, inventory_id, request.type, request.quantity, request.notes)


# --- stores -----------------------------------------------------------------------------------


@router.get("/stores", response_model=list[DealerStore])
async def list_stores(user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_stores(user))


@router.post("/stores", response_model=DealerStore)
async def create_store(request: StoreInput, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await service.create_store(user, request)


@router.get("/stores/{store_id}", response_model=DealerStore)
async def get_store(store_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await service.fetch_store_by_id(user, store_id)


@router.patch("/stores/{store_id}", response_model=DealerStore)
async def update_store(
    store_id: str, request: StoreUpdateInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await service.update_store(user, store_id, request)


@router.delete("/stores/{store_id}", status_code=204)
async def delete_store(store_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> None:
    await service.delete_store(user, store_id)


# --- suppliers --------------------------------------------------------------------------------


@router.get("/suppliers", response_model=list[Supplier])
async def list_suppliers(
    user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_suppliers(user))


@router.post("/suppliers", response_model=Supplier)
async def create_supplier(request: SupplierInput, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await service.create_supplier(user, request.model_dump())


@router.get("/suppliers/{supplier_id}", response_model=Supplier)
async def get_supplier(supplier_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await service.fetch_supplier_by_id(user, supplier_id)


@router.patch("/suppliers/{supplier_id}", response_model=Supplier)
async def update_supplier(
    supplier_id: str, request: SupplierUpdateInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await service.update_supplier(user, supplier_id, request.model_dump(exclude_unset=True))


@router.delete("/suppliers/{supplier_id}", status_code=204)
async def delete_supplier(supplier_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> None:
    await service.delete_supplier(user, supplier_id)
