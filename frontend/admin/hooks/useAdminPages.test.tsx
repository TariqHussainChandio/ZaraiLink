import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';
import { useAdminPages } from './useAdminPages';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
);

describe('useAdminPages', () => {
  it('reads a page at a time from where the last one ended', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({ data: ['a', 'b'], next: { limit: 2, offset: 2 } })
      .mockResolvedValueOnce({ data: ['c'], next: null });
    const { result } = await renderHook(() => useAdminPages(['t', 'paged'], fetchPage), { wrapper });

    await waitFor(() => expect(result.current.rows).toEqual(['a', 'b']));
    expect(result.current.hasNextPage).toBe(true);

    await result.current.fetchNextPage();

    await waitFor(() => expect(result.current.rows).toEqual(['a', 'b', 'c']));
    expect(fetchPage).toHaveBeenLastCalledWith(2);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('keeps asking until the list ends when told to load everything', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({ data: ['a'], next: { limit: 1, offset: 1 } })
      .mockResolvedValueOnce({ data: ['b'], next: { limit: 1, offset: 2 } })
      .mockResolvedValueOnce({ data: ['c'], next: null });
    const { result } = await renderHook(() => useAdminPages(['t', 'all'], fetchPage, { loadAll: true }), { wrapper });

    await waitFor(() => expect(result.current.rows).toEqual(['a', 'b', 'c']));
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('does not loop on a failing next page', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({ data: ['a'], next: { limit: 1, offset: 1 } })
      .mockRejectedValue(new Error('boom'));
    const { result } = await renderHook(() => useAdminPages(['t', 'fail'], fetchPage, { loadAll: true }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const calls = fetchPage.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(fetchPage.mock.calls.length).toBe(calls);
    expect(result.current.rows).toEqual(['a']);
  });
});
