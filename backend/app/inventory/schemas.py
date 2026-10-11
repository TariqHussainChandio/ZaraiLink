"""Pydantic models for the dealer Inventory Management System (B1, docs/plan-inventory.md §2; B2 routes).

They mirror supabase/migrations/20261021080000_inventory_data_model.sql and 20261022090000_inventory_sync.sql.
"""

from datetime import date
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

# SRDS §24: every stock change carries one of these sources.
MovementSource = Literal[
    "ZARAILINK_ORDER", "LOCAL_SALE", "PURCHASE", "RESTOCK", "MANUAL_ADJUSTMENT", "DAMAGE", "EXPIRY", "TRANSFER", "OTHER"
]
# The sources a dealer records by hand; orders, purchases and transfers have their own flows (record_movement refuses
# them).
ManualMovementSource = Literal["LOCAL_SALE", "RESTOCK", "MANUAL_ADJUSTMENT", "DAMAGE", "EXPIRY", "OTHER"]
MovementDirection = Literal["in", "out"]
LocationKind = Literal["shop", "godown", "shelf", "other"]
PurchaseStatus = Literal["draft", "received", "cancelled"]
SyncStatus = Literal["applied", "skipped_duplicate", "failed"]


class Location(BaseModel):
    id: str
    dealer_id: str
    name: str
    kind: LocationKind
    address: str | None = None
    is_default: bool
    is_active: bool
    created_at: str
    updated_at: str


class LocationInput(BaseModel):
    name: str = Field(min_length=1)
    kind: LocationKind = "shop"
    address: str | None = None
    is_default: bool = False
    is_active: bool = True


class Supplier(BaseModel):
    id: str
    dealer_id: str
    name: str
    contact: str | None = None
    products_supplied: str | None = None
    notes: str | None = None
    is_active: bool
    created_at: str
    updated_at: str


class SupplierInput(BaseModel):
    name: str = Field(min_length=1)
    contact: str | None = None
    products_supplied: str | None = None
    notes: str | None = None
    is_active: bool = True


class Product(BaseModel):
    id: str
    dealer_id: str
    sku: str
    name: str
    category_id: str | None = None
    unit: str
    cost_price: float | None = None
    selling_price: float | None = None
    reorder_threshold: float
    is_active: bool
    created_at: str
    updated_at: str


class ProductInput(BaseModel):
    sku: str = Field(min_length=1)
    name: str = Field(min_length=1)
    category_id: str | None = None
    unit: str = "unit"
    cost_price: float | None = Field(default=None, ge=0)
    selling_price: float | None = Field(default=None, ge=0)
    reorder_threshold: float = Field(default=0, ge=0)
    is_active: bool = True


class StockLevel(BaseModel):
    product_id: str
    location_id: str
    dealer_id: str
    quantity: float
    updated_at: str


class Movement(BaseModel):
    id: str
    dealer_id: str
    product_id: str
    location_id: str
    direction: MovementDirection
    source: MovementSource
    quantity: float
    quantity_before: float
    quantity_after: float
    reason: str | None = None
    actor: str | None = None
    order_id: str | None = None
    order_item_id: str | None = None
    purchase_id: str | None = None
    transfer_id: str | None = None
    created_at: str


class MovementInput(BaseModel):
    product_id: str
    location_id: str
    direction: MovementDirection
    source: ManualMovementSource
    quantity: float = Field(gt=0)
    reason: str | None = None


class TransferInput(BaseModel):
    product_id: str
    from_location_id: str
    to_location_id: str
    quantity: float = Field(gt=0)
    reason: str | None = None


class PurchaseItem(BaseModel):
    id: str
    purchase_id: str
    dealer_id: str
    product_id: str
    location_id: str
    quantity: float
    unit_cost: float | None = None
    created_at: str


class PurchaseItemInput(BaseModel):
    product_id: str
    location_id: str
    quantity: float = Field(gt=0)
    unit_cost: float | None = Field(default=None, ge=0)


class Purchase(BaseModel):
    id: str
    dealer_id: str
    supplier_id: str | None = None
    reference: str | None = None
    status: PurchaseStatus
    purchased_on: str
    received_at: str | None = None
    notes: str | None = None
    created_at: str
    updated_at: str
    items: list[PurchaseItem] = []


class PurchaseInput(BaseModel):
    supplier_id: str | None = None
    reference: str | None = None
    purchased_on: str | None = None
    notes: str | None = None
    items: list[PurchaseItemInput] = []


class AlertSettings(BaseModel):
    dealer_id: str
    default_reorder_threshold: float
    notify_low_stock: bool
    notify_sync_failure: bool
    # None until the dealer first saves settings: the defaults are shown without writing a row on a read.
    updated_at: str | None = None


class AlertSettingsInput(BaseModel):
    default_reorder_threshold: float = Field(default=0, ge=0)
    notify_low_stock: bool = True
    notify_sync_failure: bool = True


class SyncLogEntry(BaseModel):
    id: str
    dealer_id: str
    order_event_id: str
    status: SyncStatus
    error: str | None = None
    attempts: int
    processed_at: str


class ReconciliationRow(BaseModel):
    """SRDS §25 per product: the ledger's totals by source, and whether they add up to the stock on hand."""

    product_id: str
    marketplace_sales: float
    local_sales: float
    adjustments: float
    restocks_and_purchases: float
    losses: float
    transfers: float
    other: float
    ledger_total: float
    current_stock: float
    balanced: bool


# ---- B2 additions -------------------------------------------------------------------------------------------------


class LocationUpdateInput(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    kind: LocationKind | None = None
    address: str | None = None
    is_default: bool | None = None
    is_active: bool | None = None


class SupplierUpdateInput(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    contact: str | None = None
    products_supplied: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class ProductUpdateInput(BaseModel):
    sku: str | None = Field(default=None, min_length=1)
    name: str | None = Field(default=None, min_length=1)
    category_id: str | None = None
    unit: str | None = Field(default=None, min_length=1)
    cost_price: float | None = Field(default=None, ge=0)
    selling_price: float | None = Field(default=None, ge=0)
    reorder_threshold: float | None = Field(default=None, ge=0)
    is_active: bool | None = None


class ListingSummary(BaseModel):
    id: str
    title: str


class ProductStock(BaseModel):
    location_id: str
    quantity: float


class ProductView(Product):
    """A product with where its stock is and the marketplace listings it feeds (D8)."""

    stock: list[ProductStock] = []
    total_quantity: float
    # The stock the marketplace sells from: the default location's (D8, apply_order_dispatch).
    default_location_quantity: float
    listings: list[ListingSummary] = []


class ListingLinkInput(BaseModel):
    listing_id: str


class StockInInput(BaseModel):
    """Stock In (SRDS §22-§23): new stock arriving by hand. Purchases from a supplier go through /purchases."""

    product_id: str
    location_id: str
    quantity: float = Field(gt=0)
    reason: str | None = None


StockOutSource = Literal["LOCAL_SALE", "DAMAGE", "EXPIRY", "OTHER"]


class StockOutInput(BaseModel):
    """Stock Out (SRDS §22-§23): a local sale, a loss, or own use (OTHER). A loss or own use needs a reason, as
    record_movement enforces; checked here too so the dealer gets a field error, not a database one."""

    product_id: str
    location_id: str
    source: StockOutSource
    quantity: float = Field(gt=0)
    reason: str | None = None

    @model_validator(mode="after")
    def _reason_when_required(self) -> Self:
        if self.source != "LOCAL_SALE" and not (self.reason and self.reason.strip()):
            raise ValueError(f"A {self.source} movement needs a reason")
        return self


class AdjustmentInput(BaseModel):
    """A manual correction (SRDS §23): always with a reason, so the ledger explains every change."""

    product_id: str
    location_id: str
    direction: MovementDirection
    quantity: float = Field(gt=0)
    reason: str = Field(min_length=1)


class PurchaseUpdateInput(BaseModel):
    """Edits a draft purchase. `items`, when sent, replaces every line."""

    supplier_id: str | None = None
    reference: str | None = None
    purchased_on: str | None = None
    notes: str | None = None
    items: list[PurchaseItemInput] | None = None


StockAlertStatus = Literal["low_stock", "out_of_stock"]


class StockAlert(BaseModel):
    product_id: str
    sku: str
    name: str
    unit: str
    location_id: str | None = None
    quantity: float
    reorder_threshold: float
    status: StockAlertStatus


class DashboardTotals(BaseModel):
    products: int
    stock_units: float
    low_stock: int
    out_of_stock: int
    # Stock on hand at cost price; a product with no cost price adds nothing.
    inventory_value: float


class TrendPoint(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    date: str
    in_: float = Field(alias="in")
    out: float


class Dashboard(BaseModel):
    """SRDS §18: the figures, the recent activity, the alerts and the stock trend."""

    totals: DashboardTotals
    recent_movements: list[Movement]
    recent_adjustments: list[Movement]
    recent_restocks: list[Movement]
    recent_purchases: list[Purchase]
    alerts: list[StockAlert]
    trend: list[TrendPoint]
    sync_failures: int


class RetryResult(BaseModel):
    applied: int


# ---- B5: reports, analytics, reconciliation, exports (SRDS §17, §18, §25) ----------------------------------------

ReportName = Literal[
    "stock-summary",
    "valuation",
    "movements-by-source",
    "low-out-of-stock",
    "supplier-purchases",
    "sales-split",
    "analytics",
    "reconciliation",
]


class ReportPeriod(BaseModel):
    """The inclusive UTC days a report covers, and when it was computed (its stock figures are as of that moment)."""

    model_config = ConfigDict(populate_by_name=True)

    from_: date = Field(alias="from")
    to: date
    generated_at: str


class StockSummaryRow(BaseModel):
    product_id: str
    sku: str
    name: str
    unit: str
    location_id: str
    location_name: str
    quantity: float
    # Units into and out of this location in the period, transfers included: they change what a location holds.
    period_in: float
    period_out: float


class StockSummaryReport(ReportPeriod):
    rows: list[StockSummaryRow]
    total_quantity: float


class ValuationRow(BaseModel):
    product_id: str
    sku: str
    name: str
    unit: str
    quantity: float
    cost_price: float | None = None
    # None when the product has no cost price: an unknown value is not a zero one.
    value: float | None = None
    period_in: float
    period_out: float


class ValuationReport(ReportPeriod):
    rows: list[ValuationRow]
    total_value: float
    # Products holding stock with no cost price, left out of total_value.
    products_without_cost: int


class SourceTotal(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source: MovementSource
    in_: float = Field(alias="in")
    out: float
    net: float
    movements: int


class MovementsBySourceReport(ReportPeriod):
    rows: list[SourceTotal]


class LowStockRow(StockAlert):
    period_out: float
    daily_out: float
    # Days the default location's stock lasts at the period's pace; None when nothing went out.
    days_of_cover: float | None = None


class LowOutOfStockReport(ReportPeriod):
    rows: list[LowStockRow]
    low_stock: int
    out_of_stock: int


class SupplierPurchaseRow(BaseModel):
    supplier_id: str | None = None
    supplier_name: str
    purchases: int
    quantity: float
    cost: float
    # Lines received without a unit cost, so left out of `cost`.
    lines_without_cost: int


class SupplierPurchasesReport(ReportPeriod):
    rows: list[SupplierPurchaseRow]
    total_purchases: int
    total_quantity: float
    total_cost: float


class SalesDay(BaseModel):
    date: str
    marketplace: float
    local: float


class SalesProduct(BaseModel):
    product_id: str
    sku: str
    name: str
    marketplace: float
    local: float
    total: float


class SalesSplitReport(ReportPeriod):
    """Marketplace orders (ZARAILINK_ORDER) against local sales (LOCAL_SALE), net of any returned units."""

    by_day: list[SalesDay]
    by_product: list[SalesProduct]
    marketplace_total: float
    local_total: float


class MoverRow(BaseModel):
    product_id: str
    sku: str
    name: str
    out_quantity: float
    daily_out: float


class BestSellerRow(BaseModel):
    product_id: str
    sku: str
    name: str
    quantity: float


class AnalyticsReport(ReportPeriod):
    trend: list[TrendPoint]
    fast_movers: list[MoverRow]
    slow_movers: list[MoverRow]
    best_sellers: list[BestSellerRow]


class ReconciliationReportRow(ReconciliationRow):
    sku: str
    name: str


class ReconciliationReport(BaseModel):
    """SRDS §25 over the whole ledger (it must add up to the stock on hand, so it has no period), unbalanced first."""

    generated_at: str
    unbalanced: int
    rows: list[ReconciliationReportRow]


class ExportInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    report: ReportName
    # Inclusive UTC days, last 30 days by default; reconciliation covers the whole ledger and ignores them.
    from_: date | None = Field(default=None, alias="from")
    to: date | None = None


class ExportResult(BaseModel):
    url: str
    expires_at: str
