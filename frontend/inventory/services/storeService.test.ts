import { apiFetch } from '../../services/api/client';
import { createStore, deleteStore, fetchStoreById, fetchStores, updateStore } from './storeService';

jest.mock('../../services/api/client');

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reads', () => {
  it('fetchStores fetches the caller-scoped list', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchStores();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/stores');
  });

  it('fetchStoreById fetches a single store', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchStoreById('store-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/stores/store-1');
  });
});

describe('createStore', () => {
  it('maps every field to its snake_case API shape', async () => {
    mockApiFetch.mockResolvedValue({});
    await createStore({
      name: 'Main Branch',
      address: '123 Main St',
      contact: '+923001234567',
      openingInfo: '9am-5pm',
      status: 'active',
      country: 'Pakistan',
      province: 'Punjab',
      city: 'Lahore',
    });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/stores', {
      method: 'POST',
      body: {
        name: 'Main Branch',
        address: '123 Main St',
        contact: '+923001234567',
        opening_info: '9am-5pm',
        status: 'active',
        country: 'Pakistan',
        province: 'Punjab',
        city: 'Lahore',
      },
    });
  });
});

describe('updateStore', () => {
  it('omits fields the caller did not set', async () => {
    mockApiFetch.mockResolvedValue({});
    await updateStore('store-1', { status: 'inactive' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/stores/store-1', {
      method: 'PATCH',
      body: { status: 'inactive' },
    });
  });
});

describe('deleteStore', () => {
  it('DELETEs the store', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await deleteStore('store-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/stores/store-1', { method: 'DELETE' });
  });
});
