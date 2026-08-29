from typing import Literal

from pydantic import BaseModel

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
    country_id: str | None = None
    province_id: str | None = None
    city_id: str | None = None


class StoreUpdateInput(BaseModel):
    name: str | None = None
    address: str | None = None
    contact: str | None = None
    opening_info: str | None = None
    status: DealerEntityStatus | None = None
    country_id: str | None = None
    province_id: str | None = None
    city_id: str | None = None


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
