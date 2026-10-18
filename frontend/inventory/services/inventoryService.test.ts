import { apiFetch } from '../../services/api/client';
import {
  cancelPurchase,
  createLocation,
  createProduct,
  createPurchase,
  fetchMovements,
  fetchProducts,
  fetchPurchases,
  fetchStock,
  fetchSuppliers,
  linkListing,
  postAdjustment,
  postStockIn,
  postStockOut,
  postTransfer,
  receivePurchase,
  removeLocation,
  saveAlertSettings,
  unlinkListing,
  updateLocation,
  updatePurchase,
} from './inventoryService';

jest.mock('../../services/api/client');

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ id: 'x' });
});

const stockIn = { product_id: 'p1', location_id: 'l1', quantity: 5, reason: null };

describe('inventoryService paths', () => {
  it('reads products with inactive ones only when asked', async () => {
    await fetchProducts(true);
    await fetchProducts();
    expect(mockApiFetch).toHaveBeenNthCalledWith(1, '/api/v1/inventory/products', { query: { include_inactive: true } });
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, '/api/v1/inventory/products', { query: { include_inactive: undefined } });
  });

  it('repeats `source` once per value on the path and sends the other filters as query', async () => {
    await fetchMovements({ sources: ['LOCAL_SALE', 'DAMAGE'], productId: 'p1', from: '2026-10-01' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/inventory/movements?source=LOCAL_SALE&source=DAMAGE', {
      query: { product_id: 'p1', location_id: undefined, direction: undefined, from: '2026-10-01', to: undefined },
    });
  });

  it('reads movements with no source filter on a bare path', async () => {
    await fetchMovements();
    expect(mockApiFetch.mock.calls[0]?.[0]).toBe('/api/v1/inventory/movements');
  });

  it('reads stock for one location, suppliers including inactive ones, purchases by status', async () => {
    await fetchStock({ locationId: 'l1' });
    await fetchSuppliers();
    await fetchPurchases('draft');
    expect(mockApiFetch).toHaveBeenNthCalledWith(1, '/api/v1/inventory/stock', { query: { location_id: 'l1', product_id: undefined } });
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, '/api/v1/inventory/suppliers', { query: { include_inactive: true } });
    expect(mockApiFetch).toHaveBeenNthCalledWith(3, '/api/v1/inventory/purchases', { query: { status: 'draft' } });
  });

  it('writes products, locations, listing links, purchases and settings to their routes', async () => {
    await createProduct({ name: 'Urea', sku: 'U', unit: 'bag' } as never);
    await createLocation({ name: 'Godown', kind: 'godown' } as never);
    await updateLocation('l 1', { is_default: true });
    await removeLocation('l1');
    await linkListing('p1', 'listing-1');
    await unlinkListing('p1', 'listing-1');
    await updatePurchase('pur-1', { reference: 'INV-9' });
    await receivePurchase('pur-1');
    await cancelPurchase('pur-1');
    await saveAlertSettings({ default_reorder_threshold: 4, notify_low_stock: true, notify_sync_failure: false });
    const calls = mockApiFetch.mock.calls.map(([path, options]) => [path, options?.method]);
    expect(calls).toEqual([
      ['/api/v1/inventory/products', 'POST'],
      ['/api/v1/inventory/locations', 'POST'],
      ['/api/v1/inventory/locations/l%201', 'PATCH'],
      ['/api/v1/inventory/locations/l1', 'DELETE'],
      ['/api/v1/inventory/products/p1/listings', 'POST'],
      ['/api/v1/inventory/products/p1/listings/listing-1', 'DELETE'],
      ['/api/v1/inventory/purchases/pur-1', 'PATCH'],
      ['/api/v1/inventory/purchases/pur-1/receive', 'POST'],
      ['/api/v1/inventory/purchases/pur-1/cancel', 'POST'],
      ['/api/v1/inventory/alerts/settings', 'PUT'],
    ]);
    expect(mockApiFetch.mock.calls[4]?.[1]?.body).toEqual({ listing_id: 'listing-1' });
  });
});

// B2 verification F8 and B4 verification F2: a retried stock write must be recorded once. The API honours an optional
// Idempotency-Key on exactly these five routes; each sends the key it is given (the form entry's, hooks/entryKey.ts).
describe('Idempotency-Key on the stock writes', () => {
  const writes = [
    ['stock in', (key: string) => postStockIn(stockIn, key), '/api/v1/inventory/movements/stock-in'],
    ['stock out', (key: string) => postStockOut({ ...stockIn, source: 'LOCAL_SALE' }, key), '/api/v1/inventory/movements/stock-out'],
    [
      'adjustment',
      (key: string) => postAdjustment({ ...stockIn, direction: 'out', reason: 'Count' }, key),
      '/api/v1/inventory/movements/adjustment',
    ],
    [
      'transfer',
      (key: string) =>
        postTransfer({ product_id: 'p1', from_location_id: 'l1', to_location_id: 'l2', quantity: 2, reason: null }, key),
      '/api/v1/inventory/stock/transfer',
    ],
    ['purchase create', (key: string) => createPurchase({ supplier_id: null, items: [] }, key), '/api/v1/inventory/purchases'],
  ] as const;

  it.each(writes)('%s sends the entry’s key with its POST', async (_name, write, path) => {
    await write('zl-entry-1');
    expect(mockApiFetch).toHaveBeenCalledWith(path, expect.objectContaining({ method: 'POST', idempotencyKey: 'zl-entry-1' }));
  });

  it('a changed body after a lost response still carries the first key (the key is the entry’s, not the payload’s)', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network lost')).mockResolvedValue({ id: 'm' });
    await expect(postStockIn(stockIn, 'zl-entry-1')).rejects.toThrow('network lost');
    await postStockIn({ ...stockIn, reason: 'edited note' }, 'zl-entry-1');
    expect(mockApiFetch.mock.calls.map(call => call[1]?.idempotencyKey)).toEqual(['zl-entry-1', 'zl-entry-1']);
  });

  it('edits of a draft purchase and settings carry no key (the API takes none there)', async () => {
    await updatePurchase('pur-1', { notes: 'n' });
    await saveAlertSettings({ default_reorder_threshold: 1, notify_low_stock: false, notify_sync_failure: false });
    for (const call of mockApiFetch.mock.calls) expect(call[1]?.idempotencyKey).toBeUndefined();
  });
});
