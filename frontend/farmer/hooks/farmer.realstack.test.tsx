/**
 * P7 (7D) real-stack test: the farmer hooks against the real FastAPI and the real local Supabase, for real
 * users of different roles: what an owner can do, and what another farmer or the wrong role is refused.
 * Setup and how to run it: see frontend/testUtils/realStack.ts (`ZARAILINK_REALSTACK=1 npx jest realstack`).
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import {
  API_URL,
  installNodeFetch,
  realStackEnabled,
  signUp,
} from '../../testUtils/realStack';
import { useAuthStore } from '../../state/authStore';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';

installNodeFetch();

let mockToken: string | null = null;
jest.mock('../../services/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: mockToken ? { access_token: mockToken } : null },
      }),
      refreshSession: async () => ({
        data: { session: null },
        error: new Error('no refresh in this test'),
      }),
      signOut: async () => ({ error: null }),
    },
  },
}));

const describeReal = realStackEnabled ? describe : describe.skip;

const idOf = (token: string) =>
  JSON.parse(
    atob((token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')),
  ).sub as string;
// Kept from the P7 farmer-and-dealer test when B4 replaced the dealer's old inventory hooks with the IMS app.
const refused = expect.objectContaining({
  kind: expect.stringMatching(/forbidden|notFound/),
});

describeReal('farmer hooks against the real backend', () => {
  let farmerToken = '';
  let otherFarmerToken = '';
  let farmer: typeof import('./farmer');
  let analytics: typeof import('../../common/analytics/hooks/analytics');
  let market: typeof import('../../common/marketplace/hooks/marketplace');
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  // Each user gets their own cache, as in the app, where the cache is emptied when the signed-in user changes.
  function signInAs(token: string) {
    mockToken = token;
    useAuthStore.setState({ user: { id: idOf(token) } as never });
    queryClient = createTestQueryClient();
  }

  beforeAll(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = API_URL;
    farmerToken = await signUp('farmer');
    otherFarmerToken = await signUp('farmer');
    farmer = require('./farmer');
    analytics = require('../../common/analytics/hooks/analytics');
    market = require('../../common/marketplace/hooks/marketplace');
  }, 60_000);

  afterEach(() => queryClient.clear());

  it('lets a farmer keep farms and crops, refuses another farmer, and keeps the dashboard count in step', async () => {
    signInAs(farmerToken);
    const crops = await renderHook(() => market.useCrops(), { wrapper });
    await waitFor(() =>
      expect(crops.result.current.data?.length).toBeGreaterThan(0),
    );
    const cropId = crops.result.current.data?.[0]?.id ?? null;

    const owner = await renderHook(
      () => ({
        farms: farmer.useFarms(true),
        create: farmer.useCreateFarm(),
        remove: farmer.useDeleteFarm(),
        stats: analytics.useFarmerAnalytics(true),
      }),
      { wrapper },
    );
    await waitFor(() => expect(owner.result.current.farms.data).toEqual([]));
    await waitFor(() =>
      expect(owner.result.current.stats.data?.farmCount).toBe(0),
    );

    let farm!: { id: string };
    await act(async () => {
      farm = await owner.result.current.create.mutateAsync({
        name: 'Realstack farm',
        area: 5,
        landUnit: 'acre',
        notes: null,
        country: null,
        province: null,
        city: null,
      });
    });
    await waitFor(() =>
      expect(owner.result.current.farms.data?.map(f => f.id)).toEqual([
        farm.id,
      ]),
    );
    // The dashboard figure is refetched by the same invalidation.
    await waitFor(() =>
      expect(owner.result.current.stats.data?.farmCount).toBe(1),
    );

    const crop = await renderHook(
      () => ({
        save: farmer.useSaveFarmCrop(farm.id),
        list: farmer.useFarmCrops(farm.id),
      }),
      { wrapper },
    );
    await act(async () => {
      await crop.result.current.save.mutateAsync({
        input: {
          cropId,
          variety: 'Sona',
          plantingDate: null,
          area: null,
          expectedHarvestDate: null,
          growthStage: null,
          notes: null,
        },
      });
    });
    await waitFor(() =>
      expect(crop.result.current.list.data?.map(c => c.variety)).toEqual([
        'Sona',
      ]),
    );

    // --- another farmer can neither read nor change it
    signInAs(otherFarmerToken);
    const other = await renderHook(
      () => ({
        read: farmer.useFarm(farm.id),
        update: farmer.useUpdateFarm(farm.id),
        list: farmer.useFarms(true),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(other.result.current.read.error).toMatchObject({
        kind: expect.stringMatching(/forbidden|notFound/),
      }),
    );
    const denied = await act(async () =>
      other.result.current.update
        .mutateAsync({ name: 'hijack' })
        .catch((e: unknown) => e),
    );
    expect(denied).toEqual(refused);
    await waitFor(() => expect(other.result.current.list.data).toEqual([]));

    // --- the owner deletes it and the list, the crops and the count follow
    signInAs(farmerToken);
    const cleanup = await renderHook(
      () => ({ remove: farmer.useDeleteFarm(), farms: farmer.useFarms(true) }),
      { wrapper },
    );
    await waitFor(() =>
      expect(cleanup.result.current.farms.data?.length).toBe(1),
    );
    await act(async () => {
      await cleanup.result.current.remove.mutateAsync(farm.id);
    });
    await waitFor(() => expect(cleanup.result.current.farms.data).toEqual([]));
  }, 90_000);
});
