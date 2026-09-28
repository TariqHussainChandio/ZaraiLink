import { apiFetch } from '../../services/api/client';
import { createSupplier, deleteSupplier, fetchSupplierById, fetchSuppliers, updateSupplier } from './supplierService';

jest.mock('../../services/api/client');

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reads', () => {
  it('fetchSuppliers fetches the caller-scoped list', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchSuppliers();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/suppliers');
  });

  it('fetchSupplierById fetches a single supplier', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchSupplierById('supplier-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/suppliers/supplier-1');
  });
});

describe('createSupplier', () => {
  it('maps every field to its snake_case API shape', async () => {
    mockApiFetch.mockResolvedValue({});
    await createSupplier({
      name: 'Seed Co',
      contact: '+923001234567',
      productsSupplied: 'Wheat seeds',
      notes: 'Reliable',
      status: 'active',
    });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/suppliers', {
      method: 'POST',
      body: {
        name: 'Seed Co',
        contact: '+923001234567',
        products_supplied: 'Wheat seeds',
        notes: 'Reliable',
        status: 'active',
      },
    });
  });
});

describe('updateSupplier', () => {
  it('omits fields the caller did not set', async () => {
    mockApiFetch.mockResolvedValue({});
    await updateSupplier('supplier-1', { notes: 'Updated notes' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/suppliers/supplier-1', {
      method: 'PATCH',
      body: { notes: 'Updated notes' },
    });
  });
});

describe('deleteSupplier', () => {
  it('DELETEs the supplier', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await deleteSupplier('supplier-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/suppliers/supplier-1', { method: 'DELETE' });
  });
});
