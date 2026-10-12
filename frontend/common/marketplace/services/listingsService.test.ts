import type { PickedPhoto } from '../../../utils/photoPicker';
import { apiFetch } from '../../../services/api/client';

jest.mock('../../../services/api/client');
jest.mock('../../../services/supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual(
    '../../../testUtils/supabaseMock',
  );
  return { supabase: makeSupabaseMock() };
});

import { supabase } from '../../../services/supabase/client';
import { makeSupabaseMock } from '../../../testUtils/supabaseMock';
import {
  createCategory,
  createListing,
  deleteCategory,
  deleteListing,
  fetchAllListingsForModeration,
  fetchCategories,
  fetchCrops,
  fetchListingById,
  fetchListingViewCounts,
  fetchListings,
  recordListingView,
  updateCategory,
  updateListing,
  updateListingStatus,
  uploadListingImages,
} from './listingsService';

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedSupabase = supabase as unknown as ReturnType<
  typeof makeSupabaseMock
>;

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    } as never),
  ) as never;
});

describe('fetchListings', () => {
  it('maps every camelCase filter to its snake_case query param', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchListings({
      categoryId: 'cat-1',
      search: 'wheat',
      minPrice: 10,
      maxPrice: 100,
      sellerRole: 'farmer',
      city: 'Lahore',
      cropName: 'Wheat',
      page: 2,
      ownerId: 'owner-1',
    });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/marketplace/listings', {
      query: {
        category_id: 'cat-1',
        search: 'wheat',
        min_price: 10,
        max_price: 100,
        seller_role: 'farmer',
        city: 'Lahore',
        crop_name: 'Wheat',
        page: 2,
        owner_id: 'owner-1',
      },
    });
  });

  it('defaults to an empty filter set', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchListings();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/marketplace/listings', {
      query: {
        category_id: undefined,
        search: undefined,
        min_price: undefined,
        max_price: undefined,
        seller_role: undefined,
        city: undefined,
        crop_name: undefined,
        page: undefined,
        owner_id: undefined,
      },
    });
  });
});

describe('reads', () => {
  it('fetchListingById fetches a single listing', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchListingById('listing-1');
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/marketplace/listings/listing-1',
    );
  });

  it('fetchCategories fetches all categories', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchCategories();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/marketplace/categories');
  });

  it('fetchCrops fetches all crops', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchCrops();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/marketplace/crops');
  });

  it('fetchAllListingsForModeration fetches the moderation queue', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchAllListingsForModeration();
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/marketplace/listings/moderation',
    );
  });
});

describe('categories CRUD', () => {
  it('createCategory POSTs the input as-is', async () => {
    mockApiFetch.mockResolvedValue({});
    await createCategory({ name: 'Seeds', slug: 'seeds', icon: 'sprout' });
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/marketplace/categories',
      {
        method: 'POST',
        body: { name: 'Seeds', slug: 'seeds', icon: 'sprout' },
      },
    );
  });

  it('updateCategory PATCHes a partial input', async () => {
    mockApiFetch.mockResolvedValue({});
    await updateCategory('cat-1', { name: 'Renamed' });
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/marketplace/categories/cat-1',
      {
        method: 'PATCH',
        body: { name: 'Renamed' },
      },
    );
  });

  it('deleteCategory DELETEs the category', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await deleteCategory('cat-1');
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/marketplace/categories/cat-1',
      { method: 'DELETE' },
    );
  });
});

describe('listings CRUD', () => {
  const listingInput = {
    title: 'Fresh wheat',
    description: 'Grade A',
    categoryId: 'cat-1',
    price: 100,
    unit: 'kg',
    quantity: 50,
    images: ['https://example.com/a.jpg'],
    brand: 'FarmCo',
    condition: 'new',
    cropCompatibility: ['wheat'],
    country: 'Pakistan',
    province: 'Punjab',
    city: 'Lahore',
  };

  it('createListing maps every field to its API shape', async () => {
    mockApiFetch.mockResolvedValue({});
    await createListing(listingInput);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/marketplace/listings', {
      method: 'POST',
      body: {
        title: 'Fresh wheat',
        description: 'Grade A',
        category_id: 'cat-1',
        price: 100,
        unit: 'kg',
        quantity: 50,
        images: ['https://example.com/a.jpg'],
        brand: 'FarmCo',
        condition: 'new',
        crop_compatibility: ['wheat'],
        country: 'Pakistan',
        province: 'Punjab',
        city: 'Lahore',
      },
    });
  });

  it('updateListing omits fields the caller did not set', async () => {
    mockApiFetch.mockResolvedValue({});
    await updateListing('listing-1', { price: 120 });
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/marketplace/listings/listing-1',
      {
        method: 'PATCH',
        body: { price: 120 },
      },
    );
  });

  it('createListing sends the inventory product link when one is chosen (D8)', async () => {
    mockApiFetch.mockResolvedValue({});
    await createListing({ ...listingInput, inventoryProductId: 'product-1' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/marketplace/listings', {
      method: 'POST',
      body: expect.objectContaining({ inventory_product_id: 'product-1' }),
    });
  });

  it.each([
    [
      'moves the link to another product',
      'product-2',
      { inventory_product_id: 'product-2' },
    ],
    [
      'clears the link with an explicit null',
      null,
      { inventory_product_id: null },
    ],
  ])('updateListing %s', async (_name, inventoryProductId, body) => {
    mockApiFetch.mockResolvedValue({});
    await updateListing('listing-1', { inventoryProductId });
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/marketplace/listings/listing-1',
      { method: 'PATCH', body },
    );
  });

  it('updateListing leaves the link out when the caller did not set it, so the server keeps it', async () => {
    mockApiFetch.mockResolvedValue({});
    await updateListing('listing-1', { title: 'Urea 50kg' });
    const options = mockApiFetch.mock.calls[0]?.[1];
    expect(options?.body).toEqual({ title: 'Urea 50kg' });
    expect(options?.body).not.toHaveProperty('inventory_product_id');
  });

  it('deleteListing DELETEs the listing', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await deleteListing('listing-1');
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/marketplace/listings/listing-1',
      { method: 'DELETE' },
    );
  });

  it('updateListingStatus PATCHes only the status, no actorId', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await updateListingStatus('listing-1', 'inactive');
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/marketplace/listings/listing-1/status',
      {
        method: 'PATCH',
        body: { status: 'inactive' },
      },
    );
  });
});

describe('recordListingView', () => {
  it('POSTs a view with no explicit viewerId', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await recordListingView('listing-1');
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/marketplace/listings/listing-1/views',
      { method: 'POST' },
    );
  });
});

describe('fetchListingViewCounts', () => {
  it('short-circuits to an empty object without calling the API for an empty id list', async () => {
    const result = await fetchListingViewCounts([]);
    expect(result).toEqual({});
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('POSTs the id list otherwise', async () => {
    mockApiFetch.mockResolvedValue({ 'listing-1': 5 });
    const result = await fetchListingViewCounts(['listing-1']);
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/marketplace/listings/view-counts',
      {
        method: 'POST',
        body: { listing_ids: ['listing-1'] },
      },
    );
    expect(result).toEqual({ 'listing-1': 5 });
  });
});

describe('uploadListingImages', () => {
  const withUri = (uri: string): PickedPhoto => ({
    uri,
    fileName: `${uri}.jpg`,
    mimeType: 'image/jpeg',
  });

  it('uploads every image with a uri and returns a public URL derived from its own path', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      upload: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      getPublicUrl: jest.fn((path: string) => ({
        data: { publicUrl: `https://example.com/${path}` },
      })),
    } as never);

    const urls = await uploadListingImages('user-1', [
      withUri('a'),
      withUri('b'),
    ]);

    expect(urls).toHaveLength(2);
    urls.forEach(url =>
      expect(url).toMatch(/^https:\/\/example\.com\/user-1\/\d+-\d+\.jpg$/),
    );
    expect(urls[0]).not.toEqual(urls[1]);
  });

  it('skips assets with no uri', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      upload: jest.fn(() =>
        Promise.resolve({ data: { path: 'mock' }, error: null }),
      ),
      getPublicUrl: jest.fn(() => ({
        data: { publicUrl: 'https://example.com/image.jpg' },
      })),
    } as never);

    const urls = await uploadListingImages('user-1', [
      { uri: '' },
      withUri('a'),
    ]);

    expect(urls).toEqual(['https://example.com/image.jpg']);
  });

  it('throws if any single upload fails', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      upload: jest.fn(() =>
        Promise.resolve({
          data: null,
          error: new Error('storage quota exceeded'),
        }),
      ),
      getPublicUrl: jest.fn(),
    } as never);

    await expect(uploadListingImages('user-1', [withUri('a')])).rejects.toThrow(
      'storage quota exceeded',
    );
  });
});
