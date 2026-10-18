"""Pydantic models for the dealer Inventory Management System (B1, docs/plan-inventory.md §2; B2 routes).

They mirror supabase/migrations/20261021080000_inventory_data_model.sql and 20261022090000_inventory_sync.sql.
"""

import re
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, model_validator

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


# What numeric(12, 2) holds, the bound the database checks on every stock quantity and every figure a dealer types
# (20261021080000_inventory_data_model.sql).
NUMERIC_LIMIT = 10_000_000_000


def _two_decimals_at_most(value: float) -> float:
    """B1 refuses a finer figure rather than round it into the ledger; the API refuses it the same way, as a field
    error, instead of rounding 1.255 to 1.25 before the database ever sees it."""
    # repr is the shortest text that reads back as the same float, so 1.255 is read as 1.255, not as its binary value.
    # The exponent is a letter only for NaN and infinity, which allow_inf_nan has already refused.
    exponent = Decimal(repr(value)).as_tuple().exponent
    if isinstance(exponent, int) and exponent < -2:
        raise ValueError("Use at most two decimals")
    return value


# A quantity of stock: finite (JSON NaN and Infinity are refused, not passed on), more than zero, two decimals.
Quantity = Annotated[float, Field(gt=0, lt=NUMERIC_LIMIT, allow_inf_nan=False), AfterValidator(_two_decimals_at_most)]

# The days a report, an export or the ledger filter may name. The ledger starts in 2026, so a year outside this range
# is a typing slip; the far end also keeps `to` + 1 day, the exclusive bound of every period read, a real date
# (9999-12-31 would overflow into a 500).
FIRST_DAY = date(2000, 1, 1)
LAST_DAY = date(2099, 12, 31)
_ISO_DAY = re.compile(r"\d{4}-\d{2}-\d{2}")


def _calendar_day(value: object) -> object:
    """A period is whole days written YYYY-MM-DD. Pydantic also reads a timestamp at midnight ('2026-10-01T00:00:00',
    or 1790812800 seconds) as that day; a client sending one has mixed up its units, so it is refused, not guessed."""
    if isinstance(value, str) and _ISO_DAY.fullmatch(value):
        return value
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    raise ValueError("Use a date written YYYY-MM-DD")


def _within_range(value: date) -> date:
    if not FIRST_DAY <= value <= LAST_DAY:
        raise ValueError(f"Use a date from {FIRST_DAY.isoformat()} to {LAST_DAY.isoformat()}")
    return value


Day = Annotated[date, BeforeValidator(_calendar_day), AfterValidator(_within_range)]
# A price, cost or threshold: the same, but zero is allowed.
Amount = Annotated[float, Field(ge=0, lt=NUMERIC_LIMIT, allow_inf_nan=False), AfterValidator(_two_decimals_at_most)]

# Length caps on every free-text input (B2 verification F8: a 1 MB product name was accepted). The app's forms set no
# limit of their own, so these follow the dealer application's caps (dealer/schemas.py: a business name is 120, an
# address 300): a name or code fits a label, a reference fits an invoice number, a note or reason fits a paragraph.
NAME_MAX = 120
UNIT_MAX = 40
REFERENCE_MAX = 80
CONTACT_MAX = 120
ADDRESS_MAX = 300
TEXT_MAX = 1000

# A name or SKU: something there, and short enough for a label.
Name = Annotated[str, Field(min_length=1, max_length=NAME_MAX)]
Unit = Annotated[str, Field(min_length=1, max_length=UNIT_MAX)]
Address = Annotated[str, Field(max_length=ADDRESS_MAX)]
Contact = Annotated[str, Field(max_length=CONTACT_MAX)]
Reference = Annotated[str, Field(max_length=REFERENCE_MAX)]
Note = Annotated[str, Field(max_length=TEXT_MAX)]
# A reason the ledger shows: at least one character that is not a space (record_movement trims it).
Reason = Annotated[str, Field(min_length=1, max_length=TEXT_MAX, pattern=r"\S")]

# The days a purchase may be dated (B2 verification F6). A plain string let Postgres read "infinity", "epoch" and
# "0001-01-01" as dates. The IMS starts in 2026, so nothing it records predates 2000; a year ahead covers a purchase
# entered before the goods are due.
EARLIEST_PURCHASE = date(2000, 1, 1)
PURCHASE_LEAD = timedelta(days=365)


def _plausible_purchase_day(value: date) -> date:
    latest = datetime.now(UTC).date() + PURCHASE_LEAD
    if not EARLIEST_PURCHASE <= value <= latest:
        raise ValueError(f"A purchase date must be between {EARLIEST_PURCHASE.isoformat()} and {latest.isoformat()}")
    return value


PurchaseDay = Annotated[date, AfterValidator(_plausible_purchase_day)]

# The most lines one purchase takes, the bound create_purchase and replace_purchase_items hold too (B2
# re-verification N3): far beyond a real delivery note, and a bounded payload.
PURCHASE_LINES_MAX = 200


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
    name: Name
    kind: LocationKind = "shop"
    address: Address | None = None
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
    name: Name
    contact: Contact | None = None
    products_supplied: Note | None = None
    notes: Note | None = None
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
    sku: Name
    name: Name
    category_id: str | None = None
    unit: Unit = "unit"
    cost_price: Amount | None = None
    selling_price: Amount | None = None
    reorder_threshold: Amount = 0
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
    quantity: Quantity
    reason: Note | None = None


class TransferInput(BaseModel):
    product_id: str
    from_location_id: str
    to_location_id: str
    quantity: Quantity
    reason: Note | None = None


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
    quantity: Quantity
    unit_cost: Amount | None = None


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
    reference: Reference | None = None
    purchased_on: PurchaseDay | None = None
    notes: Note | None = None
    items: Annotated[list[PurchaseItemInput], Field(max_length=PURCHASE_LINES_MAX)] = []


class AlertSettings(BaseModel):
    dealer_id: str
    default_reorder_threshold: float
    notify_low_stock: bool
    notify_sync_failure: bool
    # None until the dealer first saves settings: the defaults are shown without writing a row on a read.
    updated_at: str | None = None


class AlertSettingsInput(BaseModel):
    default_reorder_threshold: Amount = 0
    notify_low_stock: bool = True
    notify_sync_failure: bool = True


class SyncLogEntry(BaseModel):
    id: str
    dealer_id: str
    order_event_id: str
    # Which order, line and listing the event is about, so the dealer can fix the cause before retrying (null on a
    # row whose order or listing has since been deleted).
    order_id: str | None = None
    order_item_id: str | None = None
    listing_id: str | None = None
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
    name: Name | None = None
    kind: LocationKind | None = None
    address: Address | None = None
    is_default: bool | None = None
    is_active: bool | None = None


class SupplierUpdateInput(BaseModel):
    name: Name | None = None
    contact: Contact | None = None
    products_supplied: Note | None = None
    notes: Note | None = None
    is_active: bool | None = None


class ProductUpdateInput(BaseModel):
    sku: Name | None = None
    name: Name | None = None
    category_id: str | None = None
    unit: Unit | None = None
    cost_price: Amount | None = None
    selling_price: Amount | None = None
    reorder_threshold: Amount | None = None
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
    quantity: Quantity
    reason: Note | None = None


StockOutSource = Literal["LOCAL_SALE", "DAMAGE", "EXPIRY", "OTHER"]


class StockOutInput(BaseModel):
    """Stock Out (SRDS §22-§23): a local sale, a loss, or own use (OTHER). A loss or own use needs a reason, as
    record_movement enforces; checked here too so the dealer gets a field error, not a database one."""

    product_id: str
    location_id: str
    source: StockOutSource
    quantity: Quantity
    reason: Note | None = None

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
    quantity: Quantity
    reason: Reason


class PurchaseUpdateInput(BaseModel):
    """Edits a draft purchase. `items`, when sent, replaces every line."""

    supplier_id: str | None = None
    reference: Reference | None = None
    purchased_on: PurchaseDay | None = None
    notes: Note | None = None
    items: Annotated[list[PurchaseItemInput], Field(max_length=PURCHASE_LINES_MAX)] | None = None


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
    from_: Day | None = Field(default=None, alias="from")
    to: Day | None = None


class ExportResult(BaseModel):
    url: str
    expires_at: str
