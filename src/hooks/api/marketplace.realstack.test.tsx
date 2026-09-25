/**
 * P7 (7C) real-stack test: the marketplace query hooks against the real FastAPI and the real local Supabase.
 * Setup and how to run it: see src/testUtils/realStack.ts (`ZARAILINK_REALSTACK=1 npx jest realstack`).
 *
 * It proves what the mocked screen tests cannot: that the hooks, the services and the client agree with the real
 * API on shapes, paging, errors and permissions, for two different users (the owner and a stranger).
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { API_URL, installNodeFetch, realStackEnabled, signUp } from '../../testUtils/realStack';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';
import type { ApiError } from '../../services/api/errors';

installNodeFetch();

// The token the (real) client will attach; each test says which real user is calling.
let mockToken: string | null = null;
jest.mock('../../services/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockToken ? { access_token: mockToken } : null } }),
      refreshSession: async () => ({ data: { session: null }, error: new Error('no refresh in this test') }),
      signOut: async () => ({ error: null }),
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  },
}));

const describeReal = realStackEnabled ? describe : describe.skip;

describeReal('marketplace hooks against the real backend', () => {
  let farmerToken = '';
  let buyerToken = '';
  let farmerId = '';
  let hooks: typeof import('./marketplace');
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeAll(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = API_URL;
    farmerToken = await signUp('farmer');
    buyerToken = await signUp('buyer');
    farmerId = JSON.parse(atob((farmerToken.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'))).sub as string;
    // Loaded only now so the client reads the base URL set above.
    hooks = require('./marketplace');
  }, 60_000);

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });
  afterEach(() => queryClient.clear());

  it('lists categories and crops from the real reference data', async () => {
    mockToken = buyerToken;
    const { result } = await renderHook(() => ({ categories: hooks.useCategories(), crops: hooks.useCrops() }), { wrapper });
    await waitFor(() => expect(result.current.categories.data?.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.crops.data?.length).toBeGreaterThan(0));
    expect(result.current.categories.data?.[0]).toEqual(expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }));
  });

  it('creates, reads, updates and deletes a listing through the hooks, and the feed follows each change', async () => {
    mockToken = farmerToken;
    const title = `Realstack wheat ${Date.now()}`;
    const { result } = await renderHook(
      () => ({
        mine: hooks.useMyListings(farmerId),
        create: hooks.useCreateListing(),
        update: hooks.useUpdateListing(),
        remove: hooks.useDeleteListing(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.mine.data).toEqual([]));

    const input = {
      title,
      description: 'Real stack listing',
      categoryId: null,
      price: 120,
      unit: 'kg',
      quantity: 40,
      brand: null,
      condition: null,
      cropCompatibility: [],
      country: null,
      province: null,
      city: null,
    };
    let created!: { id: string };
    await act(async () => {
      created = await result.current.create.mutateAsync({ userId: farmerId, images: [], input });
    });
    // The create invalidated the owner list, which refetches on its own.
    await waitFor(() => expect(result.current.mine.data?.map(l => l.title)).toEqual([title]));

    // A second, unrelated user sees it in the feed and can read it (public listing), with the seller embedded.
    mockToken = buyerToken;
    const buyer = await renderHook(() => ({ feed: hooks.useListings({ search: title }), one: hooks.useListing(created.id) }), {
      wrapper,
    });
    await waitFor(() => expect(buyer.result.current.feed.data?.pages.flat().map(l => l.id)).toEqual([created.id]));
    await waitFor(() => expect(buyer.result.current.one.data).toMatchObject({ id: created.id, title, price: 120 }));

    // The stranger may not change it: the real API answers 403/404 and the hook surfaces a typed ApiError.
    const stranger = await renderHook(() => hooks.useUpdateListing(), { wrapper });
    const denied = await act(async () =>
      stranger.result.current.mutateAsync({ id: created.id, userId: 'x', newImages: [], existingImages: [], input: { ...input, title: 'hijack' } }).catch((e: ApiError) => e),
    );
    expect(denied).toMatchObject({ kind: expect.stringMatching(/forbidden|notFound/) });

    // The owner updates it; the price change reaches the owner's list.
    mockToken = farmerToken;
    await act(async () => {
      await result.current.update.mutateAsync({ id: created.id, userId: farmerId, newImages: [], existingImages: [], input: { ...input, price: 150 } });
    });
    await waitFor(() => expect(result.current.mine.data?.[0]?.price).toBe(150));

    await act(async () => {
      await result.current.remove.mutateAsync(created.id);
    });
    await waitFor(() => expect(result.current.mine.data).toEqual([]));

    mockToken = buyerToken;
    const gone = await renderHook(() => hooks.useListing(created.id), { wrapper });
    await waitFor(() => expect(gone.result.current.error).toMatchObject({ code: 'not_found', kind: 'notFound' }));
  }, 60_000);

  it('answers a stranger asking for a listing that does not exist with a typed not_found error', async () => {
    mockToken = buyerToken;
    const { result } = await renderHook(() => hooks.useListing('00000000-0000-4000-8000-000000000000'), { wrapper });
    await waitFor(() => expect(result.current.error).toMatchObject({ status: 404, code: 'not_found' }));
  });
});
