import { apiFetch } from '../../api/client';
import type { InventoryItem, InventoryItemWithListing, InventoryTransaction, InventoryTransactionType } from '../../../types/dealer';

// No dealerId param — always the caller's own inventory.
export async function fetchInventory(): Promise<InventoryItemWithListing[]> {
  return apiFetch('/api/v1/dealer/inventory');
}

export async function fetchInventoryById(id: string): Promise<InventoryItemWithListing> {
  return apiFetch(`/api/v1/dealer/inventory/${id}`);
}

/** Listings the dealer can link a stock item to (their own products only). */
export async function fetchDealerListings(): Promise<{ id: string; title: string }[]> {
  return apiFetch('/api/v1/dealer/inventory/listings');
}

export interface InventoryInput {
  listingId: string | null;
  stockQuantity: number;
  unit: string;
  purchaseCost: number | null;
  sellingPrice: number | null;
  minStockThreshold: number;
}

function toApiInventory(input: Partial<InventoryInput>) {
  return {
    ...(input.listingId !== undefined && { listing_id: input.listingId }),
    ...(input.stockQuantity !== undefined && { stock_quantity: input.stockQuantity }),
    ...(input.unit !== undefined && { unit: input.unit }),
    ...(input.purchaseCost !== undefined && { purchase_cost: input.purchaseCost }),
    ...(input.sellingPrice !== undefined && { selling_price: input.sellingPrice }),
    ...(input.minStockThreshold !== undefined && { min_stock_threshold: input.minStockThreshold }),
  };
}

export async function createInventoryItem(input: InventoryInput): Promise<InventoryItem> {
  return apiFetch('/api/v1/dealer/inventory', { method: 'POST', body: toApiInventory(input) });
}

export async function updateInventoryItem(id: string, input: Partial<InventoryInput>): Promise<InventoryItem> {
  return apiFetch(`/api/v1/dealer/inventory/${id}`, { method: 'PATCH', body: toApiInventory(input) });
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await apiFetch(`/api/v1/dealer/inventory/${id}`, { method: 'DELETE' });
}

export async function fetchInventoryTransactions(inventoryId: string): Promise<InventoryTransaction[]> {
  return apiFetch(`/api/v1/dealer/inventory/${inventoryId}/transactions`);
}

/**
 * Records a stock movement and updates `inventory.stock_quantity` to match — the delta/absolute
 * math now lives in `backend/app/services/dealer_service.py` (moved verbatim). No `actorId`
 * param — the backend derives the acting dealer from the verified session token.
 */
export async function adjustStock(
  inventoryId: string,
  type: InventoryTransactionType,
  quantity: number,
  notes: string | null,
): Promise<InventoryItem> {
  return apiFetch(`/api/v1/dealer/inventory/${inventoryId}/adjust`, {
    method: 'POST',
    body: { type, quantity, notes },
  });
}
