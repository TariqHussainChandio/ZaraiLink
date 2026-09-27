from typing import Literal

from pydantic import BaseModel

from .common import Location

DealerEntityStatus = Literal["active", "inactive"]
InventoryTransactionType = Literal["addition", "reduction", "adjustment", "sale", "restock", "correction"]


class InventoryInput(BaseModel):
    listing_id: str | None
    stock_quantity: int
    unit: str
    purchase_cost: float | None = None
    selling_price: float | None = None
    min_stock_threshold: int


class InventoryUpdateInput(BaseModel):
    listing_id: str | None = None
    unit: str | None = None
    purchase_cost: float | None = None
    selling_price: float | None = None
    min_stock_threshold: int | None = None


class AdjustStockRequest(BaseModel):
    type: InventoryTransactionType
    quantity: int
    notes: str | None = None


class StoreInput(BaseModel):
    name: str
    address: str | None = None
    contact: str | None = None
    opening_info: str | None = None
    status: DealerEntityStatus = "active"
    country: str | None = None
    province: str | None = None
    city: str | None = None


class StoreUpdateInput(BaseModel):
    name: str | None = None
    address: str | None = None
    contact: str | None = None
    opening_info: str | None = None
    status: DealerEntityStatus | None = None
    country: str | None = None
    province: str | None = None
    city: str | None = None


class SupplierInput(BaseModel):
    name: str
    contact: str | None = None
    products_supplied: str | None = None
    notes: str | None = None
    status: DealerEntityStatus = "active"


class SupplierUpdateInput(BaseModel):
    name: str | None = None
    contact: str | None = None
    products_supplied: str | None = None
    notes: str | None = None
    status: DealerEntityStatus | None = None


# ---- response models (P7 7A): shapes proven against the real API, see tests/integration/smoke/test_smoke_contract.py


class ListingSummary(BaseModel):
    id: str
    title: str


class InventoryItem(BaseModel):
    id: str
    dealer_id: str
    listing_id: str | None = None
    stock_quantity: float
    unit: str
    purchase_cost: float | None = None
    selling_price: float | None = None
    min_stock_threshold: float
    created_at: str
    updated_at: str


class InventoryItemWithListing(InventoryItem):
    """The list and detail reads embed the linked listing; create, update and adjust return the bare row."""

    listing: ListingSummary | None = None


class InventoryTransaction(BaseModel):
    id: str
    inventory_id: str
    type: InventoryTransactionType
    quantity: float
    actor: str | None = None
    notes: str | None = None
    created_at: str


class DealerStore(BaseModel):
    id: str
    dealer_id: str
    name: str
    address: str | None = None
    location: Location | None = None
    contact: str | None = None
    opening_info: str | None = None
    status: DealerEntityStatus
    created_at: str
    updated_at: str


class Supplier(BaseModel):
    id: str
    dealer_id: str
    name: str
    contact: str | None = None
    products_supplied: str | None = None
    notes: str | None = None
    status: DealerEntityStatus
    created_at: str
    updated_at: str
