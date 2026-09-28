import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adjustStock,
  createInventoryItem,
  deleteInventoryItem,
  fetchDealerListings,
  fetchInventory,
  fetchInventoryById,
  fetchInventoryTransactions,
  updateInventoryItem,
} from '../services/inventoryService';
import {
  createStore,
  deleteStore,
  fetchStoreById,
  fetchStores,
  updateStore,
} from '../services/storeService';
import {
  createSupplier,
  deleteSupplier,
  fetchSupplierById,
  fetchSuppliers,
  updateSupplier,
} from '../services/supplierService';
import type { InventoryTransactionType } from '../types/dealer';
import { queryKeys } from '../../hooks/keys';

type InventoryInput = Parameters<typeof createInventoryItem>[0];
type StoreInput = Parameters<typeof createStore>[0];
type SupplierInput = Parameters<typeof createSupplier>[0];

/** Every dealer read (inventory, stores, suppliers) and the dashboard figures derived from them refetch together. */
function useInvalidateDealer() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.dealer.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
    ]);
}

// ---- inventory

export function useInventory(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.dealer.inventory(), queryFn: fetchInventory, enabled });
}

/** The dealer's own listings, offered when linking a stock item to a listing. */
export function useDealerListingOptions(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.dealer.listingOptions(), queryFn: fetchDealerListings, enabled });
}

export function useInventoryItem(id: string) {
  return useQuery({ queryKey: queryKeys.dealer.inventoryItem(id), queryFn: () => fetchInventoryById(id) });
}

export function useInventoryTransactions(inventoryId: string) {
  return useQuery({
    queryKey: queryKeys.dealer.inventoryTransactions(inventoryId),
    queryFn: () => fetchInventoryTransactions(inventoryId),
  });
}

type SaveInventoryVariables =
  | { id?: undefined; input: InventoryInput }
  | { id: string; input: Partial<InventoryInput> };

/** Creates a stock item, or updates it when `id` is given (a new item sets its opening stock, an edit never does). */
export function useSaveInventoryItem() {
  const invalidate = useInvalidateDealer();
  return useMutation({
    mutationFn: (variables: SaveInventoryVariables) =>
      variables.id === undefined
        ? createInventoryItem(variables.input)
        : updateInventoryItem(variables.id, variables.input),
    onSuccess: invalidate,
  });
}

export function useDeleteInventoryItem() {
  const invalidate = useInvalidateDealer();
  return useMutation({ mutationFn: (id: string) => deleteInventoryItem(id), onSuccess: invalidate });
}

export function useAdjustStock(inventoryId: string) {
  const invalidate = useInvalidateDealer();
  return useMutation({
    mutationFn: ({ type, quantity, notes }: { type: InventoryTransactionType; quantity: number; notes: string | null }) =>
      adjustStock(inventoryId, type, quantity, notes),
    onSuccess: invalidate,
  });
}

// ---- stores

export function useStores(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.dealer.stores(), queryFn: fetchStores, enabled });
}

/** One store, for the edit form; `undefined` id means a new store is being created, so nothing is fetched. */
export function useStore(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dealer.store(id ?? ''),
    queryFn: () => fetchStoreById(id ?? ''),
    enabled: !!id,
  });
}

export function useSaveStore() {
  const invalidate = useInvalidateDealer();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: StoreInput }) =>
      id ? updateStore(id, input) : createStore(input),
    onSuccess: invalidate,
  });
}

export function useDeleteStore() {
  const invalidate = useInvalidateDealer();
  return useMutation({ mutationFn: (id: string) => deleteStore(id), onSuccess: invalidate });
}

// ---- suppliers

export function useSuppliers(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.dealer.suppliers(), queryFn: fetchSuppliers, enabled });
}

export function useSupplier(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dealer.supplier(id ?? ''),
    queryFn: () => fetchSupplierById(id ?? ''),
    enabled: !!id,
  });
}

export function useSaveSupplier() {
  const invalidate = useInvalidateDealer();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SupplierInput }) =>
      id ? updateSupplier(id, input) : createSupplier(input),
    onSuccess: invalidate,
  });
}

export function useDeleteSupplier() {
  const invalidate = useInvalidateDealer();
  return useMutation({ mutationFn: (id: string) => deleteSupplier(id), onSuccess: invalidate });
}
