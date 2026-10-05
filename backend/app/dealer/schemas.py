from typing import Literal

from pydantic import BaseModel, Field

from app.common.schemas import ApplicationDocument, Location

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


# ---- The dealer application (A3b; SRDS §7, §12) ---------------------------------------------------------------------

# The five business types the maintainer decided on (2026-10-04); the enum dealer_business_type matches.
BusinessType = Literal["agri_input_retailer", "wholesaler", "distributor", "manufacturer", "other"]


class DealerApplicationInput(BaseModel):
    """The business half of a dealer's application. The lengths match the table's checks."""

    business_name: str = Field(min_length=2, max_length=120)
    business_type: BusinessType
    registration_number: str = Field(min_length=2, max_length=60)
    business_address: str = Field(min_length=5, max_length=300)
    country: str = Field(min_length=2, max_length=100)
    province: str = Field(min_length=2, max_length=100)
    city: str = Field(min_length=2, max_length=100)


class DealerProfile(DealerApplicationInput):
    id: str
    created_at: str
    updated_at: str


class DealerApplicant(BaseModel):
    """The account half an admin reviews next to the business (SRDS §12)."""

    id: str
    full_name: str
    phone: str | None = None
    account_status: Literal["pending", "approved", "rejected"]
    account_status_reason: str | None = None
    application_submitted_at: str | None = None
    created_at: str


class DealerApplicationForAdmin(DealerApplicant):
    dealer_profile: DealerProfile | None = None
    dealer_documents: list[ApplicationDocument] = []
