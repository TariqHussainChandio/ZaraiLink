import type {
  AdjustmentInput,
  AlertSettings,
  AlertSettingsInput,
  AnalyticsReport,
  AppInventorySchemasLocation,
  AppInventorySchemasSupplier,
  AppInventorySchemasSupplierInput,
  AppInventorySchemasSupplierUpdateInput,
  Dashboard,
  ExportInput,
  ExportResult,
  LocationInput,
  LocationUpdateInput,
  LowOutOfStockReport,
  Movement,
  MovementsBySourceReport,
  ProductInput,
  ProductUpdateInput,
  ProductView,
  Purchase,
  PurchaseInput,
  PurchaseUpdateInput,
  ReconciliationReport,
  ReconciliationReportRow,
  SalesSplitReport,
  StockAlert,
  StockInInput,
  StockLevel,
  StockOutInput,
  StockSummaryReport,
  SupplierPurchasesReport,
  SyncLogEntry,
  TransferInput,
  ValuationReport,
} from '../../services/api/generated';

// The inventory system's own names for the generated API types (backend/app/inventory/schemas.py). The generator
// prefixes two of them with their Python module because the dealer module has classes of the same name.
export type InventoryLocation = AppInventorySchemasLocation;
export type InventorySupplier = AppInventorySchemasSupplier;
export type SupplierInput = AppInventorySchemasSupplierInput;
export type SupplierUpdateInput = AppInventorySchemasSupplierUpdateInput;

// Only what the module uses by these names; the report shapes are reached through `PeriodReports` below.
export type {
  AdjustmentInput,
  AlertSettings,
  AlertSettingsInput,
  AnalyticsReport,
  Dashboard,
  ExportInput,
  ExportResult,
  LocationInput,
  LocationUpdateInput,
  Movement,
  ProductInput,
  ProductUpdateInput,
  ProductView,
  Purchase,
  PurchaseInput,
  PurchaseUpdateInput,
  ReconciliationReport,
  ReconciliationReportRow,
  StockAlert,
  StockInInput,
  StockLevel,
  StockOutInput,
  SyncLogEntry,
  TransferInput,
};

/** Every report the API computes and exports (B5, SRDS §17, §18, §25); its name is also its path segment. */
export type ReportName = ExportInput['report'];

/** The reports that cover a period; reconciliation is all-time, since the ledger must add up to the stock on hand. */
export type PeriodReportName = Exclude<ReportName, 'reconciliation'>;

/** Each period report's response, by name (GET /inventory/reports/{name}). */
export interface PeriodReports {
  'stock-summary': StockSummaryReport;
  valuation: ValuationReport;
  'movements-by-source': MovementsBySourceReport;
  'low-out-of-stock': LowOutOfStockReport;
  'supplier-purchases': SupplierPurchasesReport;
  'sales-split': SalesSplitReport;
  analytics: AnalyticsReport;
}

/** The inclusive UTC days a report covers, as "YYYY-MM-DD" (the API's `from` and `to`). */
export interface ReportRange {
  from: string;
  to: string;
}

/** The SRDS §22 movement sources. */
export type MovementSource = Movement['source'];
export type LocationKind = InventoryLocation['kind'];
export type PurchaseStatus = Purchase['status'];

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  shop: 'Shop',
  godown: 'Godown',
  shelf: 'Shelf',
  other: 'Other',
};

export const MOVEMENT_SOURCES: readonly MovementSource[] = [
  'ZARAILINK_ORDER',
  'LOCAL_SALE',
  'PURCHASE',
  'RESTOCK',
  'MANUAL_ADJUSTMENT',
  'DAMAGE',
  'EXPIRY',
  'TRANSFER',
  'OTHER',
];

/** The movement history's filters; every one is optional and the server applies them (GET /inventory/movements). */
export interface MovementFilters {
  sources?: MovementSource[];
  productId?: string;
  locationId?: string;
  direction?: Movement['direction'];
  /** Inclusive UTC days, "YYYY-MM-DD" (the API's `from` and `to` are dates). */
  from?: string;
  to?: string;
}

/** The four stock operations, one form each (SRDS §22–§23). */
export type StockOperation = 'in' | 'out' | 'adjust' | 'transfer';

/** One of the dealer's own marketplace listings, offered when linking a product to it (D8). */
export interface ListingOption {
  id: string;
  title: string;
}
