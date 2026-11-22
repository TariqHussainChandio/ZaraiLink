from typing import Annotated, Literal, Self

from pydantic import BaseModel, Field, model_validator

from app.common.schemas import ApplicationDocument, Location
from app.inventory.schemas import (
    ADDRESS_MAX,
    CONTACT_MAX,
    NAME_MAX,
    NUMERIC_LIMIT,
    TEXT_MAX,
    UNIT_MAX,
    Amount,
)

DealerEntityStatus = Literal["active", "inactive"]
InventoryTransactionType = Literal["addition", "reduction", "adjustment", "sale", "restock", "correction"]

# The legacy inventory routes are served by the IMS since B3 (inventory/service.py), so their bodies follow its rules:
# prices are the IMS Amount (finite, two decimals, below what numeric(12, 2) holds: NaN or Infinity used to reach the
# database and answer 500), and the whole-number stock figures the old form sends keep their type but get the same
# bounds, so an out-of-range figure is refused before anything is written (B2 verification F4, F5).
WholeStock = Annotated[int, Field(ge=0, lt=NUMERIC_LIMIT)]
_Name = Annotated[str, Field(min_length=1, max_length=NAME_MAX)]
_Unit = Annotated[str, Field(min_length=1, max_length=UNIT_MAX)]
_Address = Annotated[str, Field(max_length=ADDRESS_MAX)]
_Contact = Annotated[str, Field(max_length=CONTACT_MAX)]
_Text = Annotated[str, Field(max_length=TEXT_MAX)]
_Place = Annotated[str, Field(max_length=100)]  # the dealer application's country, province and city cap


class InventoryInput(BaseModel):
    listing_id: str | None
    stock_quantity: WholeStock
    unit: _Unit
    purchase_cost: Amount | None = None
    selling_price: Amount | None = None
    min_stock_threshold: WholeStock


class InventoryUpdateInput(BaseModel):
    listing_id: str | None = None
    unit: _Unit | None = None
    purchase_cost: Amount | None = None
    selling_price: Amount | None = None
    min_stock_threshold: WholeStock | None = None


# The types that record a change by its size; adjustment and correction set the exact quantity instead.
CHANGE_TYPES = ("addition", "reduction", "sale", "restock")


class AdjustStockRequest(BaseModel):
    """`quantity` is the size of the change for addition, restock, sale and reduction, so it must be positive (a
    restock of -1 used to be recorded as +1); for adjustment and correction it is the new stock, so zero is allowed."""

    type: InventoryTransactionType
    quantity: WholeStock
    notes: _Text | None = None

    @model_validator(mode="after")
    def _positive_change(self) -> Self:
        if self.type in CHANGE_TYPES and self.quantity <= 0:
            raise ValueError(f"A {self.type} needs a quantity of more than zero")
        return self


class StoreInput(BaseModel):
    name: _Name
    address: _Address | None = None
    contact: _Contact | None = None
    opening_info: _Text | None = None
    status: DealerEntityStatus = "active"
    country: _Place | None = None
    province: _Place | None = None
    city: _Place | None = None


class StoreUpdateInput(BaseModel):
    name: _Name | None = None
    address: _Address | None = None
    contact: _Contact | None = None
    opening_info: _Text | None = None
    status: DealerEntityStatus | None = None
    country: _Place | None = None
    province: _Place | None = None
    city: _Place | None = None


class SupplierInput(BaseModel):
    name: _Name
    contact: _Contact | None = None
    products_supplied: _Text | None = None
    notes: _Text | None = None
    status: DealerEntityStatus = "active"


class SupplierUpdateInput(BaseModel):
    name: _Name | None = None
    contact: _Contact | None = None
    products_supplied: _Text | None = None
    notes: _Text | None = None
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
