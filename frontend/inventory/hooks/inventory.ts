// Inventory: React Query hooks for every inventory API read and write.
import { useQuery } from '@tanstack/react-query';
import {
  cancelPurchase,
  createExport,
  createLocation,
  createProduct,
  createPurchase,
  createSupplier,
  fetchAlerts,
  fetchAlertSettings,
  fetchDashboard,
  fetchListingOptions,
  fetchLocations,
  fetchMovements,
  fetchProduct,
  fetchProducts,
  fetchPurchase,
  fetchPurchases,
  fetchReconciliationReport,
  fetchReport,
  fetchStock,
  fetchSuppliers,
  fetchSyncLog,
  linkListing,
  postAdjustment,
  postStockIn,
  postStockOut,
  postTransfer,
  receivePurchase,
  removeLocation,
  removeProduct,
  removeSupplier,
  retrySync,
  saveAlertSettings,
  unlinkListing,
  updateLocation,
  updateProduct,
  updatePurchase,
  updateSupplier,
} from '../services/inventoryService';
import type {
  LocationInput,
  LocationUpdateInput,
  MovementFilters,
  PeriodReportName,
  ProductInput,
  ProductUpdateInput,
  AdjustmentInput,
  StockInInput,
  StockOutInput,
  TransferInput,
  PurchaseInput,
  PurchaseStatus,
  PurchaseUpdateInput,
  ReportRange,
  SupplierInput,
  SupplierUpdateInput,
} from '../types/inventory';
import { inventoryKeys } from './keys';
import { useInventoryMutation } from './mutation';

// Reads: each under the 'inventory' root, so the last copy is kept on the device and shown offline.

// Reads the inventory dashboard.
export function useInventoryDashboard() {
  return useQuery({ queryKey: inventoryKeys.dashboard(), queryFn: fetchDashboard });
}

// Reads the dealer's products.
export function useProducts() {
  return useQuery({ queryKey: inventoryKeys.products(), queryFn: () => fetchProducts(true) });
}

/** One product with its stock per location and its linked listings; `undefined` (a new product) fetches nothing. */
export function useProduct(productId: string | undefined) {
  return useQuery({
    queryKey: inventoryKeys.product(productId ?? ''),
    queryFn: () => fetchProduct(productId ?? ''),
    enabled: !!productId,
  });
}

// Reads the dealer's own listings for the link picker, when enabled.
export function useListingOptions(enabled: boolean) {
  return useQuery({ queryKey: inventoryKeys.listingOptions(), queryFn: fetchListingOptions, enabled });
}

// Reads the stock at one location.
export function useStock(locationId: string | null) {
  return useQuery({
    queryKey: inventoryKeys.stock(locationId),
    queryFn: () => fetchStock({ locationId: locationId ?? undefined }),
    enabled: !!locationId,
  });
}

// Reads the dealer's locations.
export function useLocations() {
  return useQuery({ queryKey: inventoryKeys.locations(), queryFn: fetchLocations });
}

// Reads the movement history with the given filters.
export function useMovements(filters: MovementFilters, enabled = true) {
  return useQuery({ queryKey: inventoryKeys.movements(filters), queryFn: () => fetchMovements(filters), enabled });
}

// Reads the dealer's suppliers.
export function useSuppliers() {
  return useQuery({ queryKey: inventoryKeys.suppliers(), queryFn: fetchSuppliers });
}

// Reads the dealer's purchases, optionally by status.
export function usePurchases(status: PurchaseStatus | null) {
  return useQuery({ queryKey: inventoryKeys.purchases(status), queryFn: () => fetchPurchases(status ?? undefined) });
}

/** One purchase; `undefined` (a new purchase) fetches nothing. */
export function usePurchase(purchaseId: string | undefined) {
  return useQuery({
    queryKey: inventoryKeys.purchase(purchaseId ?? ''),
    queryFn: () => fetchPurchase(purchaseId ?? ''),
    enabled: !!purchaseId,
  });
}

/** `enabled`: false outside the inventory system for anyone but an approved dealer (the dealer's bell, D20), since the
 * inventory API refuses everyone else (BR-03/04). */
export function useStockAlerts(enabled = true) {
  return useQuery({ queryKey: inventoryKeys.alerts(), queryFn: fetchAlerts, enabled });
}

// Reads the dealer's alert settings.
export function useAlertSettings() {
  return useQuery({ queryKey: inventoryKeys.alertSettings(), queryFn: fetchAlertSettings });
}

/** A period report. While another range of the same report loads, its last figures stay on screen so the chart does
 * not blank; another report's figures are never carried over, since their shape differs. */
export function useReport<R extends PeriodReportName>(report: R, range: ReportRange) {
  return useQuery({
    queryKey: inventoryKeys.report(report, range),
    queryFn: () => fetchReport(report, range),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === report ? previous : undefined),
  });
}

// Reads the reconciliation report.
export function useReconciliationReport() {
  return useQuery({ queryKey: inventoryKeys.reconciliation(), queryFn: fetchReconciliationReport });
}

// Reads the marketplace sync log.
export function useSyncLog() {
  return useQuery({ queryKey: inventoryKeys.syncLog(), queryFn: fetchSyncLog });
}

// Writes: each fails at once when offline and refreshes every inventory read on success (hooks/mutation.ts).

type SaveProductVariables = { id?: undefined; input: ProductInput } | { id: string; input: ProductUpdateInput };

// Creates a product, or updates one when an id is given.
export function useSaveProduct() {
  return useInventoryMutation((variables: SaveProductVariables) =>
    variables.id === undefined ? createProduct(variables.input) : updateProduct(variables.id, variables.input),
  );
}

// Removes a product.
export function useRemoveProduct() {
  return useInventoryMutation(removeProduct);
}

// Links a marketplace listing to this product.
export function useLinkListing(productId: string) {
  return useInventoryMutation((listingId: string) => linkListing(productId, listingId));
}

// Unlinks a marketplace listing from this product.
export function useUnlinkListing(productId: string) {
  return useInventoryMutation((listingId: string) => unlinkListing(productId, listingId));
}

/** A stock write with its form entry's Idempotency-Key (hooks/entryKey.ts). */
interface Keyed<T> {
  input: T;
  key: string;
}

// Records a Stock In.
export function useStockIn() {
  return useInventoryMutation(({ input, key }: Keyed<StockInInput>) => postStockIn(input, key));
}

// Records a Stock Out.
export function useStockOut() {
  return useInventoryMutation(({ input, key }: Keyed<StockOutInput>) => postStockOut(input, key));
}

// Records a manual adjustment.
export function useAdjustment() {
  return useInventoryMutation(({ input, key }: Keyed<AdjustmentInput>) => postAdjustment(input, key));
}

// Moves stock between two locations.
export function useTransfer() {
  return useInventoryMutation(({ input, key }: Keyed<TransferInput>) => postTransfer(input, key));
}

type SaveLocationVariables = { id?: undefined; input: LocationInput } | { id: string; input: LocationUpdateInput };

// Creates a location, or updates one when an id is given.
export function useSaveLocation() {
  return useInventoryMutation((variables: SaveLocationVariables) =>
    variables.id === undefined ? createLocation(variables.input) : updateLocation(variables.id, variables.input),
  );
}

// Removes (or deactivates) a location.
export function useRemoveLocation() {
  return useInventoryMutation(removeLocation);
}

type SaveSupplierVariables = { id?: undefined; input: SupplierInput } | { id: string; input: SupplierUpdateInput };

// Creates a supplier, or updates one when an id is given.
export function useSaveSupplier() {
  return useInventoryMutation((variables: SaveSupplierVariables) =>
    variables.id === undefined ? createSupplier(variables.input) : updateSupplier(variables.id, variables.input),
  );
}

// Removes a supplier.
export function useRemoveSupplier() {
  return useInventoryMutation(removeSupplier);
}

type SavePurchaseVariables =
  | { id?: undefined; input: PurchaseInput; key: string }
  | { id: string; input: PurchaseUpdateInput };

/** A new draft (sent with its entry's key), or an edit of a draft (refused once it is received or cancelled). */
export function useSavePurchase() {
  return useInventoryMutation((variables: SavePurchaseVariables) =>
    variables.id === undefined
      ? createPurchase(variables.input, variables.key)
      : updatePurchase(variables.id, variables.input),
  );
}

// Receives a purchase, adding its lines to stock.
export function useReceivePurchase() {
  return useInventoryMutation(receivePurchase);
}

// Cancels a draft purchase.
export function useCancelPurchase() {
  return useInventoryMutation(cancelPurchase);
}

// Saves the dealer's alert settings.
export function useSaveAlertSettings() {
  return useInventoryMutation(saveAlertSettings);
}

// Retries the failed marketplace sync entries.
export function useRetrySync() {
  return useInventoryMutation((_: void) => retrySync());
}

/** An export writes a file, not stock: it refuses offline like every write (no queue) but refreshes nothing. */
export function useCreateExport() {
  return useInventoryMutation(createExport, { invalidate: false });
}
