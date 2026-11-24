// Inventory: API calls of the dealer inventory system (/api/v1/inventory).
import { apiFetch } from '../../services/api/client';
import type { RetryResult } from '../../services/api/generated';
import type {
  AdjustmentInput,
  AlertSettings,
  AlertSettingsInput,
  Dashboard,
  ExportInput,
  ExportResult,
  InventoryLocation,
  InventorySupplier,
  ListingOption,
  LocationInput,
  LocationUpdateInput,
  Movement,
  MovementFilters,
  PeriodReportName,
  PeriodReports,
  ProductInput,
  ProductUpdateInput,
  ProductView,
  Purchase,
  PurchaseInput,
  PurchaseStatus,
  PurchaseUpdateInput,
  ReconciliationReport,
  ReportRange,
  StockAlert,
  StockInInput,
  StockLevel,
  StockOutInput,
  SupplierInput,
  SupplierUpdateInput,
  SyncLogEntry,
  TransferInput,
} from '../types/inventory';

// Every call of the dealer Inventory Management System (backend/app/inventory, /api/v1/inventory). Approved dealers
// only (BR-03/04): the backend refuses anyone else and row-level security keeps each dealer to their own rows. Lists
// return the first page (the API's cap of 100 rows).

// Base path of the inventory API.
const BASE = '/api/v1/inventory';

/**
 * A stock write that must happen once (B2 verification F8): the API takes an optional `Idempotency-Key` on Stock In,
 * Stock Out, Adjustment, Transfer and purchase create; a replayed key returns the first answer without writing, and the
 * same key with a different body is refused (`idempotency_key_reused`). The key belongs to the open form entry
 * (hooks/entryKey.ts), not to its fields: a dealer whose response was lost and who then edits the note before pressing
 * Save again still sends the first key, so the stock is never recorded twice (B4 verification F2).
 */
function postOnce<T>(path: string, body: object, key: string): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body, idempotencyKey: key });
}

// ---- dashboard

// GET the dashboard.
export function fetchDashboard(): Promise<Dashboard> {
  return apiFetch(`${BASE}/dashboard`);
}

// ---- products

// GET the products (inactive ones too when asked).
export function fetchProducts(includeInactive = false): Promise<ProductView[]> {
  return apiFetch(`${BASE}/products`, { query: { include_inactive: includeInactive || undefined } });
}

// GET one product.
export function fetchProduct(productId: string): Promise<ProductView> {
  return apiFetch(`${BASE}/products/${encodeURIComponent(productId)}`);
}

// POST a new product.
export function createProduct(input: ProductInput): Promise<ProductView> {
  return apiFetch(`${BASE}/products`, { method: 'POST', body: input });
}

// PATCH a product.
export function updateProduct(productId: string, input: ProductUpdateInput): Promise<ProductView> {
  return apiFetch(`${BASE}/products/${encodeURIComponent(productId)}`, { method: 'PATCH', body: input });
}

// DELETE a product.
export function removeProduct(productId: string): Promise<void> {
  return apiFetch(`${BASE}/products/${encodeURIComponent(productId)}`, { method: 'DELETE' });
}

/** Links a product to one of the dealer's marketplace listings: a dispatch of that listing then takes this stock (D8). */
export function linkListing(productId: string, listingId: string): Promise<ProductView> {
  return apiFetch(`${BASE}/products/${encodeURIComponent(productId)}/listings`, {
    method: 'POST',
    body: { listing_id: listingId },
  });
}

// DELETE the link between a product and a listing.
export function unlinkListing(productId: string, listingId: string): Promise<void> {
  return apiFetch(
    `${BASE}/products/${encodeURIComponent(productId)}/listings/${encodeURIComponent(listingId)}`,
    { method: 'DELETE' },
  );
}

/** The dealer's own marketplace listings, the choices for a product link. */
export function fetchListingOptions(): Promise<ListingOption[]> {
  return apiFetch('/api/v1/dealer/inventory/listings');
}

// ---- stock and locations

// GET stock levels, optionally by location or product.
export function fetchStock(filters: { locationId?: string; productId?: string }): Promise<StockLevel[]> {
  return apiFetch(`${BASE}/stock`, { query: { location_id: filters.locationId, product_id: filters.productId } });
}

// POST a transfer between locations, with its Idempotency-Key.
export function postTransfer(input: TransferInput, key: string): Promise<Movement[]> {
  return postOnce(`${BASE}/stock/transfer`, input, key);
}

// GET the locations.
export function fetchLocations(): Promise<InventoryLocation[]> {
  return apiFetch(`${BASE}/locations`);
}

// POST a new location.
export function createLocation(input: LocationInput): Promise<InventoryLocation> {
  return apiFetch(`${BASE}/locations`, { method: 'POST', body: input });
}

// PATCH a location.
export function updateLocation(locationId: string, input: LocationUpdateInput): Promise<InventoryLocation> {
  return apiFetch(`${BASE}/locations/${encodeURIComponent(locationId)}`, { method: 'PATCH', body: input });
}

/** A location with stock or history is deactivated rather than deleted; the default one is refused. */
export function removeLocation(locationId: string): Promise<void> {
  return apiFetch(`${BASE}/locations/${encodeURIComponent(locationId)}`, { method: 'DELETE' });
}

// ---- movements (the ledger)

// GET the movement history with the given filters.
export function fetchMovements(filters: MovementFilters = {}): Promise<Movement[]> {
  // `source` repeats once per value (FastAPI list query); apiFetch's query sets one value per name, so the repeated
  // part goes on the path and the rest through `query`.
  const sources = (filters.sources ?? []).map(source => `source=${encodeURIComponent(source)}`).join('&');
  return apiFetch(`${BASE}/movements${sources ? `?${sources}` : ''}`, {
    query: {
      product_id: filters.productId,
      location_id: filters.locationId,
      direction: filters.direction,
      from: filters.from,
      to: filters.to,
    },
  });
}

// POST a Stock In, with its Idempotency-Key.
export function postStockIn(input: StockInInput, key: string): Promise<Movement> {
  return postOnce(`${BASE}/movements/stock-in`, input, key);
}

// POST a Stock Out, with its Idempotency-Key.
export function postStockOut(input: StockOutInput, key: string): Promise<Movement> {
  return postOnce(`${BASE}/movements/stock-out`, input, key);
}

// POST an adjustment, with its Idempotency-Key.
export function postAdjustment(input: AdjustmentInput, key: string): Promise<Movement> {
  return postOnce(`${BASE}/movements/adjustment`, input, key);
}

// ---- suppliers and purchases

// GET the suppliers.
export function fetchSuppliers(): Promise<InventorySupplier[]> {
  return apiFetch(`${BASE}/suppliers`, { query: { include_inactive: true } });
}

// POST a new supplier.
export function createSupplier(input: SupplierInput): Promise<InventorySupplier> {
  return apiFetch(`${BASE}/suppliers`, { method: 'POST', body: input });
}

// PATCH a supplier.
export function updateSupplier(supplierId: string, input: SupplierUpdateInput): Promise<InventorySupplier> {
  return apiFetch(`${BASE}/suppliers/${encodeURIComponent(supplierId)}`, { method: 'PATCH', body: input });
}

// DELETE a supplier.
export function removeSupplier(supplierId: string): Promise<void> {
  return apiFetch(`${BASE}/suppliers/${encodeURIComponent(supplierId)}`, { method: 'DELETE' });
}

// GET the purchases, optionally by status.
export function fetchPurchases(status?: PurchaseStatus): Promise<Purchase[]> {
  return apiFetch(`${BASE}/purchases`, { query: { status } });
}

// GET one purchase.
export function fetchPurchase(purchaseId: string): Promise<Purchase> {
  return apiFetch(`${BASE}/purchases/${encodeURIComponent(purchaseId)}`);
}

// POST a new draft purchase, with its Idempotency-Key.
export function createPurchase(input: PurchaseInput, key: string): Promise<Purchase> {
  return postOnce(`${BASE}/purchases`, input, key);
}

/** Edits a draft; `items`, when sent, replaces every line. A received or cancelled purchase is refused (409). */
export function updatePurchase(purchaseId: string, input: PurchaseUpdateInput): Promise<Purchase> {
  return apiFetch(`${BASE}/purchases/${encodeURIComponent(purchaseId)}`, { method: 'PATCH', body: input });
}

/** Receiving adds every line to stock as a PURCHASE movement, in one transaction (receive_purchase). */
export function receivePurchase(purchaseId: string): Promise<Purchase> {
  return apiFetch(`${BASE}/purchases/${encodeURIComponent(purchaseId)}/receive`, { method: 'POST' });
}

// POST to cancel a draft purchase.
export function cancelPurchase(purchaseId: string): Promise<Purchase> {
  return apiFetch(`${BASE}/purchases/${encodeURIComponent(purchaseId)}/cancel`, { method: 'POST' });
}

// ---- alerts and sync

// GET the stock alerts.
export function fetchAlerts(): Promise<StockAlert[]> {
  return apiFetch(`${BASE}/alerts`);
}

// GET the alert settings.
export function fetchAlertSettings(): Promise<AlertSettings> {
  return apiFetch(`${BASE}/alerts/settings`);
}

// PUT the alert settings.
export function saveAlertSettings(input: AlertSettingsInput): Promise<AlertSettings> {
  return apiFetch(`${BASE}/alerts/settings`, { method: 'PUT', body: input });
}

/** What happened each time a marketplace dispatch reached the dealer's inventory (B3), newest first. */
export function fetchSyncLog(): Promise<SyncLogEntry[]> {
  return apiFetch(`${BASE}/sync/log`);
}

/** Re-runs the dealer's failed sync entries; the backend reports how many were applied this time. */
export function retrySync(): Promise<RetryResult> {
  return apiFetch(`${BASE}/sync/retry`, { method: 'POST' });
}

// ---- reports and exports (B5)

/** One period report over inclusive UTC days (the API allows at most 366). */
export function fetchReport<R extends PeriodReportName>(report: R, range: ReportRange): Promise<PeriodReports[R]> {
  return apiFetch(`${BASE}/reports/${report}`, { query: { from: range.from, to: range.to } });
}

/** SRDS §25 over the whole ledger, each product named, the ones that do not add up first. */
export function fetchReconciliationReport(): Promise<ReconciliationReport> {
  return apiFetch(`${BASE}/reports/reconciliation`);
}

/** Writes the report as a CSV to the dealer's private exports folder and returns a short-lived signed link to it. */
export function createExport(input: ExportInput): Promise<ExportResult> {
  return apiFetch(`${BASE}/exports`, { method: 'POST', body: input });
}
