import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';
import { fetchLocations } from '../services/inventoryService';
import { godown, location, signInApprovedDealer } from '../testUtils/fixtures';
import { useSelectedLocation } from './location';

jest.mock('../services/inventoryService', () => ({ fetchLocations: jest.fn() }));

const mockFetchLocations = fetchLocations as jest.Mock;

let client = createTestQueryClient();

// One client per test, kept across re-renders, as the app keeps one.
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  client = createTestQueryClient();
  mockFetchLocations.mockReset();
  await signInApprovedDealer('dealer-a');
});

describe('useSelectedLocation', () => {
  it('starts at the default location and offers only active ones', async () => {
    mockFetchLocations.mockResolvedValue([godown(), location(), godown({ id: 'loc-old', name: 'Old', is_active: false })]);
    const { result } = await renderHook(() => useSelectedLocation(), { wrapper });
    await waitFor(() => expect(result.current.location?.id).toBe('loc-shop'));
    expect(result.current.locations.map(item => item.id)).toEqual(['loc-godown', 'loc-shop']);
  });

  it('keeps the dealer’s choice, and another account on the phone does not inherit it', async () => {
    mockFetchLocations.mockResolvedValue([location(), godown()]);
    const { result } = await renderHook(() => useSelectedLocation(), { wrapper });
    await waitFor(() => expect(result.current.location?.id).toBe('loc-shop'));
    await act(async () => result.current.select('loc-godown'));
    expect(result.current.location?.id).toBe('loc-godown');

    await signInApprovedDealer('dealer-b');
    await waitFor(() => expect(result.current.location?.id).toBe('loc-shop'));
  });

  it('falls back to the default when the chosen location was removed', async () => {
    mockFetchLocations.mockResolvedValue([location(), godown()]);
    const { result, rerender } = await renderHook(() => useSelectedLocation(), { wrapper });
    await waitFor(() => expect(result.current.location).not.toBeNull());
    await act(async () => result.current.select('loc-gone'));
    await rerender({});
    expect(result.current.location?.id).toBe('loc-shop');
  });
});
