import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { ApiError } from '../../../services/api/errors';
import { createTestQueryClient } from '../../../testUtils/renderWithProviders';
import { queryKeys } from '../../../hooks/keys';
import { useCreateListing, useDeleteListing, useListings, useMyListings } from './marketplace';
import {
  createListing,
  deleteListing,
  fetchListings,
  uploadListingImages,
} from '../services/listingsService';

jest.mock('../services/listingsService');

const mockFetchListings = fetchListings as jest.Mock;
const mockCreateListing = createListing as jest.Mock;
const mockDeleteListing = deleteListing as jest.Mock;
const mockUpload = uploadListingImages as jest.Mock;

const page = (...ids: string[]) => ids.map(id => ({ id }));

const clients: QueryClient[] = [];

function setup() {
  const queryClient = createTestQueryClient();
  clients.push(queryClient);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

afterEach(() => {
  jest.resetAllMocks();
  clients.splice(0).forEach(client => client.clear());
});

describe('useListings', () => {
  it('asks for the next page number and stops when a page comes back empty', async () => {
    mockFetchListings.mockResolvedValueOnce(page('a', 'b')).mockResolvedValueOnce(page('c')).mockResolvedValueOnce([]);
    const { wrapper } = setup();
    const { result } = await renderHook(() => useListings({ search: 'urea' }), { wrapper });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(mockFetchListings).toHaveBeenLastCalledWith({ search: 'urea', page: 0 });

    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));
    expect(mockFetchListings.mock.calls.map(call => call[0].page)).toEqual([0, 1, 2]);
    expect(result.current.data?.pages.flat().map(l => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a separate cache entry per filter set', async () => {
    mockFetchListings.mockResolvedValue(page('a'));
    const { wrapper, queryClient } = setup();
    const { rerender, result } = await renderHook((props: { search: string }) => useListings({ search: props.search }), {
      wrapper,
      initialProps: { search: 'urea' },
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    await rerender({ search: 'wheat' });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(queryClient.getQueryCache().findAll({ queryKey: ['marketplace', 'listings'] })).toHaveLength(2);
  });

  it('keeps showing the cached feed when a refetch fails, and reports the error', async () => {
    mockFetchListings.mockResolvedValueOnce(page('a'));
    const { wrapper, queryClient } = setup();
    const { result } = await renderHook(() => useListings({}), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    mockFetchListings.mockRejectedValueOnce(
      new ApiError({ status: 0, code: 'network', kind: 'network', message: 'offline' }),
    );
    await act(async () => {
      await result.current.refetch();
    });
    // Read the cache itself: it is what the screen renders from, and it must still hold the last good copy.
    const state = queryClient.getQueryState(queryKeys.marketplace.listings({}));
    expect(state?.status).toBe('error');
    expect(state?.error).toMatchObject({ code: 'network' });
    expect(state?.data).toBeDefined();
    expect(queryClient.getQueryData<{ pages: { id: string }[][] }>(queryKeys.marketplace.listings({}))?.pages.flat()).toEqual([{ id: 'a' }]);
  });
});

describe('listing writes', () => {
  it('refetches the feed and the owner list after a listing is created, with the photos uploaded first', async () => {
    mockFetchListings.mockResolvedValue(page('a'));
    mockUpload.mockResolvedValue(['https://cdn.example.com/1.jpg']);
    mockCreateListing.mockResolvedValue({ id: 'new' });
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({ feed: useListings({}), mine: useMyListings('user-1'), create: useCreateListing() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.mine.data).toBeDefined());
    const callsBefore = mockFetchListings.mock.calls.length;

    await act(async () => {
      await result.current.create.mutateAsync({
        userId: 'user-1',
        images: [{ uri: 'file://1.jpg' } as never],
        input: { title: 'Seeds' } as never,
      });
    });

    expect(mockUpload).toHaveBeenCalledWith('user-1', [{ uri: 'file://1.jpg' }]);
    expect(mockCreateListing).toHaveBeenCalledWith({ title: 'Seeds', images: ['https://cdn.example.com/1.jpg'] });
    await waitFor(() => expect(mockFetchListings.mock.calls.length).toBeGreaterThanOrEqual(callsBefore + 2));
  });

  it('does not refetch anything when the write fails', async () => {
    mockFetchListings.mockResolvedValue(page('a'));
    mockDeleteListing.mockRejectedValue(new Error('nope'));
    const { wrapper, queryClient } = setup();
    const { result } = await renderHook(() => ({ mine: useMyListings('user-1'), del: useDeleteListing() }), { wrapper });
    await waitFor(() => expect(result.current.mine.data).toBeDefined());
    const callsBefore = mockFetchListings.mock.calls.length;

    await act(async () => {
      await result.current.del.mutateAsync('listing-1').catch(() => undefined);
    });
    expect(mockFetchListings.mock.calls.length).toBe(callsBefore);
    expect(queryClient.getQueryState(queryKeys.marketplace.myListings('user-1'))?.isInvalidated).toBe(false);
  });

  it('does not query for the owner list until the user is known', () => {
    const { wrapper } = setup();
    renderHook(() => useMyListings(undefined), { wrapper });
    expect(mockFetchListings).not.toHaveBeenCalled();
  });
});
