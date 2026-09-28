import { apiFetch } from '../../services/api/client';
import {
  adjustStock,
  createInventoryItem,
  deleteInventoryItem,
  fetchDealerListings,
  fetchInventory,
  fetchInventoryById,
  fetchInventoryTransactions,
  updateInventoryItem,
} from './inventoryService';

jest.mock('../../services/api/client');

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reads', () => {
  it('fetchInventory fetches the caller-scoped list', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchInventory();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/inventory');
  });

  it('fetchInventoryById fetches a single item', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchInventoryById('item-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/inventory/item-1');
  });

  it('fetchDealerListings fetches linkable listings', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchDealerListings();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/inventory/listings');
  });

  it('fetchInventoryTransactions fetches the movement history', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchInventoryTransactions('item-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/inventory/item-1/transactions');
  });
});

describe('createInventoryItem', () => {
  it('maps every camelCase field to its snake_case API shape', async () => {
    mockApiFetch.mockResolvedValue({});
    await createInventoryItem({
      listingId: 'listing-1',
      stockQuantity: 10,
      unit: 'kg',
      purchaseCost: 50,
      sellingPrice: 80,
      minStockThreshold: 5,
    });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/inventory', {
      method: 'POST',
      body: {
        listing_id: 'listing-1',
        stock_quantity: 10,
        unit: 'kg',
        purchase_cost: 50,
        selling_price: 80,
        min_stock_threshold: 5,
      },
    });
  });
});

describe('updateInventoryItem', () => {
  it('omits fields the caller did not set, so a partial edit stays partial', async () => {
    mockApiFetch.mockResolvedValue({});
    await updateInventoryItem('item-1', { unit: 'bag' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/inventory/item-1', {
      method: 'PATCH',
      body: { unit: 'bag' },
    });
  });

  it('includes explicit null values (distinct from "not provided")', async () => {
    mockApiFetch.mockResolvedValue({});
    await updateInventoryItem('item-1', { listingId: null, purchaseCost: null });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/inventory/item-1', {
      method: 'PATCH',
      body: { listing_id: null, purchase_cost: null },
    });
  });
});

describe('deleteInventoryItem', () => {
  it('DELETEs the item', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await deleteInventoryItem('item-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/inventory/item-1', { method: 'DELETE' });
  });
});

describe('adjustStock', () => {
  it('POSTs the movement type/quantity/notes', async () => {
    mockApiFetch.mockResolvedValue({});
    await adjustStock('item-1', 'restock', 20, 'weekly delivery');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/inventory/item-1/adjust', {
      method: 'POST',
      body: { type: 'restock', quantity: 20, notes: 'weekly delivery' },
    });
  });
});
