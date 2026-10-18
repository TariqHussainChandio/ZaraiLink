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

export function useInventoryDashboard() {
  return useQuery({ queryKey: inventoryKeys.dashboard(), queryFn: fetchDashboard });
}

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

export function useListingOptions(enabled: boolean) {
  return useQuery({ queryKey: inventoryKeys.listingOptions(), queryFn: fetchListingOptions, enabled });
}

export function useStock(locationId: string | null) {
  return useQuery({
    queryKey: inventoryKeys.stock(locationId),
    queryFn: () => fetchStock({ locationId: locationId ?? undefined }),
    enabled: !!locationId,
  });
}

export function useLocations() {
  return useQuery({ queryKey: inventoryKeys.locations(), queryFn: fetchLocations });
}

export function useMovements(filters: MovementFilters, enabled = true) {
  return useQuery({ queryKey: inventoryKeys.movements(filters), queryFn: () => fetchMovements(filters), enabled });
}

export function useSuppliers() {
  return useQuery({ queryKey: inventoryKeys.suppliers(), queryFn: fetchSuppliers });
}

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

export function useStockAlerts() {
  return useQuery({ queryKey: inventoryKeys.alerts(), queryFn: fetchAlerts });
}

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

export function useReconciliationReport() {
  return useQuery({ queryKey: inventoryKeys.reconciliation(), queryFn: fetchReconciliationReport });
}

export function useSyncLog() {
  return useQuery({ queryKey: inventoryKeys.syncLog(), queryFn: fetchSyncLog });
}

// Writes: each fails at once when offline and refreshes every inventory read on success (hooks/mutation.ts).

type SaveProductVariables = { id?: undefined; input: ProductInput } | { id: string; input: ProductUpdateInput };

export function useSaveProduct() {
  return useInventoryMutation((variables: SaveProductVariables) =>
    variables.id === undefined ? createProduct(variables.input) : updateProduct(variables.id, variables.input),
  );
}

export function useRemoveProduct() {
  return useInventoryMutation(removeProduct);
}

export function useLinkListing(productId: string) {
  return useInventoryMutation((listingId: string) => linkListing(productId, listingId));
}

export function useUnlinkListing(productId: string) {
  return useInventoryMutation((listingId: string) => unlinkListing(productId, listingId));
}

/** A stock write with its form entry's Idempotency-Key (hooks/entryKey.ts). */
interface Keyed<T> {
  input: T;
  key: string;
}

export function useStockIn() {
  return useInventoryMutation(({ input, key }: Keyed<StockInInput>) => postStockIn(input, key));
}

export function useStockOut() {
  return useInventoryMutation(({ input, key }: Keyed<StockOutInput>) => postStockOut(input, key));
}

export function useAdjustment() {
  return useInventoryMutation(({ input, key }: Keyed<AdjustmentInput>) => postAdjustment(input, key));
}

export function useTransfer() {
  return useInventoryMutation(({ input, key }: Keyed<TransferInput>) => postTransfer(input, key));
}

type SaveLocationVariables = { id?: undefined; input: LocationInput } | { id: string; input: LocationUpdateInput };

export function useSaveLocation() {
  return useInventoryMutation((variables: SaveLocationVariables) =>
    variables.id === undefined ? createLocation(variables.input) : updateLocation(variables.id, variables.input),
  );
}

export function useRemoveLocation() {
  return useInventoryMutation(removeLocation);
}

type SaveSupplierVariables = { id?: undefined; input: SupplierInput } | { id: string; input: SupplierUpdateInput };

export function useSaveSupplier() {
  return useInventoryMutation((variables: SaveSupplierVariables) =>
    variables.id === undefined ? createSupplier(variables.input) : updateSupplier(variables.id, variables.input),
  );
}

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

export function useReceivePurchase() {
  return useInventoryMutation(receivePurchase);
}

export function useCancelPurchase() {
  return useInventoryMutation(cancelPurchase);
}

export function useSaveAlertSettings() {
  return useInventoryMutation(saveAlertSettings);
}

export function useRetrySync() {
  return useInventoryMutation((_: void) => retrySync());
}

/** An export writes a file, not stock: it refuses offline like every write (no queue) but refreshes nothing. */
export function useCreateExport() {
  return useInventoryMutation(createExport, { invalidate: false });
}
