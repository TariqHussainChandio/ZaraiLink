import type { GeoLocation } from '../../common/types/referenceData';

export type DealerEntityStatus = 'active' | 'inactive';

export interface DealerStore {
  id: string;
  dealer_id: string;
  name: string;
  address: string | null;
  location: GeoLocation | null;
  contact: string | null;
  opening_info: string | null;
  status: DealerEntityStatus;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  dealer_id: string;
  name: string;
  contact: string | null;
  products_supplied: string | null;
  notes: string | null;
  status: DealerEntityStatus;
  created_at: string;
  updated_at: string;
}

export type InventoryTransactionType =
  | 'addition'
  | 'reduction'
  | 'adjustment'
  | 'sale'
  | 'restock'
  | 'correction';

export interface InventoryItem {
  id: string;
  dealer_id: string;
  listing_id: string | null;
  stock_quantity: number;
  unit: string;
  purchase_cost: number | null;
  selling_price: number | null;
  min_stock_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryItemWithListing extends InventoryItem {
  listing: { id: string; title: string } | null;
}

export interface InventoryTransaction {
  id: string;
  inventory_id: string;
  type: InventoryTransactionType;
  quantity: number;
  actor: string | null;
  notes: string | null;
  created_at: string;
}
