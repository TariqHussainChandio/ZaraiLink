from fastapi import APIRouter, Depends

from ....core.auth import AuthenticatedUser, require_dealer
from ....schemas.dealer import (
    AdjustStockRequest,
    InventoryInput,
    InventoryUpdateInput,
    StoreInput,
    StoreUpdateInput,
    SupplierInput,
    SupplierUpdateInput,
)
from ....services import dealer_service as service

router = APIRouter(prefix="/api/v1/dealer", tags=["dealer"])


# --- inventory ------------------------------------------------------------------------------


@router.get("/inventory")
async def list_inventory(user: AuthenticatedUser = Depends(require_dealer)) -> list[dict]:
    return service.fetch_inventory(user)


@router.get("/inventory/listings")
async def list_dealer_listings(user: AuthenticatedUser = Depends(require_dealer)) -> list[dict]:
    return service.fetch_dealer_listings(user)


@router.post("/inventory")
async def create_inventory_item(
    request: InventoryInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return service.create_inventory_item(user, request.model_dump())


@router.get("/inventory/{inventory_id}")
async def get_inventory_item(inventory_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return service.fetch_inventory_by_id(user, inventory_id)


@router.patch("/inventory/{inventory_id}")
async def update_inventory_item(
    inventory_id: str, request: InventoryUpdateInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return service.update_inventory_item(user, inventory_id, request.model_dump(exclude_unset=True))


@router.delete("/inventory/{inventory_id}", status_code=204)
async def delete_inventory_item(inventory_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> None:
    service.delete_inventory_item(user, inventory_id)


@router.get("/inventory/{inventory_id}/transactions")
async def list_inventory_transactions(
    inventory_id: str, user: AuthenticatedUser = Depends(require_dealer)
) -> list[dict]:
    return service.fetch_inventory_transactions(user, inventory_id)


@router.post("/inventory/{inventory_id}/adjust")
async def adjust_stock(
    inventory_id: str, request: AdjustStockRequest, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return service.adjust_stock_as_user(user, inventory_id, request.type, request.quantity, request.notes)


# --- stores -----------------------------------------------------------------------------------


@router.get("/stores")
async def list_stores(user: AuthenticatedUser = Depends(require_dealer)) -> list[dict]:
    return service.fetch_stores(user)


@router.post("/stores")
async def create_store(request: StoreInput, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return service.create_store(user, request)


@router.get("/stores/{store_id}")
async def get_store(store_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return service.fetch_store_by_id(user, store_id)


@router.patch("/stores/{store_id}")
async def update_store(
    store_id: str, request: StoreUpdateInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return service.update_store(user, store_id, request)


@router.delete("/stores/{store_id}", status_code=204)
async def delete_store(store_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> None:
    service.delete_store(user, store_id)


# --- suppliers --------------------------------------------------------------------------------


@router.get("/suppliers")
async def list_suppliers(user: AuthenticatedUser = Depends(require_dealer)) -> list[dict]:
    return service.fetch_suppliers(user)


@router.post("/suppliers")
async def create_supplier(request: SupplierInput, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return service.create_supplier(user, request.model_dump())


@router.get("/suppliers/{supplier_id}")
async def get_supplier(supplier_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return service.fetch_supplier_by_id(user, supplier_id)


@router.patch("/suppliers/{supplier_id}")
async def update_supplier(
    supplier_id: str, request: SupplierUpdateInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return service.update_supplier(user, supplier_id, request.model_dump(exclude_unset=True))


@router.delete("/suppliers/{supplier_id}", status_code=204)
async def delete_supplier(supplier_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> None:
    service.delete_supplier(user, supplier_id)
